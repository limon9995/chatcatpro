import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { GlobalSettingsService } from './global-settings.service';
import { ApiKeysService } from './api-keys.service';

@Global()
@Module({
  providers: [EncryptionService, GlobalSettingsService, ApiKeysService],
  exports: [EncryptionService, GlobalSettingsService, ApiKeysService],
})
export class CommonModule {}
