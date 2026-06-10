import { Test, TestingModule } from '@nestjs/testing';
import { OcrService } from './ocr.service';
import { ApiKeysService } from '../common/api-keys.service';
import { GeminiKeyRotatorService } from '../common/gemini-key-rotator.service';

describe('OcrService', () => {
  let service: OcrService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OcrService,
        { provide: ApiKeysService, useValue: { getKeys: jest.fn().mockReturnValue([]) } },
        {
          provide: GeminiKeyRotatorService,
          useValue: {
            getKey: jest.fn().mockReturnValue(null),
            isAvailable: jest.fn().mockReturnValue(false),
            markSuccess: jest.fn(),
            markError: jest.fn(),
            markExhausted: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OcrService>(OcrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
