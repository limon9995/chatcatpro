import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { GlobalSettingsService } from './global-settings.service';
import { ApiKeysService } from './api-keys.service';
import { TelegramService } from './telegram.service';
import { GeminiKeyRotatorService } from './gemini-key-rotator.service';
import { MailerService } from './mailer.service';
import { AiUsageService } from './ai-usage.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [EncryptionService, GlobalSettingsService, ApiKeysService, TelegramService, GeminiKeyRotatorService, MailerService, AiUsageService],
  exports: [EncryptionService, GlobalSettingsService, ApiKeysService, TelegramService, GeminiKeyRotatorService, MailerService, AiUsageService],
})
export class CommonModule {}
