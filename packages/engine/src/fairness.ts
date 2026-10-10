import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { MoveSlot, TurnResult } from '@risky-chess/shared';
import type { Rng } from './rng';

/*
 * Provably Fair tosses (commit-reveal).
 *
 * 1. At turn start the server draws a 32-byte serverSeed and publishes
 *    commitment = sha256(serverSeed) before the mover submits anything.
 * 2. The mover sends a clientSeed with the submission.
 * 3. roll = uniform10000(HMAC-SHA256(serverSeed, `${gameId}:${turn}:${clientSeed}`));
 *    slot A executes when roll < odds.A.
 * 4. The result reveals serverSeed and clientSeed; anyone can recompute it.
 *
 * Threat notes:
 * - The seed is fixed (committed) before the moves exist, so a server that
 *   sees the pair cannot steer the coin toward the move it prefers.
 * - The client seed is chosen after the commitment, so the server cannot
 *   precompute a table of seeds with known rolls.
 * - A client cannot bias the roll: it never sees the seed before submitting,
 *   and HMAC output is unpredictable without the key.
 * - Seeds are never logged and are deleted once revealed.
 */

export const ROLL_SPACE = 10_000;
/** Largest multiple of 10000 that fits in a uint32: values at or above it are rejected so the roll stays uniform. */
export const REJECT_AT = Math.floor(0x1_0000_0000 / ROLL_SPACE) * ROLL_SPACE; // 4294960000

const message = (gameId: string, turnNumber: number, clientSeed: string) => `${gameId}:${turnNumber}:${clientSeed}`;

/** sha256 of the seed bytes, hex. What the server publishes before the turn. */
export function commitmentOf(serverSeedHex: string): string {
  return bytesToHex(sha256(hexToBytes(serverSeedHex)));
}

/**
 * Uniform 0–9999 from HMAC-SHA256 blocks: block 0 keys the message itself,
 * block k > 0 keys `${message}:${k}`. Each block yields eight big-endian
 * uint32s, taken in order; any at or above REJECT_AT is skipped.
 */
export function rollFromMessage(serverSeedHex: string, msg: string): number {
  const key = hexToBytes(serverSeedHex);
  for (let block = 0; ; block++) {
    const bytes = hmac(sha256, key, utf8ToBytes(block === 0 ? msg : `${msg}:${block}`));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < bytes.length; i += 4) {
      const n = view.getUint32(i, false);
      if (n < REJECT_AT) return n % ROLL_SPACE;
    }
  }
}

export function hmacRoll(serverSeedHex: string, gameId: string, turnNumber: number, clientSeed: string): number {
  return rollFromMessage(serverSeedHex, message(gameId, turnNumber, clientSeed));
}

/** An Rng whose one draw is the committed HMAC roll. It only answers int(10000), once. */
export function hmacRng(serverSeedHex: string, gameId: string, turnNumber: number, clientSeed: string): Rng {
  let used = false;
  return {
    int(maxExclusive) {
      if (maxExclusive !== ROLL_SPACE) throw new Error(`hmacRng only draws 0–${ROLL_SPACE - 1}`);
      if (used) throw new Error('hmacRng draws one roll per turn');
      used = true;
      return hmacRoll(serverSeedHex, gameId, turnNumber, clientSeed);
    },
  };
}

export type Verification = { ok: true } | { ok: false; reason: string };

/**
 * Checks a revealed toss end to end: the seed matches the commitment, the
 * roll recomputes, the slot follows from the roll and the odds, and the
 * executed move is the one in that slot.
 */
export function verifyToss(result: TurnResult): Verification {
  const c = result.coin;
  if (!c) return { ok: false, reason: 'No toss on this turn' };
  if (c.method !== 'hmac-commit-reveal') return { ok: false, reason: 'Not a commit-reveal toss' };
  if (!c.commitment || !c.serverSeed || !c.clientSeed || c.roll === undefined) return { ok: false, reason: 'Proof fields missing' };
  if (!/^[0-9a-f]{64}$/.test(c.serverSeed)) return { ok: false, reason: 'Malformed server seed' };
  if (commitmentOf(c.serverSeed) !== c.commitment) return { ok: false, reason: 'Seed does not match the commitment' };
  const roll = hmacRoll(c.serverSeed, result.gameId, result.turnNumber, c.clientSeed);
  if (roll !== c.roll) return { ok: false, reason: `Roll recomputes to ${roll}, not ${c.roll}` };
  const chosen: MoveSlot = roll < result.odds.A ? 'A' : 'B';
  if (chosen !== c.chosen) return { ok: false, reason: `Roll ${roll} at odds ${result.odds.A} picks ${chosen}, not ${c.chosen}` };
  // A single-move (All-In) toss has no Move B: the declared move is always reported.
  const expected = chosen === 'B' && result.moveB ? result.moveB : result.moveA;
  if (expected.lan !== result.executed.lan) return { ok: false, reason: 'The executed move is not the one the coin picked' };
  return { ok: true };
}
