import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { MessengerService } from '../messenger/messenger.service';
import { MessageQueueService } from '../message-queue/message-queue.service';
import { BotKnowledgeService } from '../bot-knowledge/bot-knowledge.service';
import { OcrService } from '../ocr/ocr.service';
import { OcrQueueService } from '../ocr-queue/ocr-queue.service';
import { BotIntentService } from '../bot/bot-intent.service';
import { ConversationContextService } from '../conversation-context/conversation-context.service';
import { DraftOrderHandler } from './handlers/draft-order.handler';
import { ProductInfoHandler } from './handlers/product-info.handler';
import { NegotiationHandler } from './handlers/negotiation.handler';
import { CrmService } from '../crm/crm.service';
import { VisionAnalysisService } from '../vision-analysis/vision-analysis.service';
import { ProductMatchService } from '../product-match/product-match.service';
import { FallbackAiService } from '../fallback-ai/fallback-ai.service';
import { AiIntentService } from '../bot/ai-intent.service';
import { VisionOpsService } from '../vision-ops/vision-ops.service';
import { BillingService } from '../billing/billing.service';
import { WalletService } from '../wallet/wallet.service';
import { WhisperService } from '../whisper/whisper.service';
import { BotContextService } from '../bot/bot-context.service';
import { SmartBotService } from '../bot/smart-bot.service';

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: { page: {} } },
        { provide: MessengerService, useValue: {} },
        { provide: MessageQueueService, useValue: {} },
        { provide: BotKnowledgeService, useValue: {} },
        { provide: OcrService, useValue: {} },
        { provide: OcrQueueService, useValue: {} },
        { provide: BotIntentService, useValue: {} },
        { provide: ConversationContextService, useValue: {} },
        { provide: DraftOrderHandler, useValue: {} },
        { provide: ProductInfoHandler, useValue: {} },
        { provide: NegotiationHandler, useValue: {} },
        { provide: CrmService, useValue: {} },
        { provide: VisionAnalysisService, useValue: {} },
        { provide: ProductMatchService, useValue: {} },
        { provide: FallbackAiService, useValue: {} },
        { provide: AiIntentService, useValue: {} },
        { provide: VisionOpsService, useValue: {} },
        { provide: BillingService, useValue: {} },
        { provide: WalletService, useValue: {} },
        { provide: WhisperService, useValue: {} },
        { provide: BotContextService, useValue: {} },
        { provide: SmartBotService, useValue: {} },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
