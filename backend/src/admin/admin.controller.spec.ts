import { BadRequestException } from '@nestjs/common';
import { AdminController } from './admin.controller';

describe('AdminController', () => {
  const svc = {
    overview: jest.fn(),
    clients: jest.fn(),
    clientDetails: jest.fn(),
    getAllPages: jest.fn(),
    health: jest.fn(),
    getPageSettings: jest.fn(),
    updatePageSettings: jest.fn(),
    getGlobalBotKnowledge: jest.fn(),
    updateGlobalBotQuestions: jest.fn(),
    updateGlobalBotSystemReplies: jest.fn(),
    updateGlobalBotAreas: jest.fn(),
    getBotLearningLog: jest.fn(),
    createQuestionFromLearning: jest.fn(),
    getClientBotKnowledge: jest.fn(),
    setClientPageQuestions: jest.fn(),
    setClientPageSystemReplies: jest.fn(),
    pushGlobalQuestionToPage: jest.fn(),
    getCourierTutorials: jest.fn(),
    saveCourierTutorials: jest.fn(),
    getTutorials: jest.fn(),
    saveTutorials: jest.fn(),
  };

  let controller: AdminController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminController(svc as any);
  });

  it('rejects invalid page ids for settings routes', () => {
    expect(() => controller.getPageSettings('abc')).toThrow(
      BadRequestException,
    );
    expect(() => controller.updatePageSettings('0', {})).toThrow(
      BadRequestException,
    );
  });

  it('rejects invalid page ids for bot knowledge routes', () => {
    expect(() => controller.getClientKnowledge('-1')).toThrow(
      BadRequestException,
    );
    expect(() => controller.setClientQuestions('NaN', [])).toThrow(
      BadRequestException,
    );
    expect(() => controller.setClientReplies('1.2', {})).toThrow(
      BadRequestException,
    );
    expect(() => controller.pushGlobalToPage('', 'welcome')).toThrow(
      BadRequestException,
    );
  });

  it('passes parsed numeric ids to service for valid page routes', () => {
    controller.getPageSettings('12');
    controller.pushGlobalToPage('7', 'welcome');

    expect(svc.getPageSettings).toHaveBeenCalledWith(12);
    expect(svc.pushGlobalQuestionToPage).toHaveBeenCalledWith(7, 'welcome');
  });
});
