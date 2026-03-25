import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BotIntentService } from '../../bot/bot-intent.service';
import {
  ConversationContextService,
  DraftSession,
  CustomFieldDef,
} from '../../conversation-context/conversation-context.service';
import { CallService } from '../../call/call.service';
import { ProductsService } from '../../products/products.service';
import { BotKnowledgeService } from '../../bot-knowledge/bot-knowledge.service';
import { CrmService } from '../../crm/crm.service';
import { FollowUpService } from '../../followup/followup.service';
import { BillingService } from '../../billing/billing.service';

@Injectable()
export class DraftOrderHandler {
  private readonly logger = new Logger(DraftOrderHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly botIntent: BotIntentService,
    private readonly ctx: ConversationContextService,
    private readonly callService: CallService,
    private readonly products: ProductsService,
    private readonly botKnowledge: BotKnowledgeService,
    private readonly crm: CrmService,
    private readonly followUpSvc: FollowUpService,
    private readonly billing: BillingService,
  ) {}

  emptyDraft(): DraftSession {
    return {
      items: [],
      customerName: null,
      phone: null,
      address: null,
      currentStep: 'name',
      pendingCustomFields: [],
      customFieldValues: {},
    };
  }

  startDraftFromCodes(
    codes: string[],
    products: Array<{ code: string; price: number }>,
    variantOptions: CustomFieldDef[] = [],
  ): DraftSession {
    const priceMap = new Map(products.map((p) => [p.code, p.price]));
    const firstStep =
      variantOptions.length > 0 ? `cf:${variantOptions[0].label}` : 'name';
    return {
      items: codes.map((code) => ({
        productCode: code,
        qty: 1,
        unitPrice: priceMap.get(code) ?? 0,
      })),
      customerName: null,
      phone: null,
      address: null,
      currentStep: firstStep,
      pendingCustomFields: [...variantOptions],
      customFieldValues: {},
    };
  }

