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

// ── Credit-based pricing ──────────────────────────────────────────────────────
// Every costPer*Bdt / walletBalanceBdt / WalletTransaction.amountBdt field
// keeps its ৳-suffixed name (renaming across ~15 files on a live billing
// system was judged too risky for too little value — see the credit-system
// plan) but its VALUE now means CREDITS, not real taka. CREDITS_PER_TAKA is
// the single conversion constant used everywhere real ৳ still needs to
// interact with the credit system: the two purchasable packages
// (৳3000→5000 credits, ৳5000→8000 credits) imply slightly different
// ৳-per-credit rates (0.60 vs 0.625); this is the blended/revenue-weighted
// rate across both — the rate that actually reflects the platform's real
// revenue per credit sold — used to convert every legacy ৳ cost so today's
// profit margin per unit of usage is preserved exactly.
export const CREDITS_PER_TAKA = 1.625; // = 13000 credits / 8000৳ (Starter + Growth packages combined)

export const bdtToCredits = (bdt: number): number =>
  Math.round(bdt * CREDITS_PER_TAKA * 10000) / 10000;

export const creditsToBdt = (credits: number): number =>
  Math.round((credits / CREDITS_PER_TAKA) * 100) / 100;

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

// ── Platform-wide default pricing (now credit-denominated) ───────────────────
// The rate every Page/reseller falls back to when no override applies.
// Values below are the legacy ৳ defaults × CREDITS_PER_TAKA (1.625) — e.g.
// costPerTextMsgBdt was ৳0.05, is now 0.08125 credits (~12 texts/credit).

export const DEFAULT_GLOBAL_PRICING: Required<PricingFields> = {
  costPerKeywordReplyBdt: 0.0325,
  costPerTextMsgBdt: 0.08125,
  costPerImageBdt: 0.325,
  costPerImageLocalBdt: 0.1625,
  costPerOcrLocalBdt: 0.0325,
  costPerOcrAiBdt: 0.08125,
  costPerVoiceMsgBdt: 1.625,
  costPerAnalyzeBdt: 0.325,
  costPerAiGenerateBdt: 0.1625,
  costPerBroadcastMsgBdt: 0.08125,
  costPerRecurringNotifBdt: 0.1625,
  costPerCommentReplyBdt: 0.08125,
  costPerMemoPrintBdt: 0.1625,
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
