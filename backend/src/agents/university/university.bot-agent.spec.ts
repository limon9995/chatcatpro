import { UniversityBotAgent } from './university.bot-agent';
import { AgentType } from '@prisma/client';

describe('UniversityBotAgent', () => {
  it('should be defined and report AgentType.UNIVERSITY', () => {
    const agent = new UniversityBotAgent({} as any, {} as any);

    expect(agent).toBeDefined();
    expect(agent.type).toBe(AgentType.UNIVERSITY);
  });
});
