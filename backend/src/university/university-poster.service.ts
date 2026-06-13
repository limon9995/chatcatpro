import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AutoPostService } from '../auto-post/auto-post.service';

const MAX_POSTS_PER_RUN = 3;

@Injectable()
export class UniversityPosterService {
  private readonly logger = new Logger(UniversityPosterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly autoPost: AutoPostService,
  ) {}

  async postNewNotices(pageId: number, newNotices: any[]): Promise<void> {
    if (!newNotices.length) return;

    const config = await this.prisma.universityConfig.findUnique({ where: { pageId } });
    if (!config?.autoPostEnabled) return;

    const toPost = newNotices.slice(0, MAX_POSTS_PER_RUN);
    for (const notice of toPost) {
      try {
        const lines: string[] = [`📢 নতুন নোটিশ\n\n${notice.title}`];
        if (notice.url) lines.push(`\n🔗 ${notice.url}`);
        lines.push('\n#Notice #University');
        const caption = lines.join('');

        const fbPostId = await this.autoPost.publishToFacebook(pageId, caption);
        await this.prisma.universityNotice.update({
          where: { id: notice.id },
          data: { autoPosted: true, fbPostId },
        });

        await new Promise((r) => setTimeout(r, 2000));
      } catch (err: any) {
        this.logger.error(`[Poster] Failed to post notice ${notice.id}: ${err.message}`);
        await this.prisma.universityNotice.update({
          where: { id: notice.id },
          data: { postError: err.message?.slice(0, 255) },
        });
      }
    }
  }
}
