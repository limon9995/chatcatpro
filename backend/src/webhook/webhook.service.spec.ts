import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { MessengerService } from '../messenger/messenger.service';
import { BotKnowledgeService } from '../bot-knowledge/bot-knowledge.service';
import { OcrService } from '../ocr/ocr.service';
import { OcrQueueService } from '../ocr-queue/ocr-queue.service';
import { BotIntentService } from '../bot/bot-intent.service';
import { ConversationContextService } from '../conversation-context/conversation-context.service';
import { DraftOrderHandler } from './handlers/draft-order.handler';
import { ProductInfoHandler } from './handlers/product-info.handler';
import { NegotiationHandler } from './handlers/negotiation.handler';
import { CrmService } from '../crm/crm.service';

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: { page: {} } },
        { provide: MessengerService, useValue: {} },
        { provide: BotKnowledgeService, useValue: {} },
        { provide: OcrService, useValue: {} },
        { provide: OcrQueueService, useValue: {} },
        { provide: BotIntentService, useValue: {} },
        { provide: ConversationContextService, useValue: {} },
        { provide: DraftOrderHandler, useValue: {} },
        { provide: ProductInfoHandler, useValue: {} },
        { provide: NegotiationHandler, useValue: {} },
        { provide: CrmService, useValue: {} },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
