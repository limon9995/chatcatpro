import { IsNumber, IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateAutoPostDto {
  @IsNumber()
  @IsNotEmpty()
  pageId: number;

  @IsString()
  @IsNotEmpty()
  caption: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  imagePrompt?: string;

  @IsString()
  @IsOptional()
  postType?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  scheduledAt?: string; // ISO date string — if omitted, publish immediately
}
