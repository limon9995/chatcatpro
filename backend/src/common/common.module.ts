import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { GlobalSettingsService } from './global-settings.service';
import { ApiKeysService } from './api-keys.service';
import { TelegramService } from './telegram.service';

@Global()
@Module({
  providers: [EncryptionService, GlobalSettingsService, ApiKeysService, TelegramService],
  exports: [EncryptionService, GlobalSettingsService, ApiKeysService, TelegramService],
})
export class CommonModule {}
