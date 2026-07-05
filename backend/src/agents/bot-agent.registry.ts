import { Inject, Injectable, Logger } from '@nestjs/common';
import { BotAgent } from './bot-agent.interface';

export const BOT_AGENTS = 'BOT_AGENTS';
export const DEFAULT_AGENT_KEY = 'commerce';

/**
 * Resolves a Page's agentType to the concrete BotAgent that should handle
 * its messages. Adding a new agent type never requires editing this file —
 * only its own class + one line in agents.module.ts's provider wiring.
 */
@Injectable()
export class BotAgentRegistry {
  private readonly logger = new Logger(BotAgentRegistry.name);
  private readonly byKey = new Map<string, BotAgent>();

  constructor(@Inject(BOT_AGENTS) agents: BotAgent[]) {
    for (const agent of agents) {
      if (this.byKey.has(agent.key)) {
        throw new Error(
          `[BotAgentRegistry] Duplicate agent registered for key=${agent.key}`,
        );
      }
      this.byKey.set(agent.key, agent);
    }
  }

  resolve(key: string): BotAgent {
    const agent = this.byKey.get(key);
    if (agent) return agent;

    const fallback = this.byKey.get(DEFAULT_AGENT_KEY);
    if (fallback) {
      this.logger.warn(
        `[BotAgentRegistry] No agent registered for key=${key}, falling back to "${DEFAULT_AGENT_KEY}"`,
      );
      return fallback;
    }
    throw new Error(
      `[BotAgentRegistry] No agent registered for key=${key} and no "${DEFAULT_AGENT_KEY}" fallback`,
    );
  }

  /** Backward-compat resolution: prefers the new agentType field, falls back to the legacy universityModeOn boolean. */
  resolveForPage(page: any): BotAgent {
    const key = page?.agentType || (page?.universityModeOn ? 'university' : DEFAULT_AGENT_KEY);
    return this.resolve(key);
  }
}
