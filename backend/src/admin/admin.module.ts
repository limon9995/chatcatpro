import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BotKnowledgeModule } from '../bot-knowledge/bot-knowledge.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, BotKnowledgeModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
