import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { GlobalSettingsService } from './global-settings.service';
import { ApiKeysService } from './api-keys.service';
import { TelegramService } from './telegram.service';
import { GeminiKeyRotatorService } from './gemini-key-rotator.service';

@Global()
@Module({
  providers: [EncryptionService, GlobalSettingsService, ApiKeysService, TelegramService, GeminiKeyRotatorService],
  exports: [EncryptionService, GlobalSettingsService, ApiKeysService, TelegramService, GeminiKeyRotatorService],
})
export class CommonModule {}
