import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TelegramModule } from '../telegram/telegram.module';
import { WebhookModule } from '../webhook/webhook.module';
import { MessageWorker } from '../message-queue/message.worker';
import { DefaultCommerceBotAgent } from './default-commerce/default-commerce.bot-agent';
import { UniversityBotAgent } from './university/university.bot-agent';
import { BotAgentRegistry, BOT_AGENTS } from './bot-agent.registry';
import { AgentCatalogService } from './agent-catalog.service';
import { AgentCatalogController } from './agent-catalog.controller';
import { AgentRequestService } from './agent-request.service';
import { AgentRequestController } from './agent-request.controller';

// NOTE: imports WebhookModule one-directionally (Agents -> Webhook) — the two
// delegate agents below need WebhookService, but WebhookModule never imports
// AgentsModule back, so there is no module cycle here. See bot-agent.interface.ts
// for why concrete agents must never import each other's files either.
@Module({
  imports: [PrismaModule, AuthModule, TelegramModule, WebhookModule],
  controllers: [AgentCatalogController, AgentRequestController],
  providers: [
    DefaultCommerceBotAgent,
    UniversityBotAgent,
    {
      provide: BOT_AGENTS,
      useFactory: (
        defaultAgent: DefaultCommerceBotAgent,
        universityAgent: UniversityBotAgent,
      ) => [defaultAgent, universityAgent],
      inject: [DefaultCommerceBotAgent, UniversityBotAgent],
    },
    BotAgentRegistry,
    MessageWorker,
    AgentCatalogService,
    AgentRequestService,
  ],
  exports: [BotAgentRegistry, AgentCatalogService, AgentRequestService],
})
export class AgentsModule {}
