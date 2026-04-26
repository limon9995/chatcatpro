import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { GlobalSettingsService } from './global-settings.service';

@Global()
@Module({
  providers: [EncryptionService, GlobalSettingsService],
  exports: [EncryptionService, GlobalSettingsService],
})
export class CommonModule {}
