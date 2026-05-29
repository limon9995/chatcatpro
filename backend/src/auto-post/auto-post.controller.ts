import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AutoPostService } from './auto-post.service';
import { GenerateCaptionDto } from './dto/generate-caption.dto';
import { GenerateImageDto } from './dto/generate-image.dto';
import { CreateAutoPostDto } from './dto/create-auto-post.dto';
import { AuthGuard } from '../auth/auth.guard';
import { memoryStorage } from 'multer';

@UseGuards(AuthGuard)
@Controller('auto-post')
export class AutoPostController {
  constructor(private readonly service: AutoPostService) {}

  @Post('generate-caption')
  generateCaption(@Body() dto: GenerateCaptionDto) {
    return this.service.generateCaption(dto);
  }

  @Post('generate-image')
  generateImage(@Body() dto: GenerateImageDto) {
    return this.service.generateImage(dto);
  }

  @Post('generate-hashtags')
  generateHashtags(@Body() body: { pageId: number; productName: string; postType?: string; language?: string }) {
    return this.service.generateHashtags(body);
  }

  @Post('upload-product-photo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadProductPhoto(
    @UploadedFile() file: { buffer: Buffer; mimetype: string },
    @Body('pageId') pageId: string,
  ) {
    if (!file) throw new Error('No file uploaded');
    return this.service.saveUploadedPhoto(file.buffer, file.mimetype, Number(pageId));
  }

  @Post('poster-from-photo')
  posterFromPhoto(@Body() body: {
    pageId: number;
    productPhotoUrl: string;
    productName: string;
    price?: string;
    offer?: string;
    style?: string;
    aspectRatio?: string;
  }) {
    return this.service.posterFromPhoto(body);
  }

  @Post()
  create(@Body() dto: CreateAutoPostDto) {
    return this.service.create(dto);
  }

  @Get(':pageId')
  list(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.service.list(pageId);
  }

  @Get(':pageId/analytics')
  getAnalytics(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.service.getAnalytics(pageId);
  }

  @Get(':pageId/best-time')
  getBestTime(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.service.getBestTime(pageId);
  }

  @Post(':pageId/:id/retry')
  retry(
    @Param('id', ParseIntPipe) id: number,
    @Param('pageId', ParseIntPipe) pageId: number,
  ) {
    return this.service.retry(id, pageId);
  }

  @Delete(':pageId/:id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('pageId', ParseIntPipe) pageId: number,
  ) {
    return this.service.remove(id, pageId);
  }
}
