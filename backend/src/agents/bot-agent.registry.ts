import { Inject, Injectable, Logger } from '@nestjs/common';
import { AgentType } from '@prisma/client';
import { BotAgent } from './bot-agent.interface';

export const BOT_AGENTS = 'BOT_AGENTS';

/**
 * Resolves a Page's agentType to the concrete BotAgent that should handle
 * its messages. Adding a new agent type never requires editing this file —
 * only its own class + one line in agents.module.ts's provider wiring.
 */
@Injectable()
export class BotAgentRegistry {
  private readonly logger = new Logger(BotAgentRegistry.name);
  private readonly byType = new Map<AgentType, BotAgent>();

  constructor(@Inject(BOT_AGENTS) agents: BotAgent[]) {
    for (const agent of agents) {
      if (this.byType.has(agent.type)) {
        throw new Error(
          `[BotAgentRegistry] Duplicate agent registered for type=${agent.type}`,
        );
      }
      this.byType.set(agent.type, agent);
    }
  }

  resolve(agentType: AgentType): BotAgent {
    const agent = this.byType.get(agentType);
    if (agent) return agent;

    const fallback = this.byType.get(AgentType.DEFAULT);
    if (fallback) {
      this.logger.warn(
        `[BotAgentRegistry] No agent registered for type=${agentType}, falling back to DEFAULT`,
      );
      return fallback;
    }
    throw new Error(
      `[BotAgentRegistry] No agent registered for type=${agentType} and no DEFAULT fallback`,
    );
  }
}
