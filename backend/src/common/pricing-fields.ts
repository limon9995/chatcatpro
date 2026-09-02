// Shared retail cost-per-unit field whitelist — used everywhere a caller is
// allowed to set/override a Page's costPer*Bdt pricing (platform admin's
// per-page override, platform admin's "apply to all" bulk update, and the
// reseller-scoped per-client-page pricing endpoint). One list, one shape —
// avoids re-declaring the same 13 fields in three different services.
//
// Plain functions (not a NestJS-injectable service) on purpose: WalletService
// lives in the @Global() WalletModule loaded very early, and ResellerService
// needs the same data — routing both through AdminService would risk a
// circular module dependency. A dependency-free file/const module sidesteps
// that entirely.

import * as fs from 'fs';
import * as path from 'path';

export interface PricingFields {
  costPerTextMsgBdt?: number;
  costPerVoiceMsgBdt?: number;
  costPerImageBdt?: number;
  costPerImageLocalBdt?: number;
  costPerAnalyzeBdt?: number;
  costPerOcrLocalBdt?: number;
  costPerOcrAiBdt?: number;
  costPerRecurringNotifBdt?: number;
  costPerBroadcastMsgBdt?: number;
  costPerKeywordReplyBdt?: number;
  costPerAiGenerateBdt?: number;
  costPerMemoPrintBdt?: number;
  costPerCommentReplyBdt?: number;
}

export const PRICING_FIELDS: (keyof PricingFields)[] = [
  'costPerTextMsgBdt',
  'costPerVoiceMsgBdt',
  'costPerImageBdt',
  'costPerImageLocalBdt',
  'costPerAnalyzeBdt',
  'costPerOcrLocalBdt',
  'costPerOcrAiBdt',
  'costPerRecurringNotifBdt',
  'costPerBroadcastMsgBdt',
  'costPerKeywordReplyBdt',
  'costPerAiGenerateBdt',
  'costPerMemoPrintBdt',
  'costPerCommentReplyBdt',
];

/** Picks only the defined, whitelisted pricing fields out of an arbitrary input object. */
export function pickPricingFields(input: PricingFields): Partial<PricingFields> {
  const data: Partial<PricingFields> = {};
  for (const key of PRICING_FIELDS) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  return data;
}

// ── Platform-wide default (wholesale) pricing ────────────────────────────────
// The rate every Page/reseller falls back to when no override applies.

export const DEFAULT_GLOBAL_PRICING: Required<PricingFields> = {
  costPerKeywordReplyBdt: 0.02,
  costPerTextMsgBdt: 0.05,
  costPerImageBdt: 0.20,
  costPerImageLocalBdt: 0.10,
  costPerOcrLocalBdt: 0.02,
  costPerOcrAiBdt: 0.05,
  costPerVoiceMsgBdt: 1.00,
  costPerAnalyzeBdt: 0.20,
  costPerAiGenerateBdt: 0.10,
  costPerBroadcastMsgBdt: 0.05,
  costPerRecurringNotifBdt: 0.10,
  costPerCommentReplyBdt: 0.05,
  costPerMemoPrintBdt: 0.10,
};

const GLOBAL_PRICING_FILE = path.join(process.cwd(), 'storage', 'global-pricing.json');

export function readGlobalPricing(): Required<PricingFields> {
  try {
    if (fs.existsSync(GLOBAL_PRICING_FILE)) {
      const saved = JSON.parse(fs.readFileSync(GLOBAL_PRICING_FILE, 'utf8'));
      return { ...DEFAULT_GLOBAL_PRICING, ...saved };
    }
  } catch {}
  return { ...DEFAULT_GLOBAL_PRICING };
}

export function writeGlobalPricing(pricing: Partial<PricingFields>): Required<PricingFields> {
  fs.mkdirSync(path.dirname(GLOBAL_PRICING_FILE), { recursive: true });
  const current = readGlobalPricing();
  const updated = { ...current, ...pricing };
  fs.writeFileSync(GLOBAL_PRICING_FILE, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

/**
 * Merges a reseller's optional wholesale override JSON onto the platform's
 * global default pricing — same "defaults + partial override" idiom as
 * readGlobalPricing() itself. Used to compute what a reseller owes the
 * platform per unit of usage, independent of what they charge their own
 * clients (the retail Page.costPer*Bdt fields).
 */
export function resolveWholesaleRate(
  overridesJson: unknown,
): Required<PricingFields> {
  const base = readGlobalPricing();
  if (!overridesJson || typeof overridesJson !== 'object') return base;
  return { ...base, ...pickPricingFields(overridesJson as PricingFields) };
}