  async captureField(
    pageId: number,
    psid: string,
    text: string,
    draft: DraftSession,
    page: any,
  ): Promise<string | null | false> {
    const step = draft.currentStep;

    // ── CONFIRM SAVED ADDRESS (returning customer) ────────────────────────────
    if (step === 'confirm_address') {
      const confirmIntent = this.botIntent.detectIntent(text, true);
      if (confirmIntent === 'CONFIRM' || /^(ha|haa|hea|yes|ok|হ্যাঁ|জি|ঠিক)/i.test(text.trim())) {
        // Keep saved address → move to advance_payment check or confirm
        if (this.isAdvanceNeeded(draft, page)) {
          draft.currentStep = 'advance_payment';
          await this.ctx.saveDraft(pageId, psid, draft);
          return this.buildAdvancePrompt(page, draft);
        }
        draft.currentStep = 'confirm';
        await this.ctx.saveDraft(pageId, psid, draft);
        return this.buildSummary(draft, page);
      }
      // Customer gave a new address
      if (this.isAddressLike(text)) {
        draft.address = text.trim();
        if (this.isAdvanceNeeded(draft, page)) {
          draft.currentStep = 'advance_payment';
          await this.ctx.saveDraft(pageId, psid, draft);
          return this.buildAdvancePrompt(page, draft);
        }
        draft.currentStep = 'confirm';
        await this.ctx.saveDraft(pageId, psid, draft);
        return this.buildSummary(draft, page);
      }
      return `আগের ঠিকানায় পাঠাব?\n📍 *${draft.address}*\n\n"হ্যাঁ" বললে এই ঠিকানায় যাবে, অথবা নতুন ঠিকানা লিখুন 💖`;
    }

    // ── CONFIRM ──────────────────────────────────────────────────────────────
    if (step === 'confirm') {
      const intent = this.botIntent.detectIntent(text, true);
      if (intent === 'CONFIRM') {
        // Check subscription before accepting order
        if (page.ownerId) {
          const billingStatus = await this.billing.getStatus(page.ownerId);
          if (!billingStatus.canTakeOrders) {
            await this.ctx.clearDraft(pageId, psid);
            return 'দুঃখিত, এই মুহূর্তে অর্ডার নেওয়া সম্ভব হচ্ছে না। পরে আবার চেষ্টা করুন।';
          }
        }
        await this.finalizeDraftOrder(pageId, psid, draft, page);
        return null;
      }
      if (intent === 'CANCEL') {
        await this.ctx.clearDraft(pageId, psid);
        return null;
      }
      if (intent === 'EDIT_ORDER') {
        // Let webhook.service handleDraftEdit take over — return false so caller handles it
        return false;
      }
      // If customer sends a bare phone number, update it directly
      const inlinePhone = this.extractPhone(text);
      if (
        inlinePhone &&
        /^\+?8?8?01[3-9]\d{8}$/.test(inlinePhone) &&
        text.trim().replace(/\D/g, '').length >= 10
      ) {
        draft.phone = inlinePhone;
        draft.currentStep = 'confirm';
        await this.ctx.saveDraft(pageId, psid, draft);
        return this.buildSummary(draft, page);
      }
      return 'সব ঠিক থাকলে **confirm** লিখুন 💖\nকিছু বদলাতে চাইলে বলুন: "name change" / "phone change" / "address change"';
    }

    // ── ADVANCE PAYMENT PROOF ─────────────────────────────────────────────────
    if (step === 'advance_payment') {
      // Detect problem/complaint instead of payment proof → route to agent
      if (this.isPaymentProblem(text)) {
        draft.paymentIssueNote = text.trim().slice(0, 300);
        await this.finalizeDraftOrder(pageId, psid, draft, page);
        // Mute bot for this customer — agent will handle manually
        await this.ctx.setAgentHandling(pageId, psid, true);
        return '⚠️ সমস্যার কথা বুঝতে পেরেছি। আমাদের agent শীঘ্রই আপনার সাথে যোগাযোগ করবে। অসুবিধার জন্য দুঃখিত 💙';
      }
      // Try to extract TxID from natural sentences like:
      // "আমার last digit হলো 1234" / "আমার txid হলো 8N7G3DKXYZ" / "আমি 8N7 দিয়ে পাঠিয়েছি"
      const extracted = this.extractTxIdFromSentence(text);
      const proofText = extracted || text.trim();

      const screenshotAlreadySent = Boolean(draft.paymentScreenshotUrl);
      if (!screenshotAlreadySent && !this.isValidTransactionId(proofText)) {
        return 'Transaction ID টা সঠিকভাবে দিন 💖\nযেমন: *8N7G3DKXYZ* বা screenshot পাঠান।';
      }
      draft.paymentProof = proofText.slice(0, 200);
      draft.currentStep = 'confirm';
      await this.ctx.saveDraft(pageId, psid, draft);
      return this.buildSummary(draft, page);
    }

    // ── CUSTOM FIELD (cf:FieldLabel) ──────────────────────────────────────────
    if (step.startsWith('cf:')) {
      const fieldLabel = step.slice(3);
      draft.customFieldValues = {
        ...(draft.customFieldValues || {}),
        [fieldLabel]: text.trim(),
      };
      draft.pendingCustomFields = (draft.pendingCustomFields || []).filter(
        (f) => f.label !== fieldLabel,
      );

      if (draft.pendingCustomFields.length > 0) {
        const next = draft.pendingCustomFields[0];
        draft.currentStep = `cf:${next.label}`;
        await this.ctx.saveDraft(pageId, psid, draft);
        return this.promptForCustomField(next);
      }

      // All custom fields done → now collect customer info
      draft.currentStep = 'name';
      await this.ctx.saveDraft(pageId, psid, draft);
      return 'ধন্যবাদ 💖 এখন আপনার **নাম + ফোন নম্বর + ঠিকানা** দিন।';
    }

    // ── NAME / PHONE / ADDRESS — Smart multi-field parsing ───────────────────
    //
    // Try to extract all three from a single customer message first.
    // Then fall back to strict per-step handling for whatever is still missing.
    //
    const parsed = this.parseCustomerInfo(text);

    if (!draft.customerName && parsed.name) draft.customerName = parsed.name;
    if (!draft.phone && parsed.phone) draft.phone = parsed.phone;
    if (!draft.address && parsed.address) draft.address = parsed.address;

    // If smart parser found nothing, apply strict current-step logic
    if (!parsed.name && !parsed.phone && !parsed.address) {
      if (step === 'name') {
        draft.customerName = text.trim().slice(0, 80);
      } else if (step === 'phone') {
        const ph = this.extractPhone(text);
        if (!ph) return 'ফোন নাম্বারটা আবার দিন 💖 (01XXXXXXXXX)';
        draft.phone = ph;
      } else if (step === 'address') {
        if (!this.isAddressLike(text))
          return 'পুরো ঠিকানাটা দিন 💖 (বাসা/রোড/এলাকা/জেলা)';
        draft.address = text.trim();
      }
    }

    // Determine next missing field and ask
    if (!draft.customerName) {
      draft.currentStep = 'name';
      await this.ctx.saveDraft(pageId, psid, draft);
      return 'আপনার নামটা দিন 💖';
    }
    if (!draft.phone) {
      draft.currentStep = 'phone';
      await this.ctx.saveDraft(pageId, psid, draft);
      return `ধন্যবাদ ${draft.customerName} 💖 এখন ফোন নম্বর দিন।`;
    }
    if (!draft.address) {
      draft.currentStep = 'address';
      await this.ctx.saveDraft(pageId, psid, draft);
      return 'ঠিক আছে 💖 এখন পুরো ঠিকানা দিন।';
    }

    // All collected → check if advance payment required
    if (this.isAdvanceNeeded(draft, page)) {
      draft.currentStep = 'advance_payment';
      await this.ctx.saveDraft(pageId, psid, draft);
      return this.buildAdvancePrompt(page, draft);
    }

    // No advance needed → show summary and ask for confirm
    draft.currentStep = 'confirm';
    await this.ctx.saveDraft(pageId, psid, draft);
    return this.buildSummary(draft, page);
  }

