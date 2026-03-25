import { Module } from '@nestjs/common';
import { MemoController } from './memo.controller';
import { MemoService } from './memo.service';
import { MemoTemplateService } from './memo-template.service';
import { MemoThemeService } from './memo-theme.service';
import { MemoTemplateAssetService } from './memo-template-asset.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MemoController],
  providers: [
    MemoService,
    MemoTemplateService,
    MemoThemeService,
    MemoTemplateAssetService,
  ],
  exports: [MemoService],
})
export class MemoModule {}
