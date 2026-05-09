import { Test, TestingModule } from '@nestjs/testing';
import { PageController } from './page.controller';
import { PageService } from './page.service';
import { AuthService } from '../auth/auth.service';
import { FacebookService } from '../facebook/facebook.service';

describe('PageController', () => {
  let controller: PageController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PageController],
      providers: [
        { provide: PageService, useValue: {} },
        { provide: AuthService, useValue: { ensurePageAccess: jest.fn() } },
        { provide: FacebookService, useValue: {} },
      ],
    }).compile();

    controller = module.get<PageController>(PageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
