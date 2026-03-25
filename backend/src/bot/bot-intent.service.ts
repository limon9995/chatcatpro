import { Injectable } from '@nestjs/common';

@Injectable()
export class BotIntentService {
  private readonly KW = {
    size: ['size', 'সাইজ', 'body', 'kon size', 'ki size'],
    photo: ['photo', 'pic', 'picture', 'chobi', 'ছবি', 'image'],
    deliveryFee: [
      'delivery charge',
      'delivery fee',
      'charge koto',
      'ডেলিভারি চার্জ',
      'delivery cost',
      'courier charge',
      'dalivary charge',
    ],
    deliveryTime: [
      'delivery kobe',
      'kebe pabo',
      'koto din',
      'delivery time',
      'কবে পাব',
      'কত দিন',
      'koto dine',
      'kobe pabo',
    ],
    // Strong confirm — checked globally (not too generic)
    confirm: [
      'yes',
      'hea',
      'hum',
      'ji',
      'হ্যাঁ',
      'জি',
      'confirm',
      'thik ase',
      'hobe confirm',
      'order confirm',
      'ok confirm',
      'ha thik',
      'haa thik',
      'confirmed',
      'agree',
      'accept',
      'approved',
      'chalao',
      'chaliye dao',
      'ready',
      'all ok',
      'all good',
      'hoy',
      'hoi',
      'রাজি',
      'চলবে',
      'হবে',
      'ঠিক আছে হ্যাঁ',
    ],
    // Weak confirm — only checked when awaitingConfirm=true (order summary shown)
    confirmWeak: [
      // English
      'done',
      'ok',
      'okay',
      'okey',
      'okk',
      'okkk',
      'sure',
      'correct',
      'right',
      'perfect',
      'yep',
      'yap',
      'yeah',
      'yea',
      'yup',
      'cool',
      'great',
      'proceed',
      'go ahead',
      'fine',
      'noted',
      // Banglish
      'thik',
      'thik ache',
      'thik aache',
      'thik hache',
      'thik hoise',
      'ha',
      'haa',
      'hah',
      'hha',
      'send',
      'send koro',
      'send koren',
      'pathao',
      'pathiye den',
      'pathiye daw',
      'patha',
      'nao',
      'niye nao',
      'dao',
      'daw',
      'diye den',
      'diye dao',
      'order dao',
      'order de',
      'order daw',
      'order pathao',
      'hoye gese',
      'hoye geche',
      'hole nile',
      'dun',
      'dunn',
      'dibo',
      'dite chai',
      'kore dao',
      'kore den',
      'kore daw',
      'chalao',
      'chaliye',
      'nia jao',
      'niye jao',
      'proceed koro',
      'proceed koren',
      // Bengali
      'ঠিক',
      'ঠিক আছে',
      'ঠিক হয়েছে',
      'হ্যাঁ ঠিক',
      'পাঠাও',
      'পাঠান',
      'দিন',
      'দাও',
      'নাও',
      'নেব',
      'নিব',
      'রাজি',
      'চলবে',
      'হবে',
      'দিয়ে দিন',
      'করে দিন',
    ],
    cancel: [
      'cancel',
      'lagbe na',
      'বাতিল',
      'bad den',
      'thak',
      'cancel order',
      'nibo na',
      'order cancel',
      'na lagbe na',
      'cancel kore den',
      // new additions
      'no',
      'nope',
      'nah',
      'na',
      'na bhai',
      'na dada',
      'na apa',
      'dorkar nai',
      'dorkar nei',
      'দরকার নেই',
      'দরকার নাই',
      'chai na',
      'chaina',
      'lagbe na',
      'nibo na',
      'nebe na',
      'bad koro',
      'bad daw',
      'bad do',
      'maf koren',
      'maaf koren',
      'sob bad',
      'delete koro',
      'clear koro',
      'eta chai na',
      'oita chai na',
      'rakhe den',
      'thak thak',
      'jai',
      'jaak',
      'বাদ',
      'বাদ দিন',
      'বাদ দাও',
      'চাই না',
      'লাগবে না',
      'নেব না',
      'ক্যান্সেল',
      'মাফ করবেন',
    ],
    order: [
      // Banglish — order intent
      'nibo',
      'kinbo',
      'nebo',
      'lagbe',
      'order korbo',
      'order korte chai',
      'order korte cai',
      'order dite chai',
      'order dite cai',
      'order nibo',
      'order nite chai',
      'order nite cai',
      'order hobe',
      'order kora jabe',
      'order please',
      // typo variants
      'oder korbo',
      'oder korte cai',
      'oder korte chai',
      'oder dite cai',
      'oder nibo',
      'ordar korbo',
      'ordar korte cai',
      'ordar dite cai',
      'ordar nibo',
      'oda korte cai',
      'oda dite cai',
      'oda nibo',
      // buy/purchase
      'buy korbo',
      'buy korte cai',
      'buy korte chai',
      'purchase korbo',
      'kinte cai',
      'kinte chai',
      // confirm order
      'order confirm',
      'confirm korbo',
      'confirm korte cai',
      'book korbo',
      'booking dibo',
      // Bengali
      'অর্ডার করব',
      'অর্ডার করতে চাই',
      'অর্ডার দেব',
      'অর্ডার নেব',
      'কিনব',
      'নেব',
      'নিব',
      // common short forms
      'need this',
      'want this',
      'eta order korte chai',
      'eta nibo',
      'oita nibo',
    ],
    negotiation: [
      'last price',
      'best price',
      'kom hobe',
      'discount',
      'কম হবে',
      'discount den',
      'final price',
      'price kom',
      'aro kom',
      'ektu kom',
    ],
    edit: [
      // generic
      'change',
      'update',
      'edit',
      'modify',
      'correct',
      'badlao',
      'badla',
      'thik koro',
      'thik koren',
      // field-specific — name
      'name change',
      'naam change',
      'name ta change',
      'naam ta change',
      'name badlao',
      'naam badlao',
      'name ta badlao',
      'নাম বদলাও',
      'নাম পরিবর্তন',
      'নাম চেঞ্জ',
      // field-specific — phone
      'phone change',
      'number change',
      'mobile change',
      'phone ta change',
      'phone number change',
      'number ta change',
      'number badlao',
      'ফোন চেঞ্জ',
      'নম্বর চেঞ্জ',
      'ফোন বদলাও',
      // field-specific — address
      'address change',
      'address ta change',
      'thikana change',
      'thikana badlao',
      'address badlao',
      'location change',
      'নতুন ঠিকানা',
      'ঠিকানা চেঞ্জ',
      'ঠিকানা বদলাও',
      // wrong / incorrect
      'bhul',
      'bul',
      'ভুল',
      'wrong',
      'thik nai',
      'thik na',
      'thik hoi nai',
      'ঠিক না',
      'ঠিক নাই',
      'ভুল আছে',
      'bhul ache',
      'bhul disi',
      'bhul hoise',
      // variant / product options
      'size change',
      'color change',
      'colour change',
      'rong change',
      'onno size',
      'onno color',
      'onno rong',
      'অন্য সাইজ',
      'অন্য কালার',
      'change korte chai',
      'change korte cai',
      'badlate chai',
      'badlate cai',
    ],
    hesitation: [
      'apore janabo',
      'ekhon lagbe na',
      'vhebe dekhi',
      'por e nibo',
      'pore janabo',
      'ektu pore',
      'vebe dekhchi',
    ],
    fabricType: [
      'fabric',
      'kapor',
      'material',
      'কাপড়',
      'kapar',
      'kemon kapar',
    ],
    // FIX: more specific multi-confirm words
    multiConfirm: [
      'sobgulo nibo',
      'duto nibo',
      'tinto nibo',
      'all nibo',
      'sob nibo',
      'duita nibo',
      'tinta nibo',
    ],
  };

