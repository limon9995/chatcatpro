import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { PageService } from '../page/page.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { EmbeddingQueueService } from '../embedding/embedding-queue.service';

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: { product: {} } },
        { provide: PageService, useValue: { getEffectivePageId: jest.fn((id: number) => id) } },
        { provide: EmbeddingService, useValue: {} },
        { provide: EmbeddingQueueService, useValue: {} },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
