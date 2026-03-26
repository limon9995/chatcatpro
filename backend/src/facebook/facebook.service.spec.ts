import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FacebookService } from './facebook.service';

describe('FacebookService', () => {
  let service: FacebookService;
  let prisma: any;
  let authService: any;
  let encryption: any;

  beforeEach(() => {
    prisma = {
      page: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    authService = {
      addPageToUser: jest.fn(),
      removePageFromUser: jest.fn(),
    };
    encryption = {
      encryptIfNeeded: jest.fn((value: string) => `ENC:${value}`),
    };
    service = new FacebookService(prisma, authService, encryption);
    process.env.STORAGE_PUBLIC_URL = 'https://api.chatcat.pro/storage';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.STORAGE_PUBLIC_URL;
  });

  it('rejects manual page connect when submitted pageId does not match token owner page', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1046542211868208', name: 'Limon Tech Diary' }),
    } as any);

    await expect(
      service.connectPage('user-1', {
        pageId: '10465422118868208',
        pageName: 'Wrong Name',
        pageToken: 'token-123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.page.findUnique).not.toHaveBeenCalled();
    expect(prisma.page.create).not.toHaveBeenCalled();
  });

  it('stores the verified page identity instead of trusting submitted values', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1046542211868208', name: 'Limon Tech Diary' }),
    } as any);
    prisma.page.findUnique.mockResolvedValue(null);
    prisma.page.create.mockResolvedValue({
      id: 1,
      pageId: '1046542211868208',
      pageName: 'Limon Tech Diary',
      verifyToken: 'verify-1',
    });

    const result = await service.connectPage('user-1', {
      pageId: '1046542211868208',
      pageName: 'User Typed Name',
      pageToken: 'token-123',
    });

    expect(prisma.page.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pageId: '1046542211868208',
        pageName: 'Limon Tech Diary',
        pageToken: 'ENC:token-123',
      }),
    });
    expect(authService.addPageToUser).toHaveBeenCalledWith('user-1', 1);
    expect(result.page.pageId).toBe('1046542211868208');
    expect(result.page.pageName).toBe('Limon Tech Diary');
    expect(result.webhookUrl).toBe('https://api.chatcat.pro/webhook');
  });

  it('blocks connect when the verified page already belongs to another user', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1046542211868208', name: 'Limon Tech Diary' }),
    } as any);
    prisma.page.findUnique.mockResolvedValue({
      id: 1,
      ownerId: 'other-user',
      verifyToken: 'verify-1',
    });

    await expect(
      service.connectPage('user-1', {
        pageId: '1046542211868208',
        pageName: 'Limon Tech Diary',
        pageToken: 'token-123',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
