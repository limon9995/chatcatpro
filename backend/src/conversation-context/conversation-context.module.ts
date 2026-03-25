import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConversationContextService } from './conversation-context.service';

@Module({
  imports: [PrismaModule],
  providers: [ConversationContextService],
  exports: [ConversationContextService],
})
export class ConversationContextModule {}
