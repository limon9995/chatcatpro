/**
 * Per-agent-type behavior overrides, stored as BotAgentDefinition.behaviorConfig.
 * Every field is optional — when absent, the shared engine (webhook.service.ts,
 * ai-intent.service.ts, smart-bot.service.ts, draft-order.handler.ts) falls back
 * to its existing hardcoded default, so a page with agentType='commerce' and no
 * override behaves exactly as it did before this config layer existed.
 *
 * Known scoping limit: `coreFields` only lets you relabel/reword the 3 fixed
 * slots (name/phone/address) — the 3rd slot's captured value still physically
 * lands in Order.address / DraftSession.address regardless of its label (e.g.
 * a restaurant's "table booking time" answer is stored in the address column).
 * Full field remapping is out of scope for this layer.
 */
export interface AgentCoreFieldDef {
  key: 'name' | 'phone' | 'address';
  label: string;
  askPrompt: string;
  retryPrompt: string;
  statusPrompt: string;
}

export interface AgentBehaviorConfig {
  personaPrompt?: string;
  toneRules?: string;
  coreFields?: AgentCoreFieldDef[]; // must include all 3 keys if provided
  systemReplies?: Record<string, { template: string; fallback: string; enabled?: boolean }>;
}
