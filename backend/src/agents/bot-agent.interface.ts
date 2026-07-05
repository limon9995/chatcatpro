// NOTE: "agent" here means a per-page-type bot personality (which pipeline
// handles a page's messages), NOT human chat handoff — see
// ConversationContextService.isAgentHandling for that unrelated, pre-existing
// meaning of "agent" in this codebase.

export interface BotAgent {
  /** Must equal the key this instance handles; used by BotAgentRegistry to route dispatch. */
  readonly key: string;

  /** Handle one inbound message for a page+psid. Owns its entire reply flow. */
  handle(page: any, psid: string, message: any): Promise<void>;
}
