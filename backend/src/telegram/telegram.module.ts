import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { MessengerModule } from '../messenger/messenger.module';
import { TelegramController } from './telegram.controller';
import { TelegramNotificationService } from './telegram-notification.service';

@Module({
  imports: [PrismaModule, AuthModule, CommonModule, MessengerModule],
  controllers: [TelegramController],
  providers: [TelegramNotificationService],
  exports: [TelegramNotificationService],
})
export class TelegramModule {}
