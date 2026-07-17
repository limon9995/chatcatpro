// Shared with webhook.service.ts's private extractTransactionId — kept here
// so WhatsApp's payment-screenshot handler can reuse the same Bkash/Nagad
// transaction-ID patterns without duplicating the regex.
export function extractTransactionId(text: string): string | null {
  if (!text) return null;

  // Priority patterns (labeled)
  const labeled = text.match(
    /(?:TrxID|Trx\s*ID|Transaction\s*ID|Trans(?:action)?\s*(?:ID|No\.?)|Ref(?:erence)?(?:\s*No\.?)?|Txn\s*(?:ID|No\.?))[:\s#]+([A-Z0-9]{6,20})/i,
  );
  if (labeled) return labeled[1].toUpperCase();

  // Bkash/Nagad style: 10-char alphanumeric block (uppercase letters + digits)
  const bkashStyle = text.match(/\b([A-Z]{2,}[0-9]{2,}[A-Z0-9]{4,})\b/);
  if (bkashStyle && bkashStyle[1].length >= 8 && bkashStyle[1].length <= 15)
    return bkashStyle[1].toUpperCase();

  return null;
}
