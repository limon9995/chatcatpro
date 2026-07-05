import { DefaultCommerceBotAgent } from './default-commerce.bot-agent';
import { AgentType } from '@prisma/client';

describe('DefaultCommerceBotAgent', () => {
  it('should be defined and report AgentType.DEFAULT', () => {
    const agent = new DefaultCommerceBotAgent(
      {} as any, // prisma
      {} as any, // messenger
      {} as any, // botKnowledge
      {} as any, // ocr
      {} as any, // ocrQueue
      {} as any, // botIntent
      {} as any, // ctx
      {} as any, // draftHandler
      {} as any, // productHandler
      {} as any, // negotiationHandler
      {} as any, // visionAnalysis
      {} as any, // productMatch
      {} as any, // fallbackAi
      {} as any, // aiIntent
      {} as any, // visionOps
      {} as any, // billing
      {} as any, // walletService
      {} as any, // whisper
      {} as any, // botContext
      {} as any, // smartBot
      {} as any, // embeddingService
      {} as any, // productNameMatch
      {} as any, // telegram
      {} as any, // replyTracking
      {} as any, // webhookService (WEBHOOK_SERVICE_TOKEN)
    );

    expect(agent).toBeDefined();
    expect(agent.type).toBe(AgentType.DEFAULT);
  });
});
