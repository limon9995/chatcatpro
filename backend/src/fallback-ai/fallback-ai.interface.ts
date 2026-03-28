/**
 * V18: Fallback AI Provider Interface
 *
 * Used when the rule-based bot cannot handle a message (unmatched intent)
 * or when image recognition confidence is too low.
 *
 * Implement this interface to plug in any AI text provider.
 * The default is MockFallbackProvider which returns null (no fallback).
 * Set FALLBACK_AI_PROVIDER=openai and OPENAI_API_KEY to enable real fallback.
 */
export interface FallbackContext {
  /** Customer's last message text */
  customerMessage: string;
  /** Reason the fallback was triggered */
  reason: 'low_confidence' | 'unmatched_intent' | 'image_unclear';
  /** Optional: vision result description */
  visionDescription?: string;
  /** Page business name for context */
  businessName?: string;
  /** Current draft step so AI understands what the bot was waiting for */
  draftStep?: string | null;
  /** Active draft summary (e.g. "customer has DF001 in cart, waiting for phone") */
  draftSummary?: string | null;
}

export interface FallbackResponse {
  /** The reply to send to the customer. null = no fallback, route to agent */
  reply: string | null;
  /** Whether to set agentHandling=true after sending reply */
  escalateToAgent: boolean;
}

export interface BotFallbackProvider {
  /**
   * Generate a contextual fallback reply.
   * Return { reply: null, escalateToAgent: true } to silently hand off to agent.
   */
  generateReply(context: FallbackContext): Promise<FallbackResponse>;
}
