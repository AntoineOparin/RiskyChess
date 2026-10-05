/// <reference types="node" />
import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { START_FEN, type MoveInput, type TurnResult } from '@risky-chess/shared';
import { commitmentOf, hmacRng, hmacRoll, REJECT_AT, resolveTurn, rollFromMessage, verifyToss } from '..';

const m = (lan: string): MoveInput => ({ from: lan.slice(0, 2), to: lan.slice(2, 4) }) as MoveInput;

/** Reference implementation on node:crypto, independent of @noble/hashes. */
function nodeRoll(seed: string, msg: string): number {
  const key = Buffer.from(seed, 'hex');
  for (let b = 0; ; b++) {
    const h = createHmac('sha256', key).update(b === 0 ? msg : `${msg}:${b}`).digest();
    for (let i = 0; i < 32; i += 4) {
      const n = h.readUInt32BE(i);
      if (n < 4294960000) return n % 10000;
    }
  }
}

const SEED_A = '0123456789abcdef'.repeat(4);

function tossed(seed: string, clientSeed: string, odds = 5000): TurnResult {
  const r = resolveTurn(
    {
      gameId: 'ABC123',
      turnNumber: 1,
      fen: START_FEN,
      previousFens: [],
      moveA: m('e2e4'),
      moveB: m('d2d4'),
      // Odds only move with modes; force them for the weighted check through the result instead.
    },
    { rng: hmacRng(seed, 'ABC123', 1, clientSeed), method: 'hmac-commit-reveal', proof: { commitment: commitmentOf(seed), serverSeed: seed, clientSeed } },
  );
  if (!r.ok) throw new Error(r.message);
  return odds === 5000 ? r.result : { ...r.result, odds: { A: odds } };
}

describe('hmacRoll', () => {
  it('matches known-answer vectors', () => {
    expect(commitmentOf('00'.repeat(32))).toBe('66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925');
    expect(hmacRoll('00'.repeat(32), 'ABC123', 1, 'deadbeef')).toBe(9885);
    expect(hmacRoll('00'.repeat(32), 'ABC123', 2, '00112233')).toBe(6516);
    expect(hmacRoll('ff'.repeat(32), 'ABC123', 1, 'deadbeef')).toBe(2273);
    expect(hmacRoll(SEED_A, 'ABC123', 1, 'deadbeef')).toBe(6591);
    expect(hmacRoll(SEED_A, 'ABC123', 2, '00112233')).toBe(8912);
  });

  it('agrees with an independent node:crypto implementation', () => {
    for (let i = 0; i < 200; i++) {
      const seed = randomBytes(32).toString('hex');
      const client = randomBytes(16).toString('hex');
      expect(hmacRoll(seed, 'G', i, client)).toBe(nodeRoll(seed, `G:${i}:${client}`));
    }
  });

  it('rejects the biased tail of uint32', () => {
    expect(REJECT_AT).toBe(4294960000);
    // Every accepted value maps evenly: 429496 uint32s per roll value.
    expect(REJECT_AT % 10_000).toBe(0);
    expect(rollFromMessage('00'.repeat(32), 'x')).toBeGreaterThanOrEqual(0);
  });

  it('is uniform over 100k rolls (chi-square, 100 buckets)', () => {
    const seed = randomBytes(32).toString('hex');
    const n = 100_000;
    const buckets = new Array<number>(100).fill(0);
    for (let i = 0; i < n; i++) buckets[Math.floor(hmacRoll(seed, 'G', i, 'c0ffee00') / 100)]!++;
    const expected = n / 100;
    const chi = buckets.reduce((s, o) => s + (o - expected) ** 2 / expected, 0);
    // 99 degrees of freedom: p = 0.001 at about 148.2.
    expect(chi).toBeLessThan(148.2);
  }, 60_000);

  it('only answers a single int(10000)', () => {
    const rng = hmacRng(SEED_A, 'G', 1, 'abcd1234');
    expect(() => rng.int(2)).toThrow();
    rng.int(10_000);
    expect(() => rng.int(10_000)).toThrow();
  });
});

describe('verifyToss', () => {
  it('accepts an honest toss', () => {
    const r = tossed(SEED_A, 'deadbeef');
    expect(r.coin).toMatchObject({ method: 'hmac-commit-reveal', roll: 6591, chosen: 'B', serverSeed: SEED_A, clientSeed: 'deadbeef' });
    expect(r.executed.lan).toBe('d2d4');
    expect(verifyToss(r)).toEqual({ ok: true });
  });

  it('fails when any part was tampered with', () => {
    const r = tossed(SEED_A, 'deadbeef');
    const coin = r.coin!;
    expect(verifyToss({ ...r, coin: { ...coin, serverSeed: 'ff'.repeat(32) } })).toMatchObject({ ok: false, reason: expect.stringMatching(/commitment/) });
    expect(verifyToss({ ...r, coin: { ...coin, clientSeed: 'deadbeee' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/recomputes/) });
    expect(verifyToss({ ...r, coin: { ...coin, roll: 10 } })).toMatchObject({ ok: false });
    expect(verifyToss({ ...r, coin: { ...coin, chosen: 'A' } })).toMatchObject({ ok: false });
    expect(verifyToss({ ...r, executed: r.moveA })).toMatchObject({ ok: false, reason: expect.stringMatching(/executed/) });
    expect(verifyToss({ ...r, coin: { ...coin, method: 'local' } })).toMatchObject({ ok: false });
  });

  it('checks the slot against weighted odds', () => {
    // Roll 6591: B at fair odds, A once A's line passes 65.91%.
    expect(verifyToss(tossed(SEED_A, 'deadbeef', 6592))).toMatchObject({ ok: false });
    const atSeventy = tossed(SEED_A, 'deadbeef');
    expect(verifyToss({ ...atSeventy, odds: { A: 7000 }, coin: { ...atSeventy.coin!, chosen: 'A' }, executed: atSeventy.moveA })).toEqual({ ok: true });
    expect(verifyToss({ ...atSeventy, odds: { A: 6591 } })).toEqual({ ok: true });
  });
});
