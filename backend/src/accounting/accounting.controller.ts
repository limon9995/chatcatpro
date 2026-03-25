import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { AccountingService } from './accounting.service';
import { AnalyticsService } from './analytics.service';

@SkipThrottle({ global: true, auth: true })
@Controller('client-dashboard')
@UseGuards(AuthGuard)
export class AccountingController {
  constructor(
    private readonly svc: AccountingService,
    private readonly analytics: AnalyticsService,
    private readonly auth: AuthService,
  ) {}

  private pid(req: any, pageId: string): number {
    const n = Number(pageId);
    this.auth.ensurePageAccess(req.user || req.authUser, n);
    return n;
  }

  // ── Overview ──────────────────────────────────────────────────────────────
  @Get(':pageId/accounting/overview')
  overview(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.getOverview(this.pid(r, p));
  }

  // ── Chart data ────────────────────────────────────────────────────────────
  @Get(':pageId/accounting/charts/daily-trend')
  dailyTrend(
    @Param('pageId') p: string,
    @Query('days') d: string,
    @Req() r: any,
  ) {
    return this.svc.getDailyTrend(this.pid(r, p), d ? Number(d) : 30);
  }

  @Get(':pageId/accounting/charts/expense-breakdown')
  expBreakdown(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.getExpenseBreakdown(this.pid(r, p));
  }

  @Get(':pageId/accounting/charts/order-status')
  orderStatus(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.getOrderStatusDist(this.pid(r, p));
  }

  // ── Collections ───────────────────────────────────────────────────────────
  @Get(':pageId/accounting/collections')
  listCols(
    @Param('pageId') p: string,
    @Query('from') f: string,
    @Query('to') t: string,
    @Req() r: any,
  ) {
    return this.svc.listCollections(this.pid(r, p), f, t);
  }

  @Post(':pageId/accounting/collections')
  addCol(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.addCollection(this.pid(r, p), b);
  }

  @Delete(':pageId/accounting/collections/:id')
  delCol(@Param('pageId') p: string, @Param('id') id: string, @Req() r: any) {
    return this.svc.deleteCollection(this.pid(r, p), Number(id));
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  @Get(':pageId/accounting/expenses')
  listExp(
    @Param('pageId') p: string,
    @Query('from') f: string,
    @Query('to') t: string,
    @Req() r: any,
  ) {
    return this.svc.listExpenses(this.pid(r, p), f, t);
  }

  @Post(':pageId/accounting/expenses')
  addExp(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.addExpense(this.pid(r, p), b);
  }

  @Delete(':pageId/accounting/expenses/:id')
  delExp(@Param('pageId') p: string, @Param('id') id: string, @Req() r: any) {
    return this.svc.deleteExpense(this.pid(r, p), Number(id));
  }

  // ── Returns ───────────────────────────────────────────────────────────────
  @Get(':pageId/accounting/returns')
  listRet(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.listReturns(this.pid(r, p));
  }

  @Post(':pageId/accounting/returns')
  addRet(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.addReturn(this.pid(r, p), b);
  }

  // ── Exchanges ─────────────────────────────────────────────────────────────
  @Get(':pageId/accounting/exchanges')
  listExch(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.listExchanges(this.pid(r, p));
  }

  @Post(':pageId/accounting/exchanges')
  addExch(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.addExchange(this.pid(r, p), b);
  }

  // ── Reports ───────────────────────────────────────────────────────────────
  @Get(':pageId/accounting/report/:period')
  getReport(
    @Param('pageId') p: string,
    @Param('period') period: string,
    @Req() r: any,
  ) {
    const per = (
      ['daily', 'weekly', 'monthly'].includes(period) ? period : 'monthly'
    ) as any;
    return this.svc.getReport(this.pid(r, p), per);
  }

  // ── Export ────────────────────────────────────────────────────────────────
  @Get(':pageId/accounting/export/data')
  exportData(
    @Param('pageId') p: string,
    @Query('type') type: string,
    @Req() r: any,
  ) {
    const t = (
      ['collections', 'expenses', 'returns', 'exchanges', 'summary'].includes(
        type,
      )
        ? type
        : 'summary'
    ) as any;
    return this.svc.getExportData(this.pid(r, p), t);
  }

  @Get(':pageId/accounting/export/report-html')
  async exportHtml(
    @Param('pageId') p: string,
    @Query('period') period: string,
    @Req() r: any,
    @Res() res: any,
  ) {
    const per = (
      ['daily', 'weekly', 'monthly'].includes(period) ? period : 'monthly'
    ) as any;
    const html = await this.svc.buildReportHtml(this.pid(r, p), per);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  // ── V6: Advanced Analytics ────────────────────────────────────────────────
  @Get(':pageId/analytics/summary')
  analyticsSummary(
    @Param('pageId') p: string,
    @Query('period') period: string,
    @Req() r: any,
  ) {
    const per = (
      ['daily', 'weekly', 'monthly'].includes(period) ? period : 'monthly'
    ) as any;
    return this.analytics.getAdvancedAnalytics(this.pid(r, p), per);
  }

  @Get(':pageId/analytics/profit-trend')
  profitTrend(
    @Param('pageId') p: string,
    @Query('period') period: string,
    @Req() r: any,
  ) {
    const per = (
      ['daily', 'weekly', 'monthly'].includes(period) ? period : 'monthly'
    ) as any;
    return this.analytics.getProfitTrend(this.pid(r, p), per);
  }

  @Get(':pageId/analytics/negotiation')
  negotiation(
    @Param('pageId') p: string,
    @Query('period') period: string,
    @Req() r: any,
  ) {
    const per = (
      ['daily', 'weekly', 'monthly'].includes(period) ? period : 'monthly'
    ) as any;
    const { from, to } = this.svc.periodRange(per);
    return this.analytics.getNegotiationAnalytics(this.pid(r, p), from, to);
  }

  @Get(':pageId/analytics/collection-methods')
  collectionMethods(
    @Param('pageId') p: string,
    @Query('period') period: string,
    @Req() r: any,
  ) {
    const per = (
      ['daily', 'weekly', 'monthly'].includes(period) ? period : 'monthly'
    ) as any;
    const { from, to } = this.svc.periodRange(per);
    return this.analytics.getCollectionMethodBreakdown(
      this.pid(r, p),
      from,
      to,
    );
  }

  @Get(':pageId/analytics/top-products')
  topProducts(
    @Param('pageId') p: string,
    @Query('period') period: string,
    @Req() r: any,
  ) {
    const per = (
      ['daily', 'weekly', 'monthly'].includes(period) ? period : 'monthly'
    ) as any;
    const { from, to } = this.svc.periodRange(per);
    return this.analytics.getProductPerformance(this.pid(r, p), from, to);
  }
}
