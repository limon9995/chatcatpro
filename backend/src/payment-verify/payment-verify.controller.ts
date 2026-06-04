import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { PaymentVerifyService } from './payment-verify.service';
import { MessengerService } from '../messenger/messenger.service';
import { DraftSession } from '../conversation-context/conversation-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { DraftOrderHandler } from '../webhook/handlers/draft-order.handler';

@Controller('payment-verify')
export class PaymentVerifyController {
  private readonly logger = new Logger(PaymentVerifyController.name);

  constructor(
    private readonly paymentVerify: PaymentVerifyService,
    private readonly messenger: MessengerService,
    private readonly prisma: PrismaService,
    private readonly draftOrder: DraftOrderHandler,
  ) {}

  /** Gateway IPN callback — called by SSLCommerz / ShurjoPay / ZiniPay */
  @Post('ipn/:method/:sessionToken')
  @Get('ipn/:method/:sessionToken')
  async handleIpn(
    @Param('method') method: string,
    @Param('sessionToken') sessionToken: string,
    @Body() body: any,
    @Query() query: any,
    @Res() res: any,
  ) {
    try {
      const result = await this.paymentVerify.handleIpn(method, sessionToken, body, query);

      if (result.paid) {
        const pending = await this.paymentVerify.getPendingPayment(sessionToken);
        if (pending) {

          // Web order path: confirm the order directly and redirect to success page
          if (pending.webOrderId) {
            try {
              await this.prisma.order.update({
                where: { id: pending.webOrderId },
                data: {
                  paymentStatus: 'advance_paid',
                  paymentVerifyStatus: 'verified',
                  transactionId: result.gatewayTxId || sessionToken,
                  status: 'CONFIRMED',
                  confirmedAt: new Date(),
                },
              });
              this.logger.log(`[IPN] Web order #${pending.webOrderId} auto-confirmed via ${method}`);
            } catch (err) {
              this.logger.error(`[IPN] web order confirm failed: ${err.message}`);
            }
            return res.redirect(`/catalog/${pending.pageId}/order-success/${pending.webOrderId}`);
          }

          // Messenger / social channel path
          const draft: DraftSession = JSON.parse(pending.draftJson);

          // Mark payment proof on draft
          draft.paymentProof = result.gatewayTxId || sessionToken;
          (draft as any).paymentVerified = true;

          // Finalize the order
          const page = await this.prisma.page.findUnique({
            where: { id: pending.pageId },
          });
          if (page) {
            try {
              const orderId = await this.draftOrder.finalizeDraftOrder(
                pending.pageId,
                pending.psid,
                draft,
                page,
              );
              this.logger.log(`[IPN] Order ${orderId} auto-confirmed via ${method}`);

              // Send confirmation to customer
              await this.messenger
                .sendText(
                  page.pageToken,
                  pending.psid,
                  `✅ পেমেন্ট confirmed! আপনার অর্ডার নেওয়া হয়েছে 💖\nঅর্ডার নম্বর: #${orderId}`,
                )
                .catch(() => {});
            } catch (err) {
              this.logger.error(`[IPN] finalizeDraftOrder failed: ${err.message}`);
            }
          }
        }
      }

      // Respond to gateway with 200
      res.status(200).send('OK');
    } catch (err) {
      this.logger.error(`[IPN] error: ${err.message}`);
      res.status(200).send('OK'); // always 200 to prevent gateway retries
    }
  }
}
