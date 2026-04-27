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
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';
import { GlobalSettingsService } from '../common/global-settings.service';

@SkipThrottle({ global: true, auth: true })
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly svc: AdminService,
    private readonly globalSettings: GlobalSettingsService,
  ) {}

  @Get('laptop-ai')
  getLaptopAi() { return this.globalSettings.get(); }

  @Patch('laptop-ai')
  setLaptopAi(@Body() b: any) {
    const valid = ['all', 'generate_only', 'none'];
    const mode = valid.includes(b?.localAiMode) ? b.localAiMode : 'none';
    return this.globalSettings.set({ localAiMode: mode });
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

  @Post('wallet/pricing/apply-all')
  applyPricingToAll(@Body() b: any) {
    return this.svc.applyPricingToAll({
      costPerTextMsgBdt: b?.costPerTextMsgBdt !== undefined ? Number(b.costPerTextMsgBdt) : undefined,
      costPerVoiceMsgBdt: b?.costPerVoiceMsgBdt !== undefined ? Number(b.costPerVoiceMsgBdt) : undefined,
      costPerImageBdt: b?.costPerImageBdt !== undefined ? Number(b.costPerImageBdt) : undefined,
      costPerImageLocalBdt: b?.costPerImageLocalBdt !== undefined ? Number(b.costPerImageLocalBdt) : undefined,
      costPerAnalyzeBdt: b?.costPerAnalyzeBdt !== undefined ? Number(b.costPerAnalyzeBdt) : undefined,
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
    if (!amount || amount <= 0) throw new BadRequestException('amountBdt must be positive');
    return this.svc.rechargePageWallet(pageId, amount, b?.transactionId || 'MANUAL', b?.note);
  }

  @Patch('wallet/:pageId/pricing')
  updatePricing(
    @Param('pageId', ParseIntPipe) pageId: number,
    @Body() b: any,
  ) {
    return this.svc.updatePagePricing(pageId, {
      costPerTextMsgBdt: b?.costPerTextMsgBdt !== undefined ? Number(b.costPerTextMsgBdt) : undefined,
      costPerVoiceMsgBdt: b?.costPerVoiceMsgBdt !== undefined ? Number(b.costPerVoiceMsgBdt) : undefined,
      costPerImageBdt: b?.costPerImageBdt !== undefined ? Number(b.costPerImageBdt) : undefined,
      costPerImageLocalBdt: b?.costPerImageLocalBdt !== undefined ? Number(b.costPerImageLocalBdt) : undefined,
      costPerAnalyzeBdt: b?.costPerAnalyzeBdt !== undefined ? Number(b.costPerAnalyzeBdt) : undefined,
    });
  }

  @Post('wallet/requests/:id/approve')
  approveRechargeRequest(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const adminUsername = req.authUser?.username || req.user?.username || 'admin';
    return this.svc.approveRechargeRequest(id, adminUsername);
  }

  @Post('wallet/requests/:id/reject')
  rejectRechargeRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() b: any,
  ) {
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
      nextBillingDate: b?.nextBillingDate ? new Date(b.nextBillingDate) : b?.nextBillingDate,
      daysToAdd: b?.daysToAdd !== undefined ? Number(b.daysToAdd) : undefined,
    });
  }
}
