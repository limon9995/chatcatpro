import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { MessengerService } from '../messenger/messenger.service';
import { MessageQueueService } from '../message-queue/message-queue.service';
import { BotIntentService } from '../bot/bot-intent.service';
import { ConversationContextService } from '../conversation-context/conversation-context.service';
import { DraftOrderHandler } from './handlers/draft-order.handler';
import { CrmService } from '../crm/crm.service';
import { WalletService } from '../wallet/wallet.service';
import { ReplyTrackingService } from '../agents/reply-tracking.service';
import { BotAgentRegistry } from '../agents/bot-agent.registry';

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: { page: {} } },
        { provide: MessengerService, useValue: {} },
        { provide: MessageQueueService, useValue: {} },
        { provide: BotIntentService, useValue: {} },
        { provide: ConversationContextService, useValue: {} },
        { provide: DraftOrderHandler, useValue: {} },
        { provide: CrmService, useValue: {} },
        { provide: WalletService, useValue: {} },
        { provide: ReplyTrackingService, useValue: {} },
        { provide: BotAgentRegistry, useValue: {} },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