  detectIntent(text: string, awaitingConfirm: boolean): string | null {
    const t = (text || '').toLowerCase().trim();
    if (!t) return null;
    if (this.includesAny(t, this.KW.negotiation) || this.looksLikeOffer(t))
      return 'NEGOTIATION';
    if (this.includesAny(t, this.KW.edit)) return 'EDIT_ORDER';
    if (this.includesAny(t, this.KW.hesitation)) return 'SOFT_HESITATION';
    if (this.includesAny(t, this.KW.order)) return 'ORDER_INTENT';
    if (this.includesAny(t, this.KW.size)) return 'SIZE_REQUEST';
    if (this.includesAny(t, this.KW.photo)) return 'PHOTO_REQUEST';
    if (this.includesAny(t, this.KW.deliveryTime)) return 'DELIVERY_TIME';
    if (this.includesAny(t, this.KW.deliveryFee)) return 'DELIVERY_FEE';
    if (this.includesAny(t, this.KW.fabricType)) return 'FABRIC_TYPE';
    if (this.extractRemoveCode(t)) return 'ORDER_REMOVE_ITEM';
    if (awaitingConfirm && this.includesAny(t, this.KW.multiConfirm))
      return 'MULTI_CONFIRM';
    if (awaitingConfirm && this.includesAny(t, this.KW.confirm))
      return 'CONFIRM';
    if (awaitingConfirm && this.includesAny(t, this.KW.confirmWeak))
      return 'CONFIRM';
    if (this.includesAny(t, this.KW.cancel)) return 'CANCEL';
    if (this.includesAny(t, this.KW.confirm)) return 'CONFIRM';
    return null;
  }

