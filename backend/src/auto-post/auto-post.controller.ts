import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AutoPostService } from './auto-post.service';
import { GenerateCaptionDto } from './dto/generate-caption.dto';
import { GenerateImageDto } from './dto/generate-image.dto';
import { CreateAutoPostDto } from './dto/create-auto-post.dto';
import { AuthGuard } from '../auth/auth.guard';

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

  @Post()
  create(@Body() dto: CreateAutoPostDto) {
    return this.service.create(dto);
  }

  @Get(':pageId')
  list(@Param('pageId', ParseIntPipe) pageId: number) {
    return this.service.list(pageId);
  }

  @Delete(':pageId/:id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('pageId', ParseIntPipe) pageId: number,
  ) {
    return this.service.remove(id, pageId);
  }
}
