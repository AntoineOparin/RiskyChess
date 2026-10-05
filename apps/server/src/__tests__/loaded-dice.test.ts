import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoveInput, TurnResult } from '@risky-chess/shared';
import { seededRng, verifyToss } from '@risky-chess/engine';
import { GameManager } from '../game/GameManager';
import { InMemoryGameStore } from '../game/GameStore';

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4) }) as MoveInput;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function game() {
  const resolved: TurnResult[] = [];
  const store = new InMemoryGameStore();
  const manager = new GameManager(store, (_g, e, ...a) => e === 'turn_resolved' && resolved.push(a[0] as TurnResult), { rng: seededRng(1) });
  const w = manager.create({ mode: 'pvp', displayName: 'A', color: 'w', rules: { modes: ['loaded_dice'] } }, 'cw');
  if (!w.ok) throw new Error();
  manager.join({ gameId: w.data.gameId, displayName: 'B' }, 'cb');
  await Promise.resolve();
  return { manager, store, id: w.data.gameId, resolved };
}

describe('loaded dice on the server', () => {
  it('rejects an over-stake with INSUFFICIENT_CHIPS and leaves the turn open', async () => {
    const g = await game();
    g.store.get(g.id)!.session.wallet = { w: 15, b: 100 };
    const res = g.manager.submit('w', { gameId: g.id, turnNumber: 1, clientSubmissionId: 'x', moveA: m('e2e4'), moveB: m('d2d4'), extras: { stake: 20, favor: 'A' } });
    expect(res).toMatchObject({ ok: false, error: 'INSUFFICIENT_CHIPS' });
    const s = g.store.get(g.id)!.session;
    expect(s).toMatchObject({ turn: 'w', turnNumber: 1, wallet: { w: 15, b: 100 }, history: [] });
    // The same turn still accepts an affordable stake.
    expect(g.manager.submit('w', { gameId: g.id, turnNumber: 1, clientSubmissionId: 'y', moveA: m('e2e4'), moveB: m('d2d4'), extras: { stake: 10, favor: 'A' } }).ok).toBe(true);
  });

  it('charges the stake, tosses at the tilted odds and stays verifiable', async () => {
    const g = await game();
    g.manager.submit('w', { gameId: g.id, turnNumber: 1, clientSubmissionId: 'x', moveA: m('e2e4'), moveB: m('d2d4'), extras: { stake: 20, favor: 'B', clientSeed: '0011223344556677' } });
    const r = g.resolved[0]!;
    expect(r.odds).toEqual({ A: 2000 });
    expect(r.walletAfter).toEqual({ w: 80, b: 100 });
    expect(verifyToss(r)).toEqual({ ok: true });
  });
});
