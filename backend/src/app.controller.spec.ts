import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { PrismaService } from './prisma/prisma.service';
import { AdminService } from './admin/admin.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]) },
        },
        { provide: AdminService, useValue: {} },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return health status object', async () => {
      const result = await appController.health();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('db');
      expect(result).toHaveProperty('uptime');
    });
  });
});
