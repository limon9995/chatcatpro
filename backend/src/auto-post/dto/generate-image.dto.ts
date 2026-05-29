export class GenerateImageDto {
  pageId: number;
  prompt: string;
  style?: string;       // minimal | vibrant | dark | festival | sale | realistic
  aspectRatio?: string; // '1:1' | '4:5' | '9:16'
  count?: number;       // 1 or 2 variations
}
