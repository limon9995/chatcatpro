import { IsNumber, IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class GenerateImageDto {
  @IsNumber()
  @IsNotEmpty()
  pageId: number;

  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsOptional()
  style?: string;       // minimal | vibrant | dark | festival | sale | realistic

  @IsString()
  @IsOptional()
  aspectRatio?: string; // '1:1' | '4:5' | '9:16'

  @IsNumber()
  @IsOptional()
  count?: number;       // 1 or 2 variations
}
