export interface ParsedSms {
  method: 'bkash' | 'nagad' | 'rocket';
  txId: string | null;
  amount: number | null;
  senderPhone: string | null;
}

function extractPhone(text: string): string | null {
  // Match all BD phone numbers, return the first one that looks like a sender
  // "from 01XXXXXXXXX" or "01XXXXXXXXX sent" etc.
  const fromMatch = text.match(/from\s+(01[3-9]\d{8})/i) ||
    text.match(/(01[3-9]\d{8})\s+(?:sent|পাঠিয়েছেন|থেকে)/i);
  if (fromMatch) return fromMatch[1];
  const any = text.match(/01[3-9]\d{8}/);
  return any ? any[0] : null;
}

function extractAmount(text: string): number | null {
  // Matches many formats:
  // "Tk 500.00", "BDT 500", "500.00 Tk", "500.00 BDT", "৳500", "500 টাকা", "Taka 500"
  const m =
    text.match(/(?:Tk|BDT|TK|Taka|৳)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:Tk|BDT|TK|Taka|টাকা|৳)/i) ||
    text.match(/(?:received|পেয়েছেন|জমা)\s+(?:BDT\s*)?([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  return parseFloat(m[1].replace(/,/g, ''));
}

function parseBkash(text: string): ParsedSms | null {
  if (!/bkash|bKash|TrxID/i.test(text)) return null;

  // Personal received (Send Money):
  // "You have received Tk 500.00 from 01XXXXXXXXX. TrxID AB12345678."
  // "Congratulations! bKash account 01XXX received BDT 500 from 01YYY. TrxID AB12345678"
  // "01XXX, You have received Tk 500.00 from 01YYY TrxID AB12345678 at 12:00 AM..."
  // Bangla: "আপনার bKash একাউন্টে ৳500.00 জমা হয়েছে। প্রেরক: 01XXXXXXXXX। TrxID: AB12345678"

  const txMatch =
    text.match(/TrxID[:\s]+([A-Z0-9]{6,15})/i) ||
    text.match(/transaction\s*id[:\s]+([A-Z0-9]{6,15})/i);

  return {
    method: 'bkash',
    txId: txMatch ? txMatch[1].toUpperCase() : null,
    amount: extractAmount(text),
    senderPhone: extractPhone(text),
  };
}

function parseNagad(text: string): ParsedSms | null {
  if (!/nagad/i.test(text)) return null;

  // Personal received:
  // "Nagad: 500.00 Tk received from 01XXXXXXXXX. Reference: NAG1234567890."
  // "Apnar Nagad Account-e 500.00 Taka Cash In hoyeche. Sender: 01XXX Ref: ABC123"
  // "আপনার নগদ একাউন্টে ৳500.00 জমা হয়েছে। প্রেরক: 01XXX। Ref: NAG123"
  // "Nagad:500.00Tk Cash In from 01XXXXXXXXX Ref:ABC1234567890"

  const txMatch =
    text.match(/Ref(?:erence)?[:\s]+([A-Z0-9]{6,20})/i) ||
    text.match(/TrxID[:\s]+([A-Z0-9]{6,20})/i) ||
    text.match(/transaction[:\s]+([A-Z0-9]{6,20})/i);

  return {
    method: 'nagad',
    txId: txMatch ? txMatch[1].toUpperCase() : null,
    amount: extractAmount(text),
    senderPhone: extractPhone(text),
  };
}

function parseRocket(text: string): ParsedSms | null {
  if (!/rocket|dutch.?bangla|DBBL/i.test(text)) return null;

  // Personal received:
  // "BDT 500.00 has been received in your Rocket A/c from 01XXXXXXXXX. Ref: 1234567890"
  // "Dutch Bangla Mobile Banking: You received BDT500.00 from 01XXX. Ref No:1234567890"
  // "DBBL Mobile Banking: BDT 500 sent to your account from 01XXX. Reference: 1234567890"
  // Rocket TxIDs are usually numeric or alphanumeric

  const txMatch =
    text.match(/Ref(?:erence)?(?:\s*No)?[:\s]+([A-Z0-9]{6,20})/i) ||
    text.match(/TrxID[:\s]+([A-Z0-9]{6,20})/i) ||
    text.match(/transaction[:\s]+([A-Z0-9]{6,20})/i) ||
    // Rocket often has plain numeric ref
    text.match(/Ref[:\s]+(\d{8,15})/i);

  return {
    method: 'rocket',
    txId: txMatch ? txMatch[1].toUpperCase() : null,
    amount: extractAmount(text),
    senderPhone: extractPhone(text),
  };
}

export function parseSms(text: string): ParsedSms | null {
  return parseBkash(text) ?? parseNagad(text) ?? parseRocket(text);
}
