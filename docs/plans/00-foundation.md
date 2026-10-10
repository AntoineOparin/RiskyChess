# Plan 00: Foundation: composable game modes, chip economy, UI shell

## Agent brief (meta prompt)
You are a **three-person senior team in one head**:
- **Principal game-systems designer** (shipped competitive chess variants and casino table games). You own rule clarity, composability and fairness. Every mode must be explainable in two sentences.
- **Staff TypeScript engineer** for authoritative real-time servers (Socket.io, idempotent commands, hidden-information redaction). You own contracts, purity of the engine, and the synchronous critical section in `GameManager.submit`.
- **Senior mobile product designer** (React Native/Expo). You work thumb-first, keep motion cheap (reanimated opacity/translate only, no physics) and design accessible odds displays (always text plus colour, never colour alone).

Mission: turn the hard-coded classic rules into a **mode pipeline**, and define the **complete contract** for Plans 01–05 so they can run in parallel without touching hot files. Ship stubs for every mode. Classic play must behave byte-for-byte the same as today, and every existing test must pass unchanged in meaning.

Definition of done: classic games are unchanged. A game can be created with any mode combination, and the picker UI works. The stubs compile and do nothing. `pnpm typecheck && pnpm test` passes. The work is committed and pushed to `develop`.

## 1. Shared contract (`packages/shared`): define everything up front
`types/modes.ts` (new):
- `ModeId = 'loaded_dice' | 'odds_market' | 'all_in' | 'side_bets'`. Provably Fair is **not** a mode; it is always on for online games.
- `GameRules { modes: ModeId[] }`. Add `MODE_PRESETS` in `constants.ts`: Classic `[]`, Loaded Dice, Odds Market, All-In, Side Bets, and **High Roller** (all four).
- `MODE_COMPAT`: all four combine. Composition order is documented below.
- `Wallet = Record<Color, number>`. Add `ECONOMY` constants: `START_CHIPS = 100`, and `CAPTURE_INCOME = PIECE_VALUES` (chips earned = value of the captured piece; applies whenever any chip mode is on).
- `Odds { A: number }`, in basis points (0–10000) that slot A executes.
- `TurnExtras { favor?: MoveSlot; stake?: number; allIn?: boolean; clientSeed?: string }`.
- `TurnEffect` discriminated union. All members are defined now:
  - `{ kind: 'chips'; color; delta; reason: 'capture' | 'stake' | 'market_payout' | 'bet_stake' | 'bet_payout' | 'bet_refund' }`
  - `{ kind: 'odds_breakdown'; steps: { source: ModeId | 'base'; A: number }[] }`
  - `{ kind: 'all_in'; color; won: boolean; piece; square; bonusPly: boolean }`
  - `{ kind: 'bet_settled'; color; betId; result: 'won' | 'lost' | 'void'; payout }`
