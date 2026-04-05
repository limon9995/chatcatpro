import { Controller, Get, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PrintService, PrintStyle } from './print.service';

@SkipThrottle()
@Controller('print')
export class PrintController {
  constructor(private readonly printService: PrintService) {}

  @Get('preview')
  preview(@Query('ids') idsRaw?: string, @Query('pageId') pageId?: string) {
    const ids = this.parseIds(idsRaw);
    return this.printService.getPrintPreview(ids, pageId ? Number(pageId) : undefined);
  }

  // ── HTML preview of any print style ───────────────────────────────────────
  @Get('html')
  async printHtml(
    @Query('ids') idsRaw: string,
    @Query('style') style: string,
    @Query('pageId') pageId: string | undefined,
    @Res() res: Response,
  ) {
    const ids = this.parseIds(idsRaw);
    const orders = await this.printService.getOrders(ids, pageId ? Number(pageId) : undefined);
    const validStyle = (
      ['classic', 'modern', 'minimal', 'colorful'].includes(style)
        ? style
        : 'classic'
    ) as PrintStyle;
    const html = this.printService.buildPrintHTML(orders, validStyle);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('invoice-pdf')
  async invoicePDF(
    @Query('ids') idsRaw: string,
    @Query('style') style: string,
    @Query('pageId') pageId: string | undefined,
    @Res() res: Response,
  ) {
    const ids = this.parseIds(idsRaw);
    const validStyle = (
      ['classic', 'modern', 'minimal', 'colorful'].includes(style)
        ? style
        : 'classic'
    ) as PrintStyle;
    const pdf = await this.printService.generateInvoicePDF(ids, validStyle, pageId ? Number(pageId) : undefined);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="invoice.pdf"',
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  private parseIds(raw?: string) {
    return (raw || '')
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x) && x > 0)
      .slice(0, 20); // max 20 orders per print
  }
}