  buildSummary(draft: DraftSession, page: any): string {
    const sym = page.currencySymbol || '৳';
    const isOut = !this.isInsideDhaka(draft.address || '', page);
    const fee = Number(
      isOut
        ? (page.deliveryFeeOutsideDhaka ?? 120)
        : (page.deliveryFeeInsideDhaka ?? 80),
    );
    let subtotal = 0;
    const lines = draft.items.map((i) => {
      const t = i.unitPrice * i.qty;
      subtotal += t;
      return `• ${i.productCode} ×${i.qty} = ${sym}${t}`;
    });

    const cfLines = Object.entries(draft.customFieldValues || {}).map(
      ([k, v]) => `📌 ${k}: ${v}`,
    );

    const negLine =
      draft.negotiationRequested && draft.offeredPrice
        ? `⚠️ Offered: ${sym}${draft.offeredPrice}`
        : '';

    const proofLine = draft.paymentProof
      ? `💳 Payment: ${draft.paymentProof}`
      : '';

    return [
      '📦 *Order Summary*',
      ...lines,
      ...(cfLines.length ? cfLines : []),
      `🚚 Delivery: ${sym}${fee}`,
      `💰 Total: ${sym}${subtotal + fee}`,
      '',
      `👤 Name:    ${draft.customerName ?? '—'}`,
      `📞 Phone:   ${draft.phone ?? '—'}`,
      `📍 Address: ${draft.address ?? '—'}`,
      ...(proofLine ? [proofLine] : []),
      ...(negLine ? [negLine] : []),
      '',
      'সব ঠিক থাকলে **confirm** লিখুন 💖',
    ]
      .filter((l) => l !== undefined)
      .join('\n');
  }

