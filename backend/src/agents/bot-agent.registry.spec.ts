import { AgentType } from '@prisma/client';
import { BotAgentRegistry } from './bot-agent.registry';
import { BotAgent } from './bot-agent.interface';

function fakeAgent(type: AgentType): BotAgent {
  return { type, handleMessage: jest.fn() };
}

describe('BotAgentRegistry', () => {
  it('resolves each registered agent by its type', () => {
    const defaultAgent = fakeAgent(AgentType.DEFAULT);
    const universityAgent = fakeAgent(AgentType.UNIVERSITY);
    const registry = new BotAgentRegistry([defaultAgent, universityAgent]);

    expect(registry.resolve(AgentType.DEFAULT)).toBe(defaultAgent);
    expect(registry.resolve(AgentType.UNIVERSITY)).toBe(universityAgent);
  });

  it('throws when two agents register the same type', () => {
    const a = fakeAgent(AgentType.DEFAULT);
    const b = fakeAgent(AgentType.DEFAULT);

    expect(() => new BotAgentRegistry([a, b])).toThrow(/Duplicate agent registered/);
  });
});
