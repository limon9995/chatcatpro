import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { GenerateCaptionDto } from './dto/generate-caption.dto';
import { GenerateImageDto } from './dto/generate-image.dto';
import { CreateAutoPostDto } from './dto/create-auto-post.dto';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const FB_GRAPH = 'https://graph.facebook.com/v21.0';

@Injectable()
export class AutoPostService {
  private readonly logger = new Logger(AutoPostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  // ── Caption generation via Gemini Flash ──────────────────────────────────────

  async generateCaption(dto: GenerateCaptionDto): Promise<{ caption: string }> {
    const apiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    const isBn = (dto.language || 'bn') === 'bn';
    const postTypeLabel =
      dto.postType === 'sale'
        ? isBn ? 'অফার/ডিসকাউন্ট পোস্ট' : 'Sale/Discount Post'
        : dto.postType === 'announcement'
          ? isBn ? 'ঘোষণা পোস্ট' : 'Announcement Post'
          : isBn ? 'প্রোডাক্ট পোস্ট' : 'Product Post';

    const systemPrompt = isBn
      ? `তুমি একজন বাংলাদেশি ই-কমার্স মার্কেটার। Facebook পেজের জন্য আকর্ষণীয় বাংলা ক্যাপশন লেখো। ইমোজি ব্যবহার করো। ৩-৫ লাইনের মধ্যে রাখো। শেষে call-to-action দাও।`
      : `You are a Bangladeshi e-commerce marketer. Write engaging English captions for Facebook pages. Use emojis. Keep it 3-5 lines. End with a call-to-action.`;

    const userPrompt = isBn
      ? `একটি ${postTypeLabel} লেখো।\nপ্রোডাক্ট: ${dto.productName}\n${dto.price ? `মূল্য: ${dto.price}` : ''}${dto.offer ? `\nঅফার: ${dto.offer}` : ''}${dto.description ? `\nবিবরণ: ${dto.description}` : ''}`
      : `Write a ${postTypeLabel}.\nProduct: ${dto.productName}\n${dto.price ? `Price: ${dto.price}` : ''}${dto.offer ? `\nOffer: ${dto.offer}` : ''}${dto.description ? `\nDescription: ${dto.description}` : ''}`;

    // Try Gemini first, fallback to OpenAI
    if (apiKey) {
      try {
        const caption = await this.callGemini(apiKey, systemPrompt, userPrompt);
        return { caption };
      } catch (e: any) {
        this.logger.warn(`Gemini failed: ${e.message}, trying OpenAI`);
      }
    }

    if (openaiKey) {
      const caption = await this.callOpenAI(openaiKey, systemPrompt, userPrompt);
      return { caption };
    }

    throw new BadRequestException(
      'GEMINI_API_KEY বা OPENAI_API_KEY .env ফাইলে set করুন',
    );
  }

  private async callGemini(
    apiKey: string,
    system: string,
    user: string,
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 512 },
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
    const data: any = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  private async callOpenAI(
    apiKey: string,
    system: string,
    user: string,
  ): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 512,
        temperature: 0.8,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  // ── Image generation via fal.ai ───────────────────────────────────────────────

  async generateImage(dto: GenerateImageDto): Promise<{ imageUrl: string }> {
    const falKey = process.env.FAL_API_KEY;
    const ideogramKey = process.env.IDEOGRAM_API_KEY;

    if (!falKey && !ideogramKey) {
      throw new BadRequestException(
        'FAL_API_KEY বা IDEOGRAM_API_KEY .env ফাইলে set করুন',
      );
    }

    let remoteUrl: string;

    if (falKey) {
      remoteUrl = await this.callFalAi(falKey, dto.prompt);
    } else {
      remoteUrl = await this.callIdeogram(ideogramKey!, dto.prompt);
    }

    // Save image to local storage
    const savedUrl = await this.downloadAndSave(remoteUrl, dto.pageId);
    return { imageUrl: savedUrl };
  }

  private async callFalAi(apiKey: string, prompt: string): Promise<string> {
    // fal.ai FLUX Schnell via REST API
    const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: `E-commerce product promotional poster, ${prompt}, high quality, professional photography, clean background`,
        image_size: 'square_hd',
        num_inference_steps: 4,
        num_images: 1,
      }),
    });
    if (!res.ok) throw new Error(`fal.ai error: ${res.status}`);
    const data: any = await res.json();
    return data.images?.[0]?.url || '';
  }

  private async callIdeogram(apiKey: string, prompt: string): Promise<string> {
    const res = await fetch('https://api.ideogram.ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': apiKey,
      },
      body: JSON.stringify({
        image_request: {
          prompt: `${prompt}, professional e-commerce promotional poster, Bengali text, high quality`,
          model: 'V_2',
          aspect_ratio: 'ASPECT_1_1',
          style_type: 'REALISTIC',
        },
      }),
    });
    if (!res.ok) throw new Error(`Ideogram error: ${res.status}`);
    const data: any = await res.json();
    return data.data?.[0]?.url || '';
  }

  private async downloadAndSave(url: string, pageId: number): Promise<string> {
    const dir = path.join(process.cwd(), 'storage', 'auto-posts');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filename = `ap_${pageId}_${Date.now()}.jpg`;
    const filepath = path.join(dir, filename);

    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(filepath);
      https.get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
      });
    });

    return `/storage/auto-posts/${filename}`;
  }

  // ── Facebook publish ──────────────────────────────────────────────────────────

  async publishToFacebook(
    pageId: number,
    caption: string,
    imageUrl?: string,
  ): Promise<string> {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Page not found');

    const token = this.encryption.decrypt(page.pageToken);
    const fbPageId = page.pageId;

    let fbPostId: string;

    if (imageUrl) {
      // Post with photo
      const absoluteImageUrl = imageUrl.startsWith('http')
        ? imageUrl
        : `${process.env.API_BASE_URL || 'https://api.chatcat.pro'}${imageUrl}`;

      const res = await fetch(`${FB_GRAPH}/${fbPageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: absoluteImageUrl,
          caption,
          access_token: token,
        }),
      });
      const data: any = await res.json();
      if (!res.ok || data.error) {
        throw new BadRequestException(
          data.error?.message || 'Facebook photo post failed',
        );
      }
      fbPostId = data.post_id || data.id;
    } else {
      // Text-only post
      const res = await fetch(`${FB_GRAPH}/${fbPageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: caption, access_token: token }),
      });
      const data: any = await res.json();
      if (!res.ok || data.error) {
        throw new BadRequestException(
          data.error?.message || 'Facebook post failed',
        );
      }
      fbPostId = data.id;
    }

    return fbPostId;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  async create(dto: CreateAutoPostDto) {
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    if (!scheduledAt) {
      // Publish immediately
      const record = await this.prisma.autoPost.create({
        data: {
          pageId: dto.pageId,
          caption: dto.caption,
          imageUrl: dto.imageUrl,
          imagePrompt: dto.imagePrompt,
          postType: dto.postType || 'product',
          language: dto.language || 'bn',
          status: 'publishing',
        },
      });

      try {
        const fbPostId = await this.publishToFacebook(
          dto.pageId,
          dto.caption,
          dto.imageUrl,
        );
        return await this.prisma.autoPost.update({
          where: { id: record.id },
          data: { status: 'published', fbPostId, publishedAt: new Date() },
        });
      } catch (e: any) {
        await this.prisma.autoPost.update({
          where: { id: record.id },
          data: { status: 'failed', errorMsg: e.message },
        });
        throw e;
      }
    }

    // Schedule for later
    return this.prisma.autoPost.create({
      data: {
        pageId: dto.pageId,
        caption: dto.caption,
        imageUrl: dto.imageUrl,
        imagePrompt: dto.imagePrompt,
        postType: dto.postType || 'product',
        language: dto.language || 'bn',
        status: 'scheduled',
        scheduledAt,
      },
    });
  }

  async list(pageId: number) {
    return this.prisma.autoPost.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async remove(id: number, pageId: number) {
    const post = await this.prisma.autoPost.findFirst({
      where: { id, pageId },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.status === 'publishing') {
      throw new BadRequestException('Publishing চলছে, এখন delete করা যাবে না');
    }
    return this.prisma.autoPost.delete({ where: { id } });
  }

  // Called by scheduler every 5 minutes
  async processScheduledPosts(): Promise<number> {
    const now = new Date();
    const pending = await this.prisma.autoPost.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: now } },
    });

    let count = 0;
    for (const post of pending) {
      await this.prisma.autoPost.update({
        where: { id: post.id },
        data: { status: 'publishing' },
      });
      try {
        const fbPostId = await this.publishToFacebook(
          post.pageId,
          post.caption,
          post.imageUrl ?? undefined,
        );
        await this.prisma.autoPost.update({
          where: { id: post.id },
          data: { status: 'published', fbPostId, publishedAt: new Date() },
        });
        count++;
      } catch (e: any) {
        await this.prisma.autoPost.update({
          where: { id: post.id },
          data: { status: 'failed', errorMsg: e.message },
        });
        this.logger.error(`AutoPost ${post.id} failed: ${e.message}`);
      }
    }

    return count;
  }
}