  reminder(draft: DraftSession): string {
    const step = draft.currentStep;
    if (step === 'confirm_address') return 'চলমান order — ঠিকানা confirm করুন 💖';
    if (step === 'confirm') return 'সব ঠিক থাকলে **confirm** লিখুন 💖';
    if (step === 'advance_payment')
      return 'চলমান order — advance payment পাঠান 💖';
    if (step.startsWith('cf:'))
      return `চলমান order — ${step.slice(3)} জানান 💖`;
    if (step === 'name') return 'চলমান order — আপনার নাম দিন 💖';
    if (step === 'phone') return 'চলমান order — ফোন নাম্বার দিন 💖';
    if (step === 'address') return 'চলমান order — পুরো ঠিকানা দিন 💖';
    return '';
  }

  async finalizeDraftOrder(
    pageId: number,
    psid: string,
    draft: DraftSession,
    page: any,
  ): Promise<number> {
    // Merge custom fields + payment proof + issue note into order note
    const cfNote = Object.entries(draft.customFieldValues || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    const proofNote = draft.paymentProof
      ? `Payment proof: ${draft.paymentProof}`
      : '';
    const issueNote = draft.paymentIssueNote
      ? `⚠️ Payment Issue: ${draft.paymentIssueNote}`
      : '';
    const combinedNote =
      [cfNote, proofNote, issueNote, draft.orderNote].filter(Boolean).join(' | ') || null;

    // Determine payment status and order status
    const paymentMode = (page.paymentMode as string) || 'cod';
    const hasProof = Boolean(draft.paymentProof);
    let paymentStatus = 'not_required';
    let orderStatus = 'RECEIVED';
    let confirmedAt: Date | null = null;

    if (paymentMode !== 'cod') {
      if (hasProof) {
        paymentStatus = 'advance_paid';
        orderStatus = 'CONFIRMED';
        confirmedAt = new Date();
      } else {
        paymentStatus = 'agent_required';
      }
    }

    const order = await this.prisma.order.create({
      data: {
        pageIdRef: pageId,
        customerPsid: psid,
        customerName: draft.customerName || 'Customer',
        phone: draft.phone ?? null,
        address: draft.address ?? '',
        status: orderStatus,
        confirmedAt: confirmedAt,
        negotiationRequested: draft.negotiationRequested ?? false,
        customerOfferedPrice: draft.offeredPrice ?? null,
        orderNote: combinedNote,
        paymentStatus,
        transactionId: draft.paymentProof ?? null,
        paymentScreenshotUrl: draft.paymentScreenshotUrl ?? null,
        items: {
          create: draft.items.map((i) => ({
            productCode: i.productCode,
            qty: i.qty,
            unitPrice: i.unitPrice,
          })),
        },
      },
    });

    await this.ctx.clearDraft(pageId, psid);

    // V8: auto-decrement stock
    await this.products.decrementStock(
      pageId,
      draft.items.map((i) => ({ productCode: i.productCode, qty: i.qty })),
    );

    // V9: upsert CRM customer record
    const subtotal = draft.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    this.crm
      .upsertFromOrder(pageId, {
        customerPsid: psid,
        customerName: draft.customerName,
        phone: draft.phone,
        address: draft.address,
        totalAmount: subtotal,
      })
      .catch((e) => this.logger.error(`[CRM] upsert failed: ${e.message}`));

    // V15: increment billing order usage (non-blocking)
    this.prisma.page
      .findUnique({ where: { id: pageId }, select: { ownerId: true } })
      .then((p) => {
        if (p?.ownerId)
          this.billing.incrementOrderUsage(p.ownerId).catch(() => {});
      })
      .catch(() => {});

    // V9: schedule follow-up if enabled
    this.scheduleFollowUp(pageId, psid, order.id).catch(() => {});

    this.callService
      .triggerAutoCallIfEnabled(pageId, order.id)
      .catch((err) =>
        this.logger.error(`[AUTO-CALL] order=${order.id}: ${err}`),
      );

    this.logger.log(
      `[ORDER] Finalized #${order.id} for page ${pageId} psid=${psid}`,
    );
    return order.id;
  }

  // ── Payment problem detection ─────────────────────────────────────────────

  private isPaymentProblem(text: string): boolean {
    const t = text.toLowerCase();
    return /সমস্যা|সমস্যায়|সমস্যাতে|problem|issue|কাজ করছে না|কাজ হচ্ছে না|হচ্ছে না|পারছি না|পরে দেব|পরে করব|পরে পাঠাব|এখন না|এখন পারব না|টাকা নেই|ব্যালেন্স নেই|balance নেই|দিতে পারব না|বুঝতে পারছি না|error|fail|failed|block|blocked|সাহায্য|help|agent|cancel|বাতিল|ঝামেলা|trouble|ভুল|number নাই|নম্বর নেই|কাজ করতেছে না/.test(t);
  }

  /**
   * Accepts text as a valid Transaction ID if it:
   *  - Has a labeled prefix (TrxID / Transaction ID / Ref / Txn) followed by 6-20 alphanumeric chars
   *  - OR is a Bkash/Nagad-style block: 8-15 chars containing uppercase letters + digits
   *  - OR is a pure numeric string of 8-15 digits (some banks use numeric-only refs)
   * Rejects casual chat text, single words, Bengali-only text, very short strings, etc.
   */
  private isValidTransactionId(text: string): boolean {
    const t = text.trim();
    // Labeled: "TrxID: ABC123XYZ" or "Transaction ID: 1234567890" — label makes any length ok
    if (/(?:TrxID|Transaction\s*ID|Ref(?:erence)?|Txn)[:\s#]*([A-Za-z0-9]{6,20})/i.test(t))
      return true;
    // Bkash/Nagad uppercase+digit block — must be 8+ chars
    if (/^[A-Z0-9]{8,15}$/.test(t)) return true;
    // Mixed alphanumeric — must be 8+ chars with both letters AND digits
    if (/^[A-Za-z0-9]{8,20}$/.test(t) && /[A-Za-z]/.test(t) && /[0-9]/.test(t)) return true;
    // Pure numeric bank reference — must be 10+ digits (4-9 digit numbers rejected)
    if (/^\d{10,15}$/.test(t)) return true;
    return false;
  }

  /**
   * Extracts a TxID embedded in a natural sentence.
   * Handles patterns like:
   *   "আমার last digit হলো 1234"
   *   "আমার txid হলো 8N7G3DKXYZ"
   *   "last 4 digit: 5678"
   *   "আমি 8N7G3DKXYZ দিয়ে পাঠিয়েছি"
   *   "transaction id হলো ABC12345"
   * Returns the extracted TxID string, or null if not found.
   */
  private extractTxIdFromSentence(text: string): string | null {
    const t = text.trim();

    // Pattern 1: labeled — "txid হলো/is/:" followed by alphanumeric block
    const labeled = t.match(
      /(?:txid|transaction\s*id|trxid|ref|last\s*\d*\s*digit)[:\s=হলো is]+([A-Za-z0-9]{4,20})/i,
    );
    if (labeled) return labeled[1];

    // Pattern 2: "আমি XXXX দিয়ে / পাঠিয়েছি / করেছি"
    const sent = t.match(
      /(?:আমি|আমার)\s+([A-Za-z0-9]{6,20})\s+(?:দিয়ে|পাঠিয়েছি|করেছি|send|পাঠাইছি)/i,
    );
    if (sent) return sent[1];

    // Pattern 3: sentence contains exactly one valid-looking TxID block (uppercase+digit, 6-20 chars)
    const blocks = t.match(/\b[A-Z0-9]{6,20}\b/g);
    if (blocks?.length === 1) return blocks[0];

    // Pattern 4: last 4 digits mentioned — extract the number
    const lastDigit = t.match(/last\s*(?:4|char|digit)[^\d]*(\d{4})/i);
    if (lastDigit) return lastDigit[1];

    return null;
  }

  // ── Payment mode helpers ──────────────────────────────────────────────────

  private isAdvanceNeeded(draft: DraftSession, page: any): boolean {
    const mode = (page.paymentMode as string) || 'cod';
    if (mode === 'cod') return false;
    if (mode === 'full_advance') return !draft.paymentProof; // always, unless already collected
    if (mode === 'advance_outside') {
      return (
        !this.isInsideDhaka(draft.address || '', page) && !draft.paymentProof
      );
    }
    return false;
  }

  private buildAdvancePrompt(page: any, draft: DraftSession): string {
    const sym = page.currencySymbol || '৳';
    const mode = (page.paymentMode as string) || 'cod';
    const isOut = !this.isInsideDhaka(draft.address || '', page);
    const fee = Number(
      isOut
        ? (page.deliveryFeeOutsideDhaka ?? 120)
        : (page.deliveryFeeInsideDhaka ?? 80),
    );
    const subtotal = draft.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);

    let amount: number;
    if (mode === 'full_advance') {
      amount = subtotal + fee;
    } else {
      amount =
        page.advanceAmount && Number(page.advanceAmount) > 0
          ? Number(page.advanceAmount)
          : fee;
    }

    // Use client's custom template if set
    if (page.advancePaymentMessage?.trim()) {
      return page.advancePaymentMessage
        .replace(/\{\{amount\}\}/g, `${sym}${amount}`)
        .replace(/\{\{bkash\}\}/g, page.advanceBkash || '')
        .replace(/\{\{nagad\}\}/g, page.advanceNagad || '')
        .replace(/\{\{currency\}\}/g, sym);
    }

    // Default template
    const lines = [
      mode === 'full_advance'
        ? `💳 *Full Advance Payment প্রয়োজন*`
        : `💳 *Advance Payment প্রয়োজন* (Outside Dhaka)`,
      `পরিমাণ: ${sym}${amount}`,
    ];
    if (page.advanceBkash) lines.push(`📱 Bkash: ${page.advanceBkash}`);
    if (page.advanceNagad) lines.push(`📱 Nagad: ${page.advanceNagad}`);
    lines.push('');
    lines.push('Payment করার পর **Transaction ID** অথবা screenshot পাঠান 💖');
    return lines.join('\n');
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Try to extract phone, name, and/or address from a single customer message.
   * Works for combined inputs like "Limon 01720450797 Mirpur, Dhaka"
   * as well as single sends like "Limon" or "01720450797".
   */
  parseCustomerInfo(text: string): {
    name?: string;
    phone?: string;
    address?: string;
  } {
    const result: { name?: string; phone?: string; address?: string } = {};
    let remaining = text.trim();

    // 1. Extract phone number (also handles Bangla digits)
    const normalized = remaining.replace(/[০-৯]/g, (d) =>
      String('০১২৩৪৫৬৭৮৯'.indexOf(d)),
    );
    const phoneMatch = normalized.match(/(?:\+?88)?01[3-9]\d{8}/);
    if (phoneMatch) {
      result.phone = phoneMatch[0];
      const phoneIdx = normalized.indexOf(phoneMatch[0]);
      remaining = (
        remaining.slice(0, phoneIdx) +
        remaining.slice(phoneIdx + phoneMatch[0].length)
      )
        .trim()
        .replace(/\s{2,}/g, ' ');
    }

    if (!remaining) return result;

    // 2. Classify remaining text as name / address
    const parts = remaining
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const hasComma = parts.length >= 2;
    const hasGeo = this.hasGeoKeyword(remaining);
    const isLong = remaining.length >= 15;

    if (hasComma) {
      // "Name, Area, District" — first short non-geo part = name, rest = address
      const first = parts[0];
      const firstIsName =
        first.length <= 35 &&
        first.split(' ').length <= 4 &&
        !this.hasGeoKeyword(first);
      if (firstIsName) {
        result.name = first;
        result.address = parts.slice(1).join(', ');
      } else {
        result.address = remaining;
      }
    } else if (hasGeo || isLong) {
      result.address = remaining;
    } else if (remaining.length <= 50 && remaining.split(' ').length <= 5) {
      result.name = remaining;
    }

    return result;
  }

  private hasGeoKeyword(text: string): boolean {
    return /\b(road|rd|house|flat|village|gram|para|ward|thana|upazila|district|zila|জেলা|থানা|উপজেলা|বাসা|রোড|গ্রাম|পাড়া|মহল্লা|mirpur|uttara|dhaka|ঢাকা|chittagong|চট্টগ্রাম|sylhet|সিলেট|rajshahi|রাজশাহী|khulna|খুলনা|barisal|বরিশাল|rangpur|রংপুর|mymensingh|ময়মনসিংহ|tangail|টাঙ্গাইল|narayanganj|gazipur|comilla|cumilla|noakhali|brahmanbaria|feni|cox|faridpur|jessore|jashore|dinajpur|bogra|bogura|sirajganj|pabna|jamalpur|netrokona|kishoreganj|manikganj|munshiganj|narsingdi|sherpur|habiganj|moulvibazar|kalihati|ellenga)\b/i.test(
      text,
    );
  }

  private extractPhone(text: string): string | null {
    const normalized = text.replace(/[০-৯]/g, (d) =>
      String('০১২৩৪৫৬৭৮৯'.indexOf(d)),
    );
    const m = normalized.match(/(?:\+?88)?01[3-9]\d{8}/);
    return m ? m[0] : null;
  }

  private promptForCustomField(field: CustomFieldDef): string {
    if (field.choices?.length) {
      const opts = field.choices.map((c, i) => `${i + 1}. ${c}`).join('\n');
      return `${field.label} কোনটা নেবেন? 💖\n${opts}`;
    }
    return `${field.label} জানান 💖`;
  }

  private isInsideDhaka(address: string, page: any): boolean {
    const addr = address.toLowerCase();
    if (page?._areaRules?.globalInsideDhaka?.length) {
      for (const area of page._areaRules.globalInsideDhaka) {
        for (const alias of [area.areaName, ...(area.aliases || [])]) {
          if (addr.includes(alias.toLowerCase())) return true;
        }
      }
    }
    return /mirpur|uttara|dhanmondi|mohammadpur|badda|gulshan|banani|niketon|dhaka|ঢাকা|মিরপুর|উত্তরা|গুলশান|keraniganj|demra|tongi|savar|ashulia|gazipur|narayanganj|matuail|jatrabari|rayer bazar|hazaribagh|lalbagh|wari|shyampur|kadamtali|shyamoli|adabor|kafrul|pallabi|shah ali|dakshinkhan|uttarkhan|turag|tejgaon|rampura|sabujbagh|motijheel|kotwali|chawkbazar|sutrapur|bangshal|hazaribag|kamrangirchar/i.test(
      addr,
    );
  }

  private isAddressLike(text: string): boolean {
    const t = text.trim();
    if (t.length < 8) return false;
    return (
      t.length >= 15 ||
      t.includes(',') ||
      this.hasGeoKeyword(t) ||
      /road|rd|house|flat|village|gram|para|ward|floor|apt|block|sector|zone|thana|upazila|district|zila|জেলা|থানা|উপজেলা|বাসা|রোড|গ্রাম|পাড়া|মহল্লা|ইউনিয়ন/i.test(
        t,
      )
    );
  }

  private async scheduleFollowUp(
    pageId: number,
    psid: string,
    orderId: number,
  ) {
    const settings = await this.followUpSvc.getSettings(pageId);
    if (!settings.orderReceivedEnabled) return;
    await this.followUpSvc.schedule(pageId, {
      psid,
      orderId,
      triggerType: 'order_received',
      message: settings.orderReceivedMsg.replace(
        '{{orderId}}',
        String(orderId),
      ),
      delayHours: settings.orderReceivedDelay,
    });
  }
}
