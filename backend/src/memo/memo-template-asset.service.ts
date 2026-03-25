import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import * as Tesseract from 'tesseract.js';
import { TemplateFieldMap, UploadedMemoTemplate } from './memo.types';

// Standard A4 dimensions at 96 DPI (pixels)
const A4_W = 794;
const A4_H = 1123;

@Injectable()
export class MemoTemplateAssetService {
  private readonly storageRoot = path.join(
    process.cwd(),
    'storage',
    'memo-templates',
  );

  constructor() {
    fs.mkdirSync(this.storageRoot, { recursive: true });
  }

  async saveUploadedTemplate(
    pageId: number,
    file: any,
  ): Promise<UploadedMemoTemplate> {
    const safeOriginal = String(file?.originalname || 'template').replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );
    const ext = path.extname(safeOriginal) || this.extFromMime(file?.mimetype);
    const stamp = new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14);
    const fileName = `page-${pageId}-v${stamp}${ext}`;
    const absPath = path.join(this.storageRoot, fileName);
    await fs.promises.writeFile(absPath, file.buffer);

    const previous = await this.getTemplate(pageId);
    const meta = await this.buildMeta(
      pageId,
      fileName,
      absPath,
      safeOriginal,
      file?.mimetype || 'application/octet-stream',
      file.buffer,
    );
    meta.version = Number(previous?.version || 0) + 1;
    meta.history = [
      ...(previous?.history || []),
      {
        version: meta.version,
        fileName,
        updatedAt: meta.updatedAt,
        action: 'upload',
      },
    ].slice(-20);
    await this.writeMeta(pageId, meta);
    return meta;
  }

  async getTemplate(pageId: number): Promise<UploadedMemoTemplate | null> {
    const p = this.metaPath(pageId);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(
        await fs.promises.readFile(p, 'utf8'),
      ) as UploadedMemoTemplate;
    } catch {
      return null;
    }
  }

  async updateTemplateMapping(
    pageId: number,
    mapping: Partial<Record<string, TemplateFieldMap>>,
    status?: 'draft' | 'confirmed',
  ) {
    const meta = await this.getTemplate(pageId);
    if (!meta) throw new NotFoundException('Template not found');

    const merged = { ...(meta.mapping || {}), ...mapping };
    for (const [key, value] of Object.entries(merged)) {
      if (!value) delete (merged as any)[key];
    }

    const cleanMapping = this.normalizeMapping(
      merged,
      meta.templateWidth || A4_W,
      meta.templateHeight || A4_H,
    );
    const updated: UploadedMemoTemplate = {
      ...meta,
      mapping: cleanMapping,
      renderMode:
        meta.renderMode === 'html-template'
          ? 'html-template'
          : Object.keys(cleanMapping).length
            ? 'background-mapped'
            : 'fallback-auto',
      status: status || meta.status || 'draft',
      version: Number(meta.version || 1) + 1,
      updatedAt: new Date().toISOString(),
      history: [
        ...(meta.history || []),
        {
          version: Number(meta.version || 1) + 1,
          fileName: meta.fileName,
          updatedAt: new Date().toISOString(),
          action:
            status === 'confirmed' ? 'mapping-confirmed' : 'mapping-updated',
        },
      ].slice(-20),
    };
    await this.writeMeta(pageId, updated);
    return updated;
  }

  async confirmTemplate(pageId: number) {
    const meta = await this.getTemplate(pageId);
    if (!meta) throw new NotFoundException('Template not found');
    const updated: UploadedMemoTemplate = {
      ...meta,
      status: 'confirmed',
      renderMode:
        meta.renderMode === 'html-template'
          ? 'html-template'
          : Object.keys(meta.mapping || {}).length
            ? 'background-mapped'
            : meta.renderMode,
      updatedAt: new Date().toISOString(),
      history: [
        ...(meta.history || []),
        {
          version: Number(meta.version || 1),
          fileName: meta.fileName,
          updatedAt: new Date().toISOString(),
          action: 'confirmed',
        },
      ].slice(-20),
    };
    await this.writeMeta(pageId, updated);
    return updated;
  }

  private async writeMeta(pageId: number, meta: UploadedMemoTemplate) {
    await fs.promises.writeFile(
      this.metaPath(pageId),
      JSON.stringify(meta, null, 2),
      'utf8',
    );
  }

  private metaPath(pageId: number) {
    return path.join(this.storageRoot, `page-${pageId}.json`);
  }

  private extFromMime(mime?: string) {
    if (!mime) return '.bin';
    if (mime.includes('png')) return '.png';
    if (mime.includes('jpeg')) return '.jpg';
    if (mime.includes('webp')) return '.webp';
    if (mime.includes('svg')) return '.svg';
    if (mime.includes('html')) return '.html';
    if (mime.includes('pdf')) return '.pdf';
    return '.bin';
  }

  // ── PDF → PNG via Puppeteer ──────────────────────────────────────────────────
  private async convertPdfToImage(
    pdfBuffer: Buffer,
  ): Promise<{ buffer: Buffer; width: number; height: number } | null> {
    try {
      const puppeteer = await import('puppeteer');
      const browser = await (puppeteer.default || puppeteer).launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      } as any);
      const page = await browser.newPage();
      // Use slightly taller viewport so toolbar doesn't obscure page content
      await page.setViewport({ width: A4_W, height: A4_H + 80 });
      const b64 = pdfBuffer.toString('base64');
      await page.goto(`data:application/pdf;base64,${b64}`, {
        waitUntil: 'networkidle2',
        timeout: 20000,
      });
      // Give Chrome PDF viewer time to render
      await new Promise<void>((r) => setTimeout(r, 2500));
      // Try to detect toolbar height (Chrome PDF viewer)
      const toolbarH: number = await page
        .evaluate(() => {
          try {
            const el =
              document.querySelector('embed') ||
              document.querySelector('pdf-viewer');
            if (el)
              return Math.round(
                (el as HTMLElement).getBoundingClientRect().top,
              );
            // Chrome new PDF viewer wraps inside a shadow root
            const host = document.querySelector('pdf-viewer-app');
            if (host) return Math.round(host.getBoundingClientRect().top);
          } catch {
            /* ignore */
          }
          return 52; // safe default: Chrome's minimal toolbar
        })
        .catch(() => 52);
      const screenshot = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: toolbarH, width: A4_W, height: A4_H },
      });
      await browser.close();
      return { buffer: screenshot as Buffer, width: A4_W, height: A4_H };
    } catch {
      return null;
    }
  }

  // ── Main buildMeta ───────────────────────────────────────────────────────────
  private async buildMeta(
    pageId: number,
    fileName: string,
    absPath: string,
    originalName: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<UploadedMemoTemplate> {
    const fileUrl = `/memo/template/file/${fileName}`;
    const base: UploadedMemoTemplate = {
      pageId,
      originalName,
      fileName,
      fileUrl,
      mimeType,
      renderMode: 'fallback-auto',
      autoDetected: false,
      detectionConfidence: 0,
      status: 'draft',
      version: 1,
      updatedAt: new Date().toISOString(),
    };

    // ── HTML template ──────────────────────────────────────────────────────────
    if (mimeType.includes('html') || mimeType.includes('text')) {
      const text = buffer.toString('utf8');
      const hasPlaceholders =
        /\{\{\s*(customerName|customerPhone|customerAddress|orderId|date|businessName|businessPhone|codAmount|totalAmount|deliveryFee|items)\s*\}\}/i.test(
          text,
        );
      return {
        ...base,
        extractedText: text.slice(0, 5000),
        htmlContent: text,
        renderMode: hasPlaceholders ? 'html-template' : 'fallback-auto',
        autoDetected: hasPlaceholders,
        detectionConfidence: hasPlaceholders ? 100 : 0,
      };
    }

    // ── PDF → convert to PNG via Puppeteer ────────────────────────────────────
    if (mimeType.includes('pdf')) {
      const converted = await this.convertPdfToImage(buffer);
      if (converted) {
        const pngName = fileName.replace(/\.pdf$/i, '-preview.png');
        const pngPath = path.join(this.storageRoot, pngName);
        await fs.promises.writeFile(pngPath, converted.buffer);
        // Process the converted PNG like a normal image
        const result = await this.runOcr(converted.buffer);
        const mapping = this.detectFieldMapping(
          result.words,
          converted.width,
          converted.height,
        );
        const confidence = this.calculateDetectionConfidence(
          result.words,
          mapping,
        );
        return {
          ...base,
          fileUrl: `/memo/template/file/${pngName}`, // display/print uses the PNG
          originalFileUrl: fileUrl, // keep PDF reference
          mimeType: 'image/png', // now treated as image
          templateWidth: converted.width,
          templateHeight: converted.height,
          extractedText: result.text,
          mapping,
          autoDetected: Object.keys(mapping).length > 0,
          detectionConfidence: confidence,
          renderMode:
            Object.keys(mapping).length >= 2
              ? 'background-mapped'
              : 'fallback-auto',
        };
      }
      // PDF conversion failed — store with default mapping and pdf-overlay renderMode
      const defaultMapping = this.buildDefaultMapping(A4_W, A4_H);
      return {
        ...base,
        templateWidth: A4_W,
        templateHeight: A4_H,
        mapping: defaultMapping,
        autoDetected: false,
        detectionConfidence: 0,
        renderMode: 'pdf-overlay' as any,
      };
    }

    // ── Raster image (PNG / JPG / WebP) ───────────────────────────────────────
    if (mimeType.startsWith('image/')) {
      try {
        const img = sharp(buffer, { failOn: 'none' });
        const info = await img.metadata();
        const width = Number(info.width || A4_W);
        const height = Number(info.height || A4_H);

        // Preprocess for OCR: grayscale, high contrast, resize to 1800px wide
        const processed = await img
          .grayscale()
          .normalize()
          .resize({ width: 1800, withoutEnlargement: true })
          .sharpen({ sigma: 1 })
          .png()
          .toBuffer();

        const result = await this.runOcr(processed);
        const mapping = this.detectFieldMapping(result.words, width, height);
        const confidence = this.calculateDetectionConfidence(
          result.words,
          mapping,
        );
        return {
          ...base,
          templateWidth: width,
          templateHeight: height,
          extractedText: result.text,
          mapping,
          autoDetected: Object.keys(mapping).length > 0,
          detectionConfidence: confidence,
          renderMode:
            Object.keys(mapping).length >= 2
              ? 'background-mapped'
              : 'fallback-auto',
        };
      } catch {
        return base;
      }
    }

    return base;
  }

  // ── OCR helper ───────────────────────────────────────────────────────────────
  private async runOcr(
    imageBuffer: Buffer,
  ): Promise<{ words: any[]; text: string }> {
    try {
      const result = await (Tesseract as any).recognize(imageBuffer, 'eng', {
        logger: () => {},
      });
      const rawData = result?.data;
      return {
        words: Array.isArray(rawData?.words) ? rawData.words : [],
        text: rawData?.text || '',
      };
    } catch {
      return { words: [], text: '' };
    }
  }

  // ── Confidence score ─────────────────────────────────────────────────────────
  private calculateDetectionConfidence(
    words: any[],
    mapping: Partial<Record<string, TemplateFieldMap>>,
  ) {
    const detected = Object.keys(mapping).length;
    const expected = 10;
    const confidences = words
      .map((w) => Number(w?.confidence ?? w?.conf ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    const avgWordConfidence = confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;
    const coverageScore = Math.min((detected / expected) * 100, 100);
    return Math.round(coverageScore * 0.7 + avgWordConfidence * 0.3);
  }

  // ── Normalize mapping (clamp values) ─────────────────────────────────────────
  private normalizeMapping(
    mapping: Partial<Record<string, TemplateFieldMap>> = {},
    width: number,
    height: number,
  ) {
    const out: Partial<Record<string, TemplateFieldMap>> = {};
    for (const [key, box] of Object.entries(mapping)) {
      if (!box) continue;
      const x = this.clamp(box.x, 0, width - 10);
      const y = this.clamp(box.y, 0, height - 10);
      const w = this.clamp(box.width, 40, width - x);
      // Address needs more height — minimum based on font size × lines
      const minH =
        key === 'customerAddress'
          ? Math.max(80, (box.fontSize || 18) * (box.maxLines || 5) * 1.5)
          : 20;
      const h = this.clamp(box.height, minH, height - y);
      out[key] = {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(w),
        height: Math.round(h),
        fontSize: this.clamp(box.fontSize || 18, 10, 64),
        fontWeight: this.clamp(box.fontWeight || 700, 400, 900),
        align: ['left', 'center', 'right'].includes(String(box.align))
          ? (box.align as any)
          : 'left',
        maxLines: this.clamp(
          box.maxLines || (key === 'customerAddress' ? 6 : 2),
          1,
          10,
        ),
        required: Boolean(box.required),
        source: box.source || 'manual',
        fieldKey: box.fieldKey || key,
      };
    }
    return out;
  }

  private clamp(value: unknown, min: number, max: number) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(Math.max(n, min), max);
  }

  // ── Field detection from OCR words ───────────────────────────────────────────
  private detectFieldMapping(words: any[], width: number, height: number) {
    const mapping: Record<string, any> = {};

    // Multi-language keyword sets (English label + common template patterns)
    const defs: Array<{
      keys: string[];
      field: string;
      widthRatio: number;
      heightRatio: number;
      align: 'left' | 'right' | 'center';
      maxLines: number;
    }> = [
      {
        field: 'customerName',
        keys: [
          'name',
          'customer',
          'consignee',
          'recipient',
          'receiver',
          'buyer',
          'নাম',
          'গ্রাহক',
        ],
        widthRatio: 0.4,
        heightRatio: 0.05,
        align: 'left',
        maxLines: 2,
      },
      {
        field: 'customerPhone',
        keys: ['phone', 'mobile', 'contact', 'cell', 'tel', 'মোবাইল', 'ফোন'],
        widthRatio: 0.35,
        heightRatio: 0.04,
        align: 'left',
        maxLines: 1,
      },
      {
        field: 'customerAddress',
        keys: [
          'address',
          'location',
          'area',
          'district',
          'thana',
          'shipping',
          'ঠিকানা',
          'এলাকা',
        ],
        widthRatio: 0.6,
        heightRatio: 0.2,
        align: 'left',
        maxLines: 6,
      },
      {
        field: 'orderId',
        keys: [
          'order',
          'invoice',
          'slip',
          'tracking',
          'id',
          'serial',
          'no',
          '#',
        ],
        widthRatio: 0.22,
        heightRatio: 0.04,
        align: 'left',
        maxLines: 1,
      },
      {
        field: 'date',
        keys: ['date', 'তারিখ', 'time'],
        widthRatio: 0.22,
        heightRatio: 0.04,
        align: 'left',
        maxLines: 1,
      },
      {
        field: 'codAmount',
        keys: ['cod', 'collect', 'cash', 'collected', 'মূল্য'],
        widthRatio: 0.22,
        heightRatio: 0.04,
        align: 'right',
        maxLines: 1,
      },
      {
        field: 'totalAmount',
        keys: ['total', 'grand', 'amount', 'মোট'],
        widthRatio: 0.22,
        heightRatio: 0.04,
        align: 'right',
        maxLines: 1,
      },
      {
        field: 'deliveryFee',
        keys: ['delivery', 'shipping', 'courier', 'charge', 'fee'],
        widthRatio: 0.22,
        heightRatio: 0.04,
        align: 'right',
        maxLines: 1,
      },
      {
        field: 'businessPhone',
        keys: ['hotline', 'seller', 'shop', 'store'],
        widthRatio: 0.24,
        heightRatio: 0.04,
        align: 'left',
        maxLines: 1,
      },
      {
        field: 'businessName',
        keys: ['brand', 'company', 'shop', 'store', 'business'],
        widthRatio: 0.38,
        heightRatio: 0.05,
        align: 'left',
        maxLines: 2,
      },
      {
        field: 'items',
        keys: ['item', 'product', 'detail', 'description', 'products'],
        widthRatio: 0.7,
        heightRatio: 0.08,
        align: 'left',
        maxLines: 4,
      },
    ];

    for (const def of defs) {
      const hit = words.find((word) => {
        const text = String(word?.text || '')
          .toLowerCase()
          .replace(/[^a-z০-৯\u0980-\u09FF]/g, '');
        if (!text || text.length < 2) return false;
        return def.keys.some(
          (k) => text === k || text.startsWith(k) || text.includes(k),
        );
      });
      if (hit) {
        mapping[def.field] = this.makeBox(
          hit,
          width,
          height,
          def.widthRatio,
          def.heightRatio,
          def.align,
          def.maxLines,
        );
      }
    }

    // Fallback: add default positions for essential fields not detected
    const defaults = this.buildDefaultMapping(width, height);
    for (const [key, box] of Object.entries(defaults)) {
      if (!mapping[key]) mapping[key] = { ...box, source: 'auto-default' };
    }

    return mapping;
  }

  // ── Default field positions (standard Bangladesh slip layout) ─────────────────
  private buildDefaultMapping(
    width: number,
    height: number,
  ): Record<string, any> {
    return {
      customerName: {
        x: Math.round(width * 0.2),
        y: Math.round(height * 0.14),
        width: Math.round(width * 0.6),
        height: Math.round(height * 0.05),
        fontSize: 20,
        fontWeight: 700,
        align: 'left',
        maxLines: 2,
        source: 'auto-default',
        fieldKey: 'customerName',
      },
      customerPhone: {
        x: Math.round(width * 0.2),
        y: Math.round(height * 0.22),
        width: Math.round(width * 0.45),
        height: Math.round(height * 0.04),
        fontSize: 18,
        fontWeight: 700,
        align: 'left',
        maxLines: 1,
        source: 'auto-default',
        fieldKey: 'customerPhone',
      },
      customerAddress: {
        x: Math.round(width * 0.1),
        y: Math.round(height * 0.32),
        width: Math.round(width * 0.8),
        height: Math.round(height * 0.22),
        fontSize: 16,
        fontWeight: 600,
        align: 'left',
        maxLines: 6,
        source: 'auto-default',
        fieldKey: 'customerAddress',
      },
      orderId: {
        x: Math.round(width * 0.2),
        y: Math.round(height * 0.06),
        width: Math.round(width * 0.25),
        height: Math.round(height * 0.04),
        fontSize: 16,
        fontWeight: 700,
        align: 'left',
        maxLines: 1,
        source: 'auto-default',
        fieldKey: 'orderId',
      },
      date: {
        x: Math.round(width * 0.6),
        y: Math.round(height * 0.06),
        width: Math.round(width * 0.28),
        height: Math.round(height * 0.04),
        fontSize: 14,
        fontWeight: 600,
        align: 'right',
        maxLines: 1,
        source: 'auto-default',
        fieldKey: 'date',
      },
      codAmount: {
        x: Math.round(width * 0.6),
        y: Math.round(height * 0.57),
        width: Math.round(width * 0.28),
        height: Math.round(height * 0.05),
        fontSize: 18,
        fontWeight: 800,
        align: 'right',
        maxLines: 1,
        source: 'auto-default',
        fieldKey: 'codAmount',
      },
    };
  }

  private makeBox(
    word: any,
    width: number,
    height: number,
    boxWidthRatio: number,
    boxHeightRatio: number,
    align: 'left' | 'right' | 'center' = 'left',
    maxLines = 2,
  ) {
    const bbox = word?.bbox || {};
    const x0 = Number(bbox.x0 || 0);
    const x1 = Number(bbox.x1 || x0 + 80);
    const y0 = Number(bbox.y0 || 0);
    const y1 = Number(bbox.y1 || y0 + 24);
    const startX = Math.min(Math.max(x1 + 14, width * 0.08), width * 0.72);
    const boxW = Math.min(
      Math.max(width * boxWidthRatio, 100),
      width - startX - 20,
    );
    const lineH = Math.max((y1 - y0) * 1.2, 20);
    const boxH = Math.max(height * boxHeightRatio, lineH * maxLines * 1.2);
    const fontSize = Math.max(Math.round((y1 - y0) * 0.92), 14);
    return {
      x: Math.round(startX),
      y: Math.round(Math.max(y0 - 4, 8)),
      width: Math.round(boxW),
      height: Math.round(boxH),
      fontSize,
      fontWeight: 700,
      align,
      maxLines,
      source: 'auto',
      fieldKey: word?.fieldKey,
    };
  }
}
