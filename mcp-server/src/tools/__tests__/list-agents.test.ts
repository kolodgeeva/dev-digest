import { describe, it, expect } from 'vitest';
import { listAgentsHandler } from '../list-agents.js';
import { makeDeps, agent } from './fixtures.js';

describe('list_agents', () => {
  it('projects high-signal fields and paginates with an opaque cursor', async () => {
    const deps = makeDeps({
      listAgents: async () => [agent('a1'), agent('a2'), agent('a3')],
    });

    const first = await listAgentsHandler(deps)({ limit: 2 });
    const page1 = first.structuredContent as { agents: { id: string }[]; next_cursor: string | null };
    expect(page1.agents.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(page1.next_cursor).toBeTypeOf('string');
    // High-signal projection only (R3: id, name, enabled, model).
    expect(Object.keys(page1.agents[0]!)).toEqual(['id', 'name', 'enabled', 'model']);

    const second = await listAgentsHandler(deps)({ cursor: page1.next_cursor!, limit: 2 });
    const page2 = second.structuredContent as { agents: { id: string }[]; next_cursor: string | null };
    expect(page2.agents.map((a) => a.id)).toEqual(['a3']);
    expect(page2.next_cursor).toBeNull();
  });

  it('returns an empty list (not an error) when no agents exist', async () => {
    const res = await listAgentsHandler(makeDeps())({});
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({ agents: [], next_cursor: null });
  });
});
