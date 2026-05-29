import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupportChatController } from './support-chat.controller';
import { SupportChatService } from './support-chat.service';

@Module({
  imports: [AuthModule],
  controllers: [SupportChatController],
  providers: [SupportChatService],
})
export class SupportChatModule {}
