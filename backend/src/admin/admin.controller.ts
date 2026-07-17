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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';
import { GlobalSettingsService } from '../common/global-settings.service';
import { ApiKeysService } from '../common/api-keys.service';
import { GeminiKeyRotatorService } from '../common/gemini-key-rotator.service';

@SkipThrottle({ global: true, auth: true })
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly svc: AdminService,
    private readonly globalSettings: GlobalSettingsService,
    private readonly apiKeys: ApiKeysService,
    private readonly geminiRotator: GeminiKeyRotatorService,
  ) {}

  @Get('api-keys')
  getApiKeys() {
    return this.apiKeys.getAllMasked();
  }

  @Patch('api-keys')
  setApiKeys(@Body() b: any) {
    return this.apiKeys.set(b || {});
  }

  @Get('gemini-key-status')
  getGeminiKeyStatus() {
    return this.geminiRotator.getStatus();
  }

  @Get('laptop-ai')
  getLaptopAi() {
    return this.globalSettings.get();
  }

  @Patch('laptop-ai')
  setLaptopAi(@Body() b: any) {
    const patch: any = {};
    const validModes = ['all', 'generate_only', 'none'];
    const validProviders = ['gemini', 'openai', 'fal', 'ideogram'];

    if (b?.localAiMode !== undefined) {
      patch.localAiMode = validModes.includes(b.localAiMode) ? b.localAiMode : 'none';
    }
    if (Array.isArray(b?.imageProviderOrder)) {
      const filtered = b.imageProviderOrder.filter((p: any) => validProviders.includes(p));
      if (filtered.length > 0) patch.imageProviderOrder = filtered;
    }
    return this.globalSettings.set(patch);
  }

  private parsePageId(raw: string): number {
    const pageId = Number(raw);
    if (!Number.isInteger(pageId) || pageId <= 0) {
      throw new BadRequestException('Invalid pageId');
    }
    return pageId;
  }

  @Get('overview') overview() {
    return this.svc.overview();
  }
  @Get('clients') clients() {
    return this.svc.clients();
  }
  @Get('clients/:id') clientDetails(@Param('id') id: string) {
    return this.svc.clientDetails(id);
  }
  @Patch('users/:userId/account-status')
  setAccountStatus(
    @Param('userId') userId: string,
    @Body() b: { isActive: boolean },
  ) {
    return this.svc.setUserAccountStatus(userId, b.isActive);
  }
  @Patch('pages/:pageId/website-status')
  setWebsiteStatus(
    @Param('pageId') p: string,
    @Body() b: { enabled: boolean },
  ) {
    return this.svc.setPageWebsiteStatus(this.parsePageId(p), b.enabled);
  }
  @Get('pages') allPages() {
    return this.svc.getAllPages();
  }
  @Get('health') health() {
    return this.svc.health();
  }
  @Get('pages/:pageId/settings') getPageSettings(@Param('pageId') p: string) {
    return this.svc.getPageSettings(this.parsePageId(p));
  }
  @Patch('pages/:pageId/settings') updatePageSettings(
    @Param('pageId') p: string,
    @Body() b: any,
  ) {
    return this.svc.updatePageSettings(this.parsePageId(p), b || {});
  }

  @Get('pages/:pageId/app-credentials')
  getPageAppCredentials(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.svc.getPageAppCredentials(pageId);
  }

  @Patch('pages/:pageId/app-credentials')
  setPageAppCredentials(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body() b: any,
  ) {
    return this.svc.setPageAppCredentials(pageId, b?.fbAppId, b?.fbAppSecret);
  }

  // ── Global bot-knowledge ──────────────────────────────────────────────────
  @Get('bot-knowledge/global')
  globalBotKnowledge() {
    return this.svc.getGlobalBotKnowledge();
  }

  @Patch('bot-knowledge/global/questions')
  updateGlobalQuestions(@Body('questions') q: any[]) {
    return this.svc.updateGlobalBotQuestions(q || []);
  }

  @Patch('bot-knowledge/global/system-replies')
  updateGlobalReplies(@Body('systemReplies') s: any) {
    return this.svc.updateGlobalBotSystemReplies(s || {});
  }

  @Patch('bot-knowledge/global/areas')
  updateGlobalAreas(@Body('areas') a: any[]) {
    return this.svc.updateGlobalBotAreas(a || []);
  }

  @Get('bot-knowledge/learning-log')
  learningLog() {
    return this.svc.getBotLearningLog();
  }

  @Patch('bot-knowledge/global/pricing-info')
  updateGlobalPricingInfo(@Body('pricingInfo') pricingInfo: string) {
    return this.svc.updateGlobalBotPricingInfo(pricingInfo ?? '');
  }

  @Post('bot-knowledge/learning-log/create-question')
  createFromLearning(@Body() b: any) {
    return this.svc.createQuestionFromLearning(b || {});
  }

  // ── Per-client page knowledge ─────────────────────────────────────────────
  @Get('bot-knowledge/page/:pageId')
  getClientKnowledge(@Param('pageId') p: string) {
    return this.svc.getClientBotKnowledge(this.parsePageId(p));
  }

  @Patch('bot-knowledge/page/:pageId/questions')
  setClientQuestions(@Param('pageId') p: string, @Body('questions') q: any[]) {
    return this.svc.setClientPageQuestions(this.parsePageId(p), q || []);
  }

  @Patch('bot-knowledge/page/:pageId/system-replies')
  setClientReplies(@Param('pageId') p: string, @Body('systemReplies') s: any) {
    return this.svc.setClientPageSystemReplies(this.parsePageId(p), s || {});
  }

  @Post('bot-knowledge/page/:pageId/push-global/:key')
  pushGlobalToPage(@Param('pageId') p: string, @Param('key') key: string) {
    return this.svc.pushGlobalQuestionToPage(this.parsePageId(p), key);
  }

  // ── V10: Courier tutorial videos (backward-compat) ───────────────────────
  @Get('courier-tutorials')
  getCourierTutorials() {
    return this.svc.getCourierTutorials();
  }

  @Patch('courier-tutorials')
  saveCourierTutorials(@Body() b: any) {
    return this.svc.saveCourierTutorials(b || {});
  }

  // ── V17: Unified tutorials (courier + facebookAccessToken + generalOnboarding) ──
  @Get('tutorials')
  getTutorials() {
    return this.svc.getTutorials();
  }

  @Patch('tutorials')
  saveTutorials(@Body() b: any) {
    return this.svc.saveTutorials(b || {});
  }

  // ── Global Config (callFeatureEnabled, callServers) ───────────────────────
  @Get('global-config')
  getGlobalConfig() {
    return this.svc.getGlobalConfig();
  }

  @Patch('global-config')
  saveGlobalConfig(@Body() b: any) {
    return this.svc.saveGlobalConfig(b || {});
  }

  // ── Admin Payment Config ──────────────────────────────────────────────────
  @Get('payment-config')
  getAdminPaymentConfig() {
    const cfg = this.svc.getGlobalConfig();
    const p = cfg.adminPayment || {};
    // Mask secrets before returning
    return {
      smsGatewayEnabled: p.smsGatewayEnabled ?? false,
      smsGatewayToken: p.smsGatewayToken ?? '',
      bkashEnabled: p.bkashEnabled ?? false,
      bkashAppKey: p.bkashAppKey ? '***' + p.bkashAppKey.slice(-4) : '',
      bkashAppSecret: p.bkashAppSecret ? '••••••••' : '',
      bkashUsername: p.bkashUsername ?? '',
      bkashSandbox: p.bkashSandbox ?? false,
      nagadEnabled: p.nagadEnabled ?? false,
      nagadMerchantId: p.nagadMerchantId ?? '',
      nagadMerchantPrivateKey: p.nagadMerchantPrivateKey ? '••••••••' : '',
      recentSms: this.svc.getRecentAdminSms(),
    };
  }

  @Post('payment-config')
  async saveAdminPaymentConfig(@Body() b: any) {
    const current = this.svc.getGlobalConfig().adminPayment || {};
    // Don't overwrite secrets if placeholder sent
    const patch: any = { ...b };
    if (patch.bkashAppSecret === '••••••••') delete patch.bkashAppSecret;
    if (patch.nagadMerchantPrivateKey === '••••••••') delete patch.nagadMerchantPrivateKey;
    // If token changed — disconnect all admin devices
    const oldToken = current.smsGatewayToken;
    const newToken = patch.smsGatewayToken;
    if (newToken && oldToken && newToken !== oldToken) {
      await this.svc.clearAdminSmsDevices();
    }
    this.svc.saveGlobalConfig({ adminPayment: { ...current, ...patch } });
    return { success: true };
  }

  @Post('sms-incoming')
  receiveAdminSms(@Query('token') token: string, @Body() b: any) {
    const cfg = this.svc.getGlobalConfig().adminPayment || {};
    if (!cfg.smsGatewayEnabled || !cfg.smsGatewayToken || token !== cfg.smsGatewayToken) {
      return { success: false, message: 'Invalid token' };
    }
    const raw = String(b?.message || b?.text || '');
    if (!raw) return { success: false };
    // Reuse the SmsParser from sms-gateway module
    const parsed = this.svc.parseAdminSms(raw);
    this.svc.saveAdminSms({ ...parsed, rawText: raw, receivedAt: new Date().toISOString() });
    return { success: true };
  }

  // ── Manual Call Queue ─────────────────────────────────────────────────────
  @Get('call-queue')
  getCallQueue(@Query('pageId') pageId?: string) {
    return this.svc.getAdminCallQueue(pageId ? Number(pageId) : undefined);
  }

  @Post('orders/:orderId/manual-call-log')
  adminLogManualCall(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() b: any,
  ) {
    return this.svc.adminLogManualCall(orderId, b || {});
  }

  // ── Wallet Management ─────────────────────────────────────────────────────

  @Get('wallet')
  getAllPagesWallet() {
    return this.svc.getAllPagesWallet();
  }

  @Get('wallet/requests')
  getAllRechargeRequests(@Query('status') status?: string) {
    return this.svc.getAllRechargeRequests(status);
  }

  @Get('wallet/pricing/global')
  getGlobalPricing() {
    return this.svc.getGlobalPricing();
  }

  @Post('wallet/pricing/save-default')
  saveDefaultPricing(@Body() b: any) {
    const n = (v: any) => (v !== undefined ? Number(v) : undefined);
    return this.svc.saveDefaultPricing({
      costPerTextMsgBdt: n(b?.costPerTextMsgBdt),
      costPerVoiceMsgBdt: n(b?.costPerVoiceMsgBdt),
      costPerImageBdt: n(b?.costPerImageBdt),
      costPerImageLocalBdt: n(b?.costPerImageLocalBdt),
      costPerAnalyzeBdt: n(b?.costPerAnalyzeBdt),
      costPerOcrLocalBdt: n(b?.costPerOcrLocalBdt),
      costPerOcrAiBdt: n(b?.costPerOcrAiBdt),
      costPerRecurringNotifBdt: n(b?.costPerRecurringNotifBdt),
      costPerBroadcastMsgBdt: n(b?.costPerBroadcastMsgBdt),
      costPerKeywordReplyBdt: n(b?.costPerKeywordReplyBdt),
      costPerAiGenerateBdt: n(b?.costPerAiGenerateBdt),
      costPerMemoPrintBdt: n(b?.costPerMemoPrintBdt),
      costPerCommentReplyBdt: n(b?.costPerCommentReplyBdt),
    });
  }

  @Post('wallet/pricing/apply-all')
  applyPricingToAll(@Body() b: any) {
    const n = (v: any) => (v !== undefined ? Number(v) : undefined);
    return this.svc.applyPricingToAll({
      costPerTextMsgBdt: n(b?.costPerTextMsgBdt),
      costPerVoiceMsgBdt: n(b?.costPerVoiceMsgBdt),
      costPerImageBdt: n(b?.costPerImageBdt),
      costPerImageLocalBdt: n(b?.costPerImageLocalBdt),
      costPerAnalyzeBdt: n(b?.costPerAnalyzeBdt),
      costPerOcrLocalBdt: n(b?.costPerOcrLocalBdt),
      costPerOcrAiBdt: n(b?.costPerOcrAiBdt),
      costPerRecurringNotifBdt: n(b?.costPerRecurringNotifBdt),
      costPerBroadcastMsgBdt: n(b?.costPerBroadcastMsgBdt),
      costPerKeywordReplyBdt: n(b?.costPerKeywordReplyBdt),
      costPerAiGenerateBdt: n(b?.costPerAiGenerateBdt),
      costPerMemoPrintBdt: n(b?.costPerMemoPrintBdt),
      costPerCommentReplyBdt: n(b?.costPerCommentReplyBdt),
    });
  }

  @Get('wallet/:pageId')
  getPageWallet(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.svc.getPageWallet(pageId);
  }

  @Post('wallet/:pageId/recharge')
  rechargeWallet(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body() b: any,
  ) {
    const amount = Number(b?.amountBdt);
    if (!amount || amount <= 0)
      throw new BadRequestException('amountBdt must be positive');
    return this.svc.rechargePageWallet(
      pageId,
      amount,
      b?.transactionId || 'MANUAL',
      b?.note,
    );
  }

  @Post('wallet/:pageId/adjust')
  adjustWallet(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body() b: any,
  ) {
    const amount = Number(b?.amountBdt);
    if (!amount) throw new BadRequestException('amountBdt must be non-zero');
    return this.svc.adjustPageWallet(pageId, amount, b?.note);
  }

  @Patch('wallet/:pageId/pricing')
  updatePricing(@Param('pageId', ParseIntPipe) pageId: number, @Body() b: any) {
    const n = (v: any) => (v !== undefined ? Number(v) : undefined);
    return this.svc.updatePagePricing(pageId, {
      costPerTextMsgBdt: n(b?.costPerTextMsgBdt),
      costPerVoiceMsgBdt: n(b?.costPerVoiceMsgBdt),
      costPerImageBdt: n(b?.costPerImageBdt),
      costPerImageLocalBdt: n(b?.costPerImageLocalBdt),
      costPerAnalyzeBdt: n(b?.costPerAnalyzeBdt),
      costPerOcrLocalBdt: n(b?.costPerOcrLocalBdt),
      costPerOcrAiBdt: n(b?.costPerOcrAiBdt),
      costPerRecurringNotifBdt: n(b?.costPerRecurringNotifBdt),
      costPerBroadcastMsgBdt: n(b?.costPerBroadcastMsgBdt),
      costPerKeywordReplyBdt: n(b?.costPerKeywordReplyBdt),
      costPerAiGenerateBdt: n(b?.costPerAiGenerateBdt),
      costPerMemoPrintBdt: n(b?.costPerMemoPrintBdt),
      costPerCommentReplyBdt: n(b?.costPerCommentReplyBdt),
    });
  }

  @Post('wallet/requests/:id/approve')
  approveRechargeRequest(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const adminUsername =
      req.authUser?.username || req.user?.username || 'admin';
    return this.svc.approveRechargeRequest(id, adminUsername);
  }

  @Post('wallet/requests/:id/reject')
  rejectRechargeRequest(@Param('id', ParseIntPipe) id: number, @Body() b: any) {
    return this.svc.rejectRechargeRequest(id, b?.reason);
  }

  // ── Subscription management ───────────────────────────────────────────────

  @Get('subscriptions')
  getAllSubscriptions() {
    return this.svc.getAllPageSubscriptions();
  }

  @Patch('subscriptions/:pageId')
  updateSubscription(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body() b: any,
  ) {
    return this.svc.updatePageSubscription(pageId, {
      subscriptionStatus: b?.subscriptionStatus,
      nextBillingDate: b?.nextBillingDate
        ? new Date(b.nextBillingDate)
        : b?.nextBillingDate,
      daysToAdd: b?.daysToAdd !== undefined ? Number(b.daysToAdd) : undefined,
    });
  }

  // ── Page Access Requests ────────────────────────────────────────────────

  @Get('page-requests')
  getPageRequests(@Query('status') status?: string) {
    return this.svc.getPageRequests(status);
  }

  @Get('page-requests/:id/approve-url')
  getPageRequestApproveUrl(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getPageRequestApproveUrl(id);
  }

  @Post('page-requests/:id/reject')
  rejectPageRequest(@Param('id', ParseIntPipe) id: number, @Body() b: any) {
    return this.svc.rejectPageRequest(id, b?.adminNote);
  }

  // ── WhatsApp Connection Requests ─────────────────────────────────────────

  @Get('wa-connect-requests')
  getWaConnectRequests(@Query('status') status?: string) {
    return this.svc.getWaConnectRequests(status);
  }

  @Post('wa-connect-requests/:id/finalize')
  finalizeWaConnectRequest(@Param('id', ParseIntPipe) id: number, @Body() b: any) {
    return this.svc.finalizeWaConnectRequest(id, {
      waPhoneNumberId: String(b?.waPhoneNumberId || ''),
      waToken: String(b?.waToken || ''),
      waVerifyToken: b?.waVerifyToken ? String(b.waVerifyToken) : undefined,
      adminNote: b?.adminNote ? String(b.adminNote) : undefined,
    });
  }

  @Post('wa-connect-requests/:id/reject')
  rejectWaConnectRequest(@Param('id', ParseIntPipe) id: number, @Body() b: any) {
    return this.svc.rejectWaConnectRequest(id, b?.adminNote);
  }

  // ── Bot Agent Catalog ────────────────────────────────────────────────────

  @Get('bot-agents')
  getBotAgents() {
    return this.svc.getBotAgents();
  }

  @Post('bot-agents')
  createBotAgent(@Body() b: any) {
    return this.svc.createBotAgent({
      agentKey: b?.agentKey,
      name: b?.name,
      description: b?.description,
      suitableFor: b?.suitableFor,
    });
  }

  @Patch('bot-agents/:id')
  updateBotAgent(@Param('id', ParseIntPipe) id: number, @Body() b: any) {
    return this.svc.updateBotAgent(id, b || {});
  }

  // ── Custom Agent Requests ────────────────────────────────────────────────

  @Get('agent-requests')
  getAgentRequests(@Query('status') status?: string) {
    return this.svc.getAgentRequests(status);
  }

  @Patch('agent-requests/:id')
  updateAgentRequestStatus(@Param('id', ParseIntPipe) id: number, @Body() b: any) {
    return this.svc.updateAgentRequestStatus(id, b?.status, b?.adminNote);
  }

  // ── Custom Domain Management ─────────────────────────────────────────────
  @Get('custom-domains')
  listCustomDomains() {
    return this.svc.listCustomDomains();
  }

  @Post('pages/:pageId/setup-domain')
  setupDomain(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body('domain') domain: string,
    @Body('skipSsl') skipSsl: boolean,
  ) {
    if (!domain?.trim()) throw new BadRequestException('domain required');
    return this.svc.setupCustomDomain(pageId, domain.trim().toLowerCase(), Boolean(skipSsl));
  }

  @Post('pages/:pageId/remove-domain')
  removeDomain(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.svc.removeCustomDomain(pageId);
  }

  @Get('syslog/snapshot')
  exportSysSnapshot(@Res() res: Response) {
    return this.svc.exportRegistrySnapshot(res);
  }

  @Get('syslog')
  getSysLog(
    @Query('q') search?: string,
    @Query('n') limit = '50',
    @Query('s') offset = '0',
  ) {
    return this.svc.getRegistryEntries({ search, limit: +limit, offset: +offset });
  }

  @Get('reports/revenue')
  getRevenueReport(@Query('month') month?: string) {
    return this.svc.getRevenueReport(month);
  }
}
