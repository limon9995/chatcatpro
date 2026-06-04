import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { PaymentVerifyService } from './payment-verify.service';
import { SaveCredentialsDto } from './dto/save-credentials.dto';

@Controller('pages/:pageId/payment-credentials')
@UseGuards(AuthGuard)
export class PaymentCredentialsController {
  constructor(
    private readonly paymentVerify: PaymentVerifyService,
    private readonly authService: AuthService,
  ) {}

  private pid(req: any, id: string): number {
    const pageId = Number(id);
    this.authService.ensurePageAccess(req.user || req.authUser, pageId);
    return pageId;
  }

  @Get()
  list(@Param('pageId') id: string, @Req() req: any) {
    return this.paymentVerify.listMethods(this.pid(req, id));
  }

  @Post()
  async save(
    @Param('pageId') id: string,
    @Req() req: any,
    @Body() body: SaveCredentialsDto,
  ) {
    const pageId = this.pid(req, id);
    await this.paymentVerify.saveCredentials(
      pageId,
      body.method,
      body.credentials,
      body.isActive ?? true,
    );
    return { ok: true };
  }

  @Delete(':method')
  async remove(
    @Param('pageId') id: string,
    @Param('method') method: string,
    @Req() req: any,
  ) {
    const pageId = this.pid(req, id);
    await this.paymentVerify.removeCredentials(pageId, method);
    return { ok: true };
  }

  @Post(':method/test')
  async test(
    @Param('pageId') id: string,
    @Param('method') method: string,
    @Req() req: any,
  ) {
    const pageId = this.pid(req, id);
    return this.paymentVerify.testConnection(pageId, method);
  }
}
