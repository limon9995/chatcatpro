import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import * as path from 'path';
import { MemoService } from './memo.service';
import { MemoLayout, MemoTheme } from './memo.types';

@SkipThrottle()
@Controller('memo')
export class MemoController {
  constructor(private readonly memoService: MemoService) {}

  @Get('html')
  async html(
    @Query('ids') idsRaw: string,
    @Query('pageId') pageIdRaw: string | undefined,
    @Query('layout') layoutRaw: MemoLayout | undefined,
    @Query('theme') themeRaw: MemoTheme | undefined,
    @Res() res: any,
  ) {
    const ids = (idsRaw || '')
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x) && x > 0)
      .slice(0, 3);
    const pageId = pageIdRaw ? Number(pageIdRaw) : undefined;
    const layout: MemoLayout = layoutRaw === 'invoice' ? 'invoice' : 'memo';
    const theme: MemoTheme = ['classic', 'fashion', 'luxury'].includes(
      themeRaw || '',
    )
      ? (themeRaw as MemoTheme)
      : 'classic';
    const html = await this.memoService.generateA4MemoHtml(
      ids,
      pageId,
      layout,
      theme,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Post('template/upload/:pageId')
  @UseInterceptors(FileInterceptor('file'))
  async uploadTemplate(
    @Param('pageId', ParseIntPipe) pageId: number,
    @UploadedFile() file: any,
  ) {
    if (!file?.buffer)
      throw new BadRequestException('Template file is required');
    return this.memoService.uploadTemplate(pageId, file);
  }

  @Get('template/:pageId')
  async getTemplate(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.memoService.getUploadedTemplate(pageId);
  }

  @Post('template/:pageId/preview')
  async previewTemplate(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body() body: any,
  ) {
    if (body?.mapping)
      await this.memoService.updateTemplateMapping(pageId, body.mapping, false);
    return this.memoService.getTemplatePreview(
      pageId,
      body?.orderId ? Number(body.orderId) : undefined,
    );
  }

  @Patch('template/:pageId/mapping')
  async updateTemplateMapping(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body() body: any,
  ) {
    if (!body?.mapping || typeof body.mapping !== 'object')
      throw new BadRequestException('mapping is required');
    return this.memoService.updateTemplateMapping(
      pageId,
      body.mapping,
      Boolean(body.confirm),
    );
  }

  @Post('template/:pageId/confirm')
  async confirmTemplate(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.memoService.confirmTemplate(pageId);
  }

  @Get('template/editor/:pageId')
  async editor(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Query('orderId') orderIdRaw: string | undefined,
    @Res() res: any,
  ) {
    const html = await this.memoService.getTemplateEditorHtml(
      pageId,
      orderIdRaw ? Number(orderIdRaw) : undefined,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('template/preview-page/:pageId')
  async previewPage(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Query('orderId') orderIdRaw: string | undefined,
    @Res() res: any,
  ) {
    const data = await this.memoService.getTemplatePreview(
      pageId,
      orderIdRaw ? Number(orderIdRaw) : undefined,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(data.previewHtml);
  }

  @Get('template/file/:fileName')
  async getTemplateFile(@Param('fileName') fileName: string, @Res() res: any) {
    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '');
    const abs = path.join(process.cwd(), 'storage', 'memo-templates', safeName);
    res.sendFile(abs);
  }
}
