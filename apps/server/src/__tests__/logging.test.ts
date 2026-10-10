import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MoveInput } from '@risky-chess/shared';
import { seededRng } from '@risky-chess/engine';
import { GameManager } from '../game/GameManager';
import { InMemoryGameStore } from '../game/GameStore';
import { setLogLevel } from '../log';

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4) }) as MoveInput;

afterEach(() => {
  setLogLevel('silent');
  vi.restoreAllMocks();
});

describe('logging', () => {
  it('logs transitions and rejections at debug level, but never a seed before it is revealed', async () => {
    const lines: string[] = [];
    for (const k of ['log', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation((l: string) => void lines.push(l));
    setLogLevel('debug');

    const store = new InMemoryGameStore();
    const manager = new GameManager(store, () => {}, { rng: seededRng(1) });
    const w = manager.create({ mode: 'pvp', displayName: 'A', color: 'w', rules: { modes: ['all_in'] } }, 'cw');
    if (!w.ok) throw new Error();
    manager.join({ gameId: w.data.gameId, displayName: 'B' }, 'cb');
    await Promise.resolve();
    const record = store.get(w.data.gameId)!;

    manager.submit('w', { gameId: w.data.gameId, turnNumber: 1, clientSubmissionId: 'bad', moveA: m('e2e4'), moveB: null, extras: { allIn: true } });
    manager.submit('w', { gameId: w.data.gameId, turnNumber: 1, clientSubmissionId: 'ok', moveA: m('e2e4'), moveB: m('d2d4') });
    const pendingSeed = record.turnSeeds.get(2)!;

    const out = lines.join('\n');
    expect(out).toMatch(/\[game\] created .*"rules":\["all_in"\]/);
    expect(out).toMatch(/\[game\] submission rejected .*"error":"ALL_IN_INVALID"/);
    expect(out).toMatch(/\[game\] turn resolved .*"turnNumber":1/);
    expect(out).not.toContain(pendingSeed);
  });

  it('is silent by default under the test runner', () => {
    const spy = vi.spyOn(console, 'log');
    const manager = new GameManager(new InMemoryGameStore(), () => {}, { rng: seededRng(1) });
    manager.create({ mode: 'pvp', displayName: 'A', color: 'w' }, 'c');
    expect(spy).not.toHaveBeenCalled();
  });
});
