import { Module } from '@nestjs/common';
import { AiGenerateService } from './ai-generate.service';
import { AiGenerateController } from './ai-generate.controller';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [WalletModule, AuthModule, CommonModule],
  providers: [AiGenerateService],
  controllers: [AiGenerateController],
  exports: [AiGenerateService],
})
export class AiGenerateModule {}