  extractSingleCode(text: string): string | null {
    const t = String(text || '').toUpperCase();
    const match = t.match(/\bDF\s*[-]?\s*(\d{1,6})\b/);
    if (!match) return null;
    return `DF-${match[1].padStart(4, '0')}`;
  }

  extractAllCodes(text: string): string[] {
    const t = String(text || '').toUpperCase();
    const matches = [...t.matchAll(/\bDF\s*[-]?\s*(\d{1,6})\b/g)];
    return [...new Set(matches.map((m) => `DF-${m[1].padStart(4, '0')}`))];
  }

  extractQuantityMap(text: string): Map<string, number> {
    const result = new Map<string, number>();
    const t = String(text || '').toUpperCase();
    const pattern =
      /\bDF\s*[-]?\s*(\d{1,6})\b\s*(\d+)\s*(?:TA|TI|টা|টি|PCS|X)?/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(t)) !== null) {
      const code = `DF-${match[1].padStart(4, '0')}`;
      const qty = parseInt(match[2], 10);
      if (qty > 0) result.set(code, qty);
    }
    return result;
  }

  extractRemoveCode(text: string): string | null {
    const t = String(text || '').toLowerCase();
    if (!/\b(bad|lagbe na|remove|bad den)\b/.test(t)) return null;
    return this.extractSingleCode(text);
  }

  extractOfferedPrice(text: string): number | null {
    const t = String(text || '').toLowerCase();

    // FIX: skip if text contains a product code pattern — avoids DF-0042 → 42 false positive
    if (/\b[a-z]{2,6}[-_]?\d{3,8}\b/i.test(t)) return null;

    // Explicit price patterns with currency markers
    const explicit = t.match(
      /(?:^|\s)(\d{3,6})\s*(?:tk|taka|৳|takar|te dibo|dile nibo|hole nibo|dile|hole|taka dibo)/i,
    );
    if (explicit) {
      const v = Number(explicit[1]);
      return Number.isFinite(v) && v >= 100 && v <= 100000 ? v : null;
    }

    // Offer pattern: "800 te nibo", "600 hole ok"
    const offer = t.match(
      /(\d{3,6})\s*(?:te|hole|theke|teke)\s*(?:nibo|ok|hobe|nile|debe)/i,
    );
    if (offer) {
      const v = Number(offer[1]);
      return Number.isFinite(v) && v >= 100 && v <= 100000 ? v : null;
    }

    return null;
  }

  isSideQuestion(intent: string | null): boolean {
    return [
      'SIZE_REQUEST',
      'PHOTO_REQUEST',
      'DELIVERY_TIME',
      'DELIVERY_FEE',
      'FABRIC_TYPE',
    ].includes(intent || '');
  }

  private looksLikeOffer(text: string): boolean {
    return /\d{2,6}\s*(dile|te|hole|taka dile|tk dile)\s*(nibo|hobe|nile|ok)/.test(
      text,
    );
  }

  private includesAny(text: string, keywords: string[]): boolean {
    return keywords.some((k) => text.includes(k));
  }
}
