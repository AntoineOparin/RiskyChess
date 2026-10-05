# Plan 01: Provably Fair House (commit-reveal tosses)

## Agent brief (meta prompt)
You are a **security engineer specialising in provably-fair gaming RNG** (crypto-casino commit-reveal schemes and HMAC-DRBGs), paired with a **mobile trust-and-safety UX designer**. You think adversarially. A malicious server must not be able to pick outcomes after seeing moves, and a malicious client must not be able to bias rolls. The result must be verifiable by an ordinary player with one tap. You write threat-model notes before code.

Mission: every online toss (pair coin, All-In coin, and any weighted toss) is committed before the mover submits and verifiable afterwards on the device. The work is mode-agnostic: it replaces the *source* of `roll`, not its meaning.

## Protocol
1. In `beginTurn`, the server generates a `serverSeed` of 32 random bytes and stores it in `GameRecord.turnSeeds[turnNumber]`. It publishes `commitment = sha256(serverSeed)` in `turn_started` (the field already exists) and in `GameSession.pendingCommitment` for rejoiners.
2. The client sends `extras.clientSeed` (16 random bytes, hex) with the submission. The bot gets a server-generated seed.
3. `roll = uniform10000(HMAC-SHA256(serverSeed, "${gameId}:${turnNumber}:${clientSeed}"))`. Take uint32 chunks with **rejection sampling** (reject ≥ 4294960000) and iterate a counter for more bytes.
4. `TurnResult.coin` = `{ method: 'hmac-commit-reveal', commitment, serverSeed, clientSeed, roll }`.
5. Threat notes: the seed is fixed before the moves (the server can't steer). The client seed prevents a precomputed seed table. Odds come from the submission, which is known only after the commitment, so the server can't pick favourable seeds per odds. Seeds are never logged and are deleted after reveal.

## Changes
- `packages/engine`: add `@noble/hashes` (pure JS, works in RN and Node). Add `fairness.ts` with `hmacRoll(serverSeed, gameId, turn, clientSeed): number` and `verifyToss(result: TurnResult): { ok: boolean; reason? }`, which checks sha256(seed) === commitment, recomputes the roll, recomputes `chosen` from `odds`, and checks `chosen` matches `executed`.
- `apps/server/src/crypto/coin.ts`: `hmacRngFor(serverSeed, msg)` returns an `Rng` whose `int(10000)` yields the HMAC roll. `GameManager.submit` passes it as `deps.rng` with method `'hmac-commit-reveal'`. Delete the seed after resolve. Note: this is the **only** GameManager edit; keep it inside `submit`/`beginTurn`.
- `apps/mobile`:
  - `net` / `useOnlineGame` generate `clientSeed` via `expo-crypto` `getRandomBytes`.
  - Add a `FairBadge` (✓ Verified / ⚠ Mismatch) next to "Last toss", which runs `verifyToss` locally.
  - Add a new screen `app/game/[id]/fairness.tsx`: a list of turns showing commitment (short hash), seed, roll and odds, each with a ✓ badge. It includes a plain-language "How this works" section with three bullets.
  - Offline games show "Local coin: not verifiable".
- Tests: engine known-answer vectors for `hmacRoll`, a chi-square sanity check over 100k rolls (uniform within tolerance), a tamper test (a modified seed → `verifyToss` fails), and a weighted-odds check. Server: `turn_started.commitment` equals sha256 of the revealed seed, and the reconnect path delivers the pending commitment.

## Shared files you may touch
`crypto/coin.ts`, `GameManager.ts` (`beginTurn`/`submit` seed lines only), `GameStore.ts` (`turnSeeds`), and `useOnlineGame.ts` (`clientSeed` line).

