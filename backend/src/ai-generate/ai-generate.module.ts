import { Module } from '@nestjs/common';
import { AiGenerateService } from './ai-generate.service';
import { AiGenerateController } from './ai-generate.controller';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  providers: [AiGenerateService],
  controllers: [AiGenerateController],
  exports: [AiGenerateService],
})
export class AiGenerateModule {}
