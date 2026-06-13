import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { AutoPostModule } from '../auto-post/auto-post.module';
import { UniversityConfigService } from './university-config.service';
import { UniversityGroupLinksService } from './university-group-links.service';
import { UniversityScraperService } from './university-scraper.service';
import { UniversityPosterService } from './university-poster.service';
import { UniversityBotService } from './university-bot.service';
import { UniversityController } from './university.controller';

@Module({
  imports: [PrismaModule, CommonModule, AutoPostModule],
  controllers: [UniversityController],
  providers: [
    UniversityConfigService,
    UniversityGroupLinksService,
    UniversityScraperService,
    UniversityPosterService,
    UniversityBotService,
  ],
  exports: [UniversityBotService, UniversityScraperService, UniversityPosterService],
})
export class UniversityModule {}
