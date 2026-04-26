/**
 * V18: Vision Analysis Provider Interface
 *
 * Implement this interface to plug in any AI vision provider
 * (OpenAI GPT-4o, Google Gemini, Anthropic Claude, etc.)
 * The default implementation is a mock that returns null attributes.
 * Replace with a real provider by setting VISION_PROVIDER=openai and
 * OPENAI_API_KEY in your .env file.
 */
export interface VisionAttributes {
  /** Detected product category: dress, saree, panjabi, shirt, t-shirt, kurti, tops, etc. */
  category: string | null;
  /** Primary color: black, red, white, blue, green, multicolor, etc. */
  color: string | null;
  /** Design/pattern: plain, printed, floral, embroidered, striped, checked, etc. */
  pattern: string | null;
  /** Sleeve type if visible: full, half, sleeveless, 3-quarter */
  sleeveType: string | null;
  /** Gender context: women, men, unisex — inferred carefully, not forced */
  gender: string | null;
  /** Overall confidence 0.0–1.0 for the analysis result */
  confidence: number;
  /** Raw text description from the AI for logging / fallback display */
  rawDescription: string;
  /** True when an external API (OpenAI) was used; false when handled locally */
  usedApi?: boolean;
  /** True when the result was served from the in-memory URL cache (same image analyzed before) */
  fromCache?: boolean;
}

export interface VisionAnalysisProvider {
  /**
   * Analyze an image URL and return structured product attributes.
   * Must handle network errors and return low-confidence result on failure.
   */
  analyze(imageUrl: string): Promise<VisionAttributes>;
}
