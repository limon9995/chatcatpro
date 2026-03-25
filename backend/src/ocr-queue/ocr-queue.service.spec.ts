import { Test, TestingModule } from '@nestjs/testing';
import { OcrQueueService } from './ocr-queue.service';

describe('OcrQueueService', () => {
  let service: OcrQueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OcrQueueService],
    }).compile();

    service = module.get<OcrQueueService>(OcrQueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
