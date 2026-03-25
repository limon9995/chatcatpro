export type MemoLayout = 'memo' | 'invoice';
export type MemoTheme = 'classic' | 'fashion' | 'luxury';

export interface BusinessInfo {
  companyName: string;
  phone: string;
  address?: string;
  logoUrl?: string;
  footerText?: string;
  primaryColor?: string;
  deliveryFeeInsideDhaka?: number;
  deliveryFeeOutsideDhaka?: number;
  codLabel?: string;
  currencySymbol?: string;
}

export interface MemoItem {
  productCode: string;
  qty: number;
  unitPrice: number;
}

export interface MemoOrderData {
  id: number;
  customerName?: string;
  phone?: string;
  address?: string;
  status?: string;
  createdAt: string;
  items: MemoItem[];
}

export interface TemplateFieldMap {
  x: number;
  y: number;
  width: number;
  height: number;
  align?: 'left' | 'center' | 'right';
  fontSize?: number;
  fontWeight?: number;
  maxLines?: number;
  required?: boolean;
  source?: 'auto' | 'manual';
  fieldKey?: string;
}

export interface UploadedMemoTemplate {
  pageId: number;
  originalName: string;
  fileName: string;
  fileUrl: string;
  originalFileUrl?: string; // original PDF before PNG conversion
  mimeType: string;
  templateWidth?: number;
  templateHeight?: number;
  renderMode: 'background-mapped' | 'html-template' | 'fallback-auto';
  extractedText?: string;
  htmlContent?: string;
  mapping?: Partial<Record<string, TemplateFieldMap>>;
  autoDetected?: boolean;
  detectionConfidence?: number; // 0-100
  status?: 'draft' | 'confirmed';
  version?: number;
  history?: Array<{
    version: number;
    fileName: string;
    updatedAt: string;
    action: string;
  }>;
  updatedAt: string;
}

export interface MemoPreviewData {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  orderId: string;
  date: string;
  businessName: string;
  businessPhone: string;
  codAmount: string;
  totalAmount: string;
  deliveryFee: string;
  items: string;
}