- `PropBetKind` union, `PropBet { id; kind; params; stake; payoutX100; placedAtTurn; status }`, and `SealedBets { count: number }` (the opponent's redacted view).
- `ModeState { allInsUsed?: Record<Color, PieceSymbol[]>; bets?: Partial<Record<Color, PropBet[] | SealedBets>> }`.

Edits to existing types:
- `MoveSubmission.extras?: TurnExtras`
- `CreateGamePayload.rules?: GameRules` (default classic)
- `GameSession.rules`, `wallet?`, `modeState`
- `TurnResult.odds: Odds`, `TurnResult.effects: TurnEffect[]`, `TurnResult.walletAfter?`
- `CoinToss.roll?: number` (the 0–9999 draw)

Mark all-in and bonus behaviour in a doc comment: **turn is derived from `fenAfter`, never flipped.**

Socket events: `place_bet`, `bet_placed` (sent to the placing seat), `bets_revealed` (at game over).

`ErrorCode` additions: `INSUFFICIENT_CHIPS`, `INVALID_STAKE`, `MODE_DISABLED`, `ALL_IN_USED`, `ALL_IN_INVALID`, `BETTING_CLOSED`, `BET_LIMIT`, `BET_INVALID`.

`schemas.ts`: zod schemas for every new payload. `extras` stays optional, so old clients still validate.

## 2. Engine pipeline (`packages/engine`)
New `modes/types.ts` with a `ModeModule` interface. Every hook is optional and pure:
```ts
interface ModeModule {
  id: ModeId;
  validate?(ctx: TurnCtx): ValidationFailure | null;   // extras legality
  adjustOdds?(ctx: TurnCtx, odds: Odds): Odds;         // composes in MODE_ORDER
  apply?(ctx: TurnCtx, roll: TossRoll): ApplyResult | null; // override board application (all_in)
  effects?(ctx: TurnCtx, applied: Applied): TurnEffect[];
  afterTurn?(state: SessionLike, result: TurnResult): TurnEffect[]; // bets settlement
  botExtras?(fen: string, pair: BotPair, state: SessionLike, rng: Rng): TurnExtras;
}
```
- `MODE_ORDER = ['odds_market', 'loaded_dice']` for odds. The market sets the line, then stakes move it, then the result is clamped to `[1000, 9000]` in `odds.ts`.
- `modes/index.ts` registry. Add **stub files** `loaded-dice.ts`, `odds-market.ts`, `all-in.ts` and `side-bets.ts`, each exporting a module with only `id`, plus `// Plan 0X implements this` comments.
- Refactor `resolveTurn(input, deps)`:
  - `input` gains `rules`, `wallet`, `modeState` and `extras`.
  - `deps = { rng: Rng; method: CoinToss['method']; proof?: ... }`.
  - The pipeline is base validate → mode validate → odds (base 5000 → modules → clamp) → `roll = rng.int(10000)`, `chosen = roll < odds.A ? 'A' : 'B'` → apply (module override or default) → effects (economy capture income + modules) → `deriveOutcome`.
  - Keep a thin `rngTosser`-compatible path so the old `Tosser` test seam still works (`deps.forceSlot`).
- `economy.ts`: `applyEffects(wallet, effects)`, which asserts the wallet never goes negative.
- `bot.ts`: `pickBotSubmission(fen, state, rng)` = `pickBotPair` plus the merged `botExtras` from active modules.
- Tests: classic parity. Run every scenario in the existing `engine.test.ts`, plus check that odds of 5000 with the forced slot reproduce today's results exactly. Also test odds clamping, wallet non-negativity, and that a turn derived from FEN equals `other(mover)` in classic.

## 3. Server (`apps/server`)
- `GameManager.create`: accept `rules`, initialise the `wallet` (when any chip mode is on) and `modeState`.
- `submit`: pass rules, wallet, modeState and extras into `resolveTurn`. Apply effects to the wallet. Run `afterTurn` hooks and append their effects. **Set `s.turn` from `fenAfter`** (`new Chess(fen).turn()` or a cheap FEN split).
- Per-seat channels: `handlers.ts` also joins `game:<id>:<color>`. Add `emitTo(gameId, color, event, ...)` alongside `emit`.
- `viewFor(session, color)` redaction in `game/redact.ts`. It replaces the opponent's `modeState.bets` with `SealedBets`. Every session-bearing emit/ack (`game_started`, `state_sync`, `rejoin_game`, `request_state`) goes per seat through `viewFor`.
- `place_bet` handler: wire it to `manager.placeBet()`, which returns `MODE_DISABLED` until Plan 05.
- `scheduleBot` uses `pickBotSubmission`.
- Test seam: `createApp({ tossRng })`. Keep `tosser` accepted, mapped to `forceSlot`, so existing tests stay green.
- Tests: create with rules, wallet initialised, redaction (the opponent never sees bets), turn derived from FEN, classic parity.

## 4. Mobile UX shell (`apps/mobile`)
Design principles: one decision per screen, odds always shown as numbers ("62%"), chips shown with a single glyph (◎), no new physics animation. Every mode-specific control lives in **one panel zone** above the slot bar, so the board never moves.

- **New route `/new-game`** (`app/new-game.tsx`):
  - Step 1 is the mode picker. It shows vertically stacked `ModeCard`s: name, a one-line pitch, a "Risk" meter (1–3 ◆ glyphs), and a "How it plays" expandable list of three bullets. The High Roller preset is pinned at the bottom. An "Advanced: mix modes" toggle reveals per-mode switches.
  - Step 2 is the opponent choice: Offline bot / Online bot / Invite a friend.
  - Footer: "Chips are play money. No real-money wagering."
- **Home (`app/index.tsx`)**: the primary CTA becomes "New game" → `/new-game`. Keep the name field and the join-by-code row. Joining shows a **Table Rules sheet** (`RulesSheet`) once the game starts, if the rules aren't classic, with an "I'm in" dismiss.
- **GameView slots** (generic and mode-agnostic):
  - `PlayerBar` gets an optional `chips` prop → `◎ 87`. It pulses briefly on change, using the existing `lib/motion.ts` timings.
  - A `ModePanelZone` between status and `MoveSlotBar` renders `registry[mode].Panel` for each active mode, stacked vertically and compact (≤ 56 px each).
  - `MoveSlotBar`/`SlotChip` get an optional `badge` render prop (shows the odds text), taken from `registry[mode].SlotBadge`. A generic `OddsBadge` shows "50%" only when the odds aren't 50/50.
  - `TossReveal`: when `odds.A !== 5000`, show a **static segmented bar** (A-colour width = odds) with a marker that slides to the roll position. Use a single `withTiming` translate, which respects `useReducedMotion`.
  - `EffectsFeed`: after a reveal settles, show stacked toasts for each `TurnEffect` (e.g. "+5 ◎ capture"). They auto-dismiss after 2.5 s and are rendered by the mode registry's `describeEffect`.
  - A "?" icon in the status row opens `RulesSheet` for the current rules.
- `apps/mobile/src/modes/registry.ts`: `{ [ModeId]: { title, pitch, risk, bullets, Panel?, SlotBadge?, describeEffect? } }`, with stub folders for each mode.
- Pending extras live in the store: `useModeExtras` (Zustand slice) collects panel inputs (stake, favor, all-in). `onSubmit(moveA, moveB, extras)` threads them through `useOnlineGame` and `useLocalBotGame`.
- `useLocalBotGame(humanColor, rules)` uses the engine pipeline with `mathRng`, keeps a local wallet and modeState, and calls `pickBotSubmission`.
- `gameStore.applyTurnResult`: take the turn from `fenAfter`, and apply `walletAfter` and effects.

## Verification
- `pnpm typecheck && pnpm test`. All existing tests pass, plus the new parity and redaction tests.
- Manual: a classic offline game plays identically. Create an online game with High Roller: the rules sheet shows for the joiner, chip counters show 100/100, and the stub modes do nothing.
- Commit and push to `develop`.

