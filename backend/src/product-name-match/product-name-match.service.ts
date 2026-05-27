import { Injectable } from '@nestjs/common';

export interface NameMatchCandidate {
  code: string;
  name: string | null;
  price: number;
  stockQty: number;
  unit?: string | null;
  productType?: string;
  orderEnabled?: boolean;
  description?: string | null;
}

export interface NameMatchResult {
  productCode: string;
  productName: string;
  price: number;
  stockQty: number;
  unit: string | null;
  orderEnabled: boolean;
  description: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  matchedWord: string;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'in', 'on', 'of', 'for', 'to', 'and', 'or',
  'this', 'that', 'are', 'was', 'it', 'be', 'at', 'by', 'as', 'from', 'with',
  'আছে', 'এই', 'একটি', 'এটি', 'হবে', 'করুন', 'দিন', 'আমাদের', 'নতুন',
  'বিশেষ', 'কিনবো', 'কিনব', 'লাগবে', 'চাই', 'আছে', 'কত', 'দাম', 'price',
  'kinbo', 'lagbe', 'chai', 'ache', 'dam', 'koto', 'please', 'plz',
]);

@Injectable()
export class ProductNameMatchService {
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\sঀ-৿]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getKeywords(text: string): string[] {
    return this.normalize(text)
      .split(' ')
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  }

  matchProducts(
    inputText: string,
    products: NameMatchCandidate[],
    opts: { simpleOnly?: boolean } = {},
  ): NameMatchResult[] {
    if (!inputText?.trim()) return [];

    const normalizedInput = this.normalize(inputText);
    const candidates = opts.simpleOnly
      ? products.filter((p) => p.productType === 'SIMPLE')
      : products;

    const results: NameMatchResult[] = [];

    for (const p of candidates) {
      if (!p.name) continue;

      const normalizedName = this.normalize(p.name);
      const nameKeywords = this.getKeywords(p.name);

      if (!nameKeywords.length) continue;

      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null = null;
      let matchedWord = '';

      // HIGH: full normalized name is a substring of input
      if (normalizedInput.includes(normalizedName)) {
        confidence = 'HIGH';
        matchedWord = normalizedName;
      } else {
        // Count how many name keywords appear in the input
        const matched = nameKeywords.filter((w) => normalizedInput.includes(w));
        const ratio = matched.length / nameKeywords.length;

        if (ratio >= 0.6) {
          confidence = 'MEDIUM';
          matchedWord = matched[0] ?? '';
        } else if (matched.length >= 1) {
          // LOW: at least one keyword (e.g. "mango") found
          confidence = 'LOW';
          matchedWord = matched[0] ?? '';
        }
      }

      if (confidence) {
        results.push({
          productCode: p.code,
          productName: p.name,
          price: p.price,
          stockQty: p.stockQty,
          unit: p.unit ?? null,
          orderEnabled: p.orderEnabled !== false,
          description: p.description ?? null,
          confidence,
          matchedWord,
        });
      }
    }

    // Sort: HIGH first, then MEDIUM, then LOW
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
    return results.sort((a, b) => order[a.confidence] - order[b.confidence]);
  }
}
