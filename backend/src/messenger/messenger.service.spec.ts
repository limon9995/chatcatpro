import { Test, TestingModule } from '@nestjs/testing';
import { MessengerService } from './messenger.service';
import { EncryptionService } from '../common/encryption.service';

describe('MessengerService', () => {
  let service: MessengerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessengerService,
        { provide: EncryptionService, useValue: { decrypt: jest.fn((v) => v) } },
      ],
    }).compile();

    service = module.get<MessengerService>(MessengerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
