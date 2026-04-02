import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class PageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async getById(id: number) {
    const page = await this.prisma.page.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  async getBusinessSettings(id: number) {
    const page: any = await this.getById(id);
    return {
      pageId: page.id,
      pageName: page.pageName || '',
      businessName: page.businessName || page.pageName || '',
      businessPhone: page.businessPhone || page.phone || '',
      businessAddress: page.businessAddress || page.address || '',
      websiteUrl: page.websiteUrl || '',
      logoUrl: page.logoUrl || '',
      memoFooterText: page.memoFooterText || 'Thank you for your order',
      codLabel: page.codLabel || 'COD',
      currencySymbol: page.currencySymbol || '৳',
      primaryColor: page.primaryColor || '',
      deliveryFeeInsideDhaka: Number(page.deliveryFeeInsideDhaka ?? 0) || 0,
      deliveryFeeOutsideDhaka: Number(page.deliveryFeeOutsideDhaka ?? 0) || 0,
      infoModeOn: Boolean(page.infoModeOn),
      orderModeOn: Boolean(page.orderModeOn),
      printModeOn: Boolean(page.printModeOn),
      memoSaveModeOn: Boolean(page.memoSaveModeOn),
      memoTemplateModeOn: Boolean(page.memoTemplateModeOn),
      autoMemoDesignModeOn: Boolean(page.autoMemoDesignModeOn),
      // SECURITY: pageToken is NEVER returned here
    };
  }

  async updateById(id: number, body: any) {
    const data: any = {};

    if (typeof body.pageId === 'string') data.pageId = body.pageId.trim();
    if (typeof body.pageName === 'string') data.pageName = body.pageName.trim();
    if (typeof body.verifyToken === 'string')
      data.verifyToken = body.verifyToken.trim();
    if (typeof body.phone === 'string') data.phone = body.phone.trim();
    if (typeof body.address === 'string') data.address = body.address.trim();

    // SECURITY: if pageToken is provided via updateById, encrypt it before saving
    if (typeof body.pageToken === 'string') {
      data.pageToken = this.encryption.encryptIfNeeded(body.pageToken.trim());
    }

    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
    if (typeof body.automationOn === 'boolean')
      data.automationOn = body.automationOn;
    if (typeof body.ocrOn === 'boolean') data.ocrOn = body.ocrOn;

    if (typeof body.infoModeOn === 'boolean') data.infoModeOn = body.infoModeOn;
    if (typeof body.orderModeOn === 'boolean')
      data.orderModeOn = body.orderModeOn;
    if (typeof body.printModeOn === 'boolean')
      data.printModeOn = body.printModeOn;
    if (typeof body.callConfirmModeOn === 'boolean')
      data.callConfirmModeOn = body.callConfirmModeOn;
    if (typeof body.memoSaveModeOn === 'boolean')
      data.memoSaveModeOn = body.memoSaveModeOn;
    if (typeof body.memoTemplateModeOn === 'boolean')
      data.memoTemplateModeOn = body.memoTemplateModeOn;
    if (typeof body.autoMemoDesignModeOn === 'boolean')
      data.autoMemoDesignModeOn = body.autoMemoDesignModeOn;

    // V18: image recognition settings
    if (typeof body.imageRecognitionOn === 'boolean')
      data.imageRecognitionOn = body.imageRecognitionOn;
    if (typeof body.imageFallbackAiOn === 'boolean')
      data.imageFallbackAiOn = body.imageFallbackAiOn;
    if (typeof body.textFallbackAiOn === 'boolean')
      data.textFallbackAiOn = body.textFallbackAiOn;
    if (body.imageHighConfidence !== undefined)
      data.imageHighConfidence = Math.min(1, Math.max(0, Number(body.imageHighConfidence) || 0.75));
    if (body.imageMediumConfidence !== undefined)
      data.imageMediumConfidence = Math.min(1, Math.max(0, Number(body.imageMediumConfidence) || 0.45));

    if (typeof body.businessName === 'string')
      data.businessName = body.businessName.trim();
    if (typeof body.businessPhone === 'string')
      data.businessPhone = body.businessPhone.trim();
    if (typeof body.businessAddress === 'string')
      data.businessAddress = body.businessAddress.trim();
    if (typeof body.websiteUrl === 'string')
      data.websiteUrl = body.websiteUrl.trim();
    if (typeof body.logoUrl === 'string') data.logoUrl = body.logoUrl.trim();
    if (typeof body.memoFooterText === 'string')
      data.memoFooterText = body.memoFooterText.trim();
    if (typeof body.codLabel === 'string') data.codLabel = body.codLabel.trim();
    if (typeof body.currencySymbol === 'string')
      data.currencySymbol = body.currencySymbol.trim();
    if (typeof body.primaryColor === 'string')
      data.primaryColor = body.primaryColor.trim();
    // V8: custom product code prefix — uppercase, 2-6 letters only
    if (typeof body.productCodePrefix === 'string') {
      const p = body.productCodePrefix
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, '');
      if (p.length >= 2 && p.length <= 6) data.productCodePrefix = p;
    }

    if (body.deliveryFeeInsideDhaka !== undefined)
      data.deliveryFeeInsideDhaka = Number(body.deliveryFeeInsideDhaka) || 0;
    if (body.deliveryFeeOutsideDhaka !== undefined)
      data.deliveryFeeOutsideDhaka = Number(body.deliveryFeeOutsideDhaka) || 0;

    if (Object.keys(data).length === 0) return this.getById(id);

    try {
      return await this.prisma.page.update({ where: { id }, data });
    } catch {
      throw new NotFoundException('Page not found');
    }
  }

  async updateBusinessSettings(id: number, body: any) {
    await this.updateById(id, body);
    return this.getBusinessSettings(id);
  }
}
