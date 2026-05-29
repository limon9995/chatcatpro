export class GenerateCaptionDto {
  pageId: number;
  productName: string;
  price?: string;
  offer?: string;
  description?: string;
  postType?: string; // product | sale | announcement | custom
  language?: string; // bn | en
  tone?: string;     // casual | professional | urgent | story
}
