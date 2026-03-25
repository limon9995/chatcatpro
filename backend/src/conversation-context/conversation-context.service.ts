import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// 'name'|'phone'|'address'|'confirm' or 'cf:FieldLabel' for product custom fields
export type DraftStep = string;

export interface DraftItem {
  productCode: string;
  qty: number;
  unitPrice: number;
}

export interface CustomFieldDef {
  label: string; // e.g. "Size"
  choices?: string[]; // e.g. ["S","M","L","XL"] — empty/absent means free text
}

export interface DraftSession {
  items: DraftItem[];
  customerName: string | null;
  phone: string | null;
  address: string | null;
  currentStep: DraftStep;
  offeredPrice?: number | null;
  negotiationRequested?: boolean;
  orderNote?: string;
  pendingMultiPreview?: string[];
  // V17: product-specific custom fields (size, color, etc.)
  pendingCustomFields?: CustomFieldDef[];
  customFieldValues?: Record<string, string>;
  // V17: advance payment proof (transaction ID / "screenshot sent")
  paymentProof?: string;
  paymentScreenshotUrl?: string; // URL of screenshot customer sent
  paymentIssueNote?: string;    // Customer's problem message — marks order for agent review
}

@Injectable()
export class ConversationContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getSession(pageIdRef: number, customerPsid: string) {
    return this.prisma.conversationSession.findUnique({
      where: { pageIdRef_customerPsid: { pageIdRef, customerPsid } },
    });
  }

  async upsertSession(
    pageIdRef: number,
    customerPsid: string,
    patch: {
      activeDraftJson?: string | null;
      lastPresentedProductsJson?: string | null;
      awaitingField?: string | null;
      lastIntent?: string | null;
      referencedMessageId?: string | null;
      agentHandling?: boolean;
    },
  ) {
    return this.prisma.conversationSession.upsert({
      where: { pageIdRef_customerPsid: { pageIdRef, customerPsid } },
      create: { pageIdRef, customerPsid, ...patch },
      update: patch,
    });
  }

  async getActiveDraft(
    pageIdRef: number,
    customerPsid: string,
  ): Promise<DraftSession | null> {
    const session = await this.getSession(pageIdRef, customerPsid);
    if (!session?.activeDraftJson) return null;
    try {
      return JSON.parse(session.activeDraftJson) as DraftSession;
    } catch {
      return null;
    }
  }

  async saveDraft(
    pageIdRef: number,
    customerPsid: string,
    draft: DraftSession,
  ) {
    await this.upsertSession(pageIdRef, customerPsid, {
      activeDraftJson: JSON.stringify(draft),
      awaitingField: draft.currentStep,
    });
  }

  async setAgentHandling(
    pageIdRef: number,
    customerPsid: string,
    value: boolean,
  ) {
    await this.upsertSession(pageIdRef, customerPsid, { agentHandling: value });
  }

  async isAgentHandling(
    pageIdRef: number,
    customerPsid: string,
  ): Promise<boolean> {
    const session = await this.getSession(pageIdRef, customerPsid);
    return session?.agentHandling ?? false;
  }

  async clearDraft(pageIdRef: number, customerPsid: string) {
    await this.upsertSession(pageIdRef, customerPsid, {
      activeDraftJson: null,
      awaitingField: null,
      lastIntent: null,
    });
  }

  async setLastPresentedProducts(
    pageIdRef: number,
    customerPsid: string,
    products: { code: string; price: number; name?: string | null }[],
  ) {
    await this.upsertSession(pageIdRef, customerPsid, {
      lastPresentedProductsJson: JSON.stringify(products),
    });
  }

  async getLastPresentedProducts(
    pageIdRef: number,
    customerPsid: string,
  ): Promise<{ code: string; price: number; name?: string | null }[]> {
    const session = await this.getSession(pageIdRef, customerPsid);
    if (!session?.lastPresentedProductsJson) return [];
    try {
      return JSON.parse(session.lastPresentedProductsJson);
    } catch {
      return [];
    }
  }

  async setPendingMultiPreview(
    pageIdRef: number,
    customerPsid: string,
    codes: string[],
  ) {
    const draft =
      (await this.getActiveDraft(pageIdRef, customerPsid)) || this.emptyDraft();
    draft.pendingMultiPreview = codes;
    await this.saveDraft(pageIdRef, customerPsid, draft);
  }

  async clearPendingMultiPreview(pageIdRef: number, customerPsid: string) {
    const draft = await this.getActiveDraft(pageIdRef, customerPsid);
    if (draft) {
      draft.pendingMultiPreview = [];
      await this.saveDraft(pageIdRef, customerPsid, draft);
    }
  }

  emptyDraft(): DraftSession {
    return {
      items: [],
      customerName: null,
      phone: null,
      address: null,
      currentStep: 'name',
    };
  }

  startDraftFromCodes(
    codes: string[],
    products: { code: string; price: number }[],
  ): DraftSession {
    const priceMap = new Map(products.map((p) => [p.code, p.price]));
    return {
      items: codes.map((code) => ({
        productCode: code,
        qty: 1,
        unitPrice: priceMap.get(code) ?? 0,
      })),
      customerName: null,
      phone: null,
      address: null,
      currentStep: 'name',
    };
  }
}
