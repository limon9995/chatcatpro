import { AgentType } from '@prisma/client';

// NOTE: "agent" here means a per-page-type bot personality (which pipeline
// handles a page's messages), NOT human chat handoff — see
// ConversationContextService.isAgentHandling/setAgentHandling for that
// unrelated, pre-existing meaning of "agent" in this codebase.

export { AgentType };

/**
 * Contract every per-page-type bot implementation must satisfy.
 *
 * Deliberately a pure interface, not an abstract base class: shared behavior
 * belongs in injected, stateless/self-contained services (ConversationContextService,
 * BotKnowledgeService, ReplyTrackingService, etc.), not in inherited methods.
 * An abstract base class with shared helper methods would let one agent's
 * change to a "shared" method silently affect another agent — exactly the
 * coupling this design avoids. Concrete agents must never import or depend
 * on another concrete agent's file.
 */
export interface BotAgent {
  /** Must equal the AgentType this instance handles; used by BotAgentRegistry to route dispatch. */
  readonly type: AgentType;

  /**
   * Handle one inbound message for a page+psid. Implementations own their
   * entire reply flow, including sending via Messenger (through the shared
   * ReplyTrackingService so conversation history keeps working).
   */
  handleMessage(page: any, psid: string, message: any): Promise<void>;
}
