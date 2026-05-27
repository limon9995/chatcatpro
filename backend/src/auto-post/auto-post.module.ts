import { Module } from '@nestjs/common';
import { AutoPostService } from './auto-post.service';
import { AutoPostController } from './auto-post.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, CommonModule, AuthModule],
  controllers: [AutoPostController],
  providers: [AutoPostService],
  exports: [AutoPostService],
})
export class AutoPostModule {}
