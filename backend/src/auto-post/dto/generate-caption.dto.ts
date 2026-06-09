import { IsNumber, IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class GenerateCaptionDto {
  @IsNumber()
  @IsNotEmpty()
  pageId: number;

  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsString()
  @IsOptional()
  price?: string;

  @IsString()
  @IsOptional()
  offer?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  postType?: string; // product | sale | announcement | custom

  @IsString()
  @IsOptional()
  language?: string; // bn | en

  @IsString()
  @IsOptional()
  tone?: string;     // casual | professional | urgent | story
}
