export class CreateAutoPostDto {
  pageId: number;
  caption: string;
  imageUrl?: string;
  imagePrompt?: string;
  postType?: string;
  language?: string;
  scheduledAt?: string; // ISO date string — if omitted, publish immediately
}
