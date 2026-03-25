import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { FacebookService } from './facebook.service';
import { FacebookController } from './facebook.controller';

@Module({
  imports: [PrismaModule, AuthModule, CommonModule],
  providers: [FacebookService],
  controllers: [FacebookController],
  exports: [FacebookService],
})
export class FacebookModule {}
