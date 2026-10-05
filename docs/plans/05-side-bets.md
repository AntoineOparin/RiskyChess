# Plan 05: Side Bets (sealed prop bets on chance and the opponent)

## Agent brief (meta prompt)
You are a **casino actuary / prop-bet trader** who prices every market from simulation, plus a **game-integrity reviewer** whose single job is to kill any bet the bettor can force. You work with a **mobile designer** who builds a bet slip that takes under five seconds. Bets are sealed, so the opponent knows only how many you hold.

## Integrity rule (non-negotiable)
A bet is allowed only if the bettor **cannot make it happen unilaterally** through their own executed moves (with or without their own Loaded Dice stakes). Every catalog entry carries a written **control audit**: `opponent` (the opponent's choices plus the opponent's coin), `chance` (coin outcomes the bettor can't weight), or `mixed` (needs void rules and a lower payout). Self-controlled bets ("I castle by move 10", "I capture their queen") are banned. Reviewers reject any PR that adds a bet without an audit line.

## Launch catalog (v1)
| Kind | Example | Control | Settles | Void when |
|---|---|---|---|---|
| `opp_castles_by` | Opponent castles by their move 10 | opponent | when they castle (won), or when they lose both rights / pass move 10 (lost) | — |
| `opp_promotes` | Opponent promotes a pawn | opponent | promotion (won) / game end (lost) | — |
| `opp_toss_upset` | Opponent's lower-odds move executes in their next 5 tosses | chance + opponent | per toss | fewer than 5 tosses before game end |
| `opp_all_in_bust` | Opponent declares All-In and loses (All-In mode only) | opponent + chance | the bust (won) / game end (lost) | — |
| `game_length_under` | Game ends before ply 60 | mixed | game end | the **bettor** resigns, abandons or times out |
| `game_length_over` | Game lasts past ply 80 | mixed | ply 81 (won) / game end (lost) | the **opponent** resigns, abandons or times out |

## Rules
- Up to 3 bets per player. Stake 5–25 ◎ per bet. Bets can be placed only while `turnNumber ≤ 4` (the betting window). The stake is debited when placed.
- Payout multipliers come from simulation:
  - `packages/engine/scripts/price-bets.ts` runs ≥ 2000 bot-vs-bot games per relevant rule set.
  - `payoutX100 = clamp(floor(100 × (1 − 0.08) / p), 120, 1000)` (8% house margin, 1.2×–10×).
  - Output is committed to `packages/shared/src/betOdds.ts` as a generated file with a header comment.
- Settlement runs in `afterTurn`, and at game over for anything still open. Payouts and refunds are `chips` effects.

## Changes
- `packages/engine/src/modes/side-bets.ts`:
  - `BET_CATALOG` (kind → params schema, audit, predicate over `history`).
  - `validateBet` (window, limit, stake, wallet, mode-gated kinds).
  - `afterTurn` settlement.
  - `botExtras` is none. Instead export `botBets(rng)`, which the bot places at turn 1 (1–2 random bets, minimum stake).
- Server:
  - Implement `GameManager.placeBet(color, payload)`. It is synchronous, idempotent via `clientBetId`, and stores the bet in `modeState.bets[color]`.
  - Ack with `bet_placed` via `emitTo(color)`. The opponent receives a `state_sync` through `viewFor` showing only `SealedBets`.
  - At game over, emit `bets_revealed` to the room.
  - Wire the bot's bets at game start.
- `apps/mobile/src/modes/side-bets/`:
  - `Panel`: a "🎟 Bet slip (2/3)" button, visible during the window. It opens a bottom-sheet Modal with catalog cards (title, "×3.4", control icon), a stake stepper `5 · 10 · 25`, and a Place button. When the window closes, the panel shows "Betting closed".
  - `PlayerBar` accessory: your bets as small chips with a status dot, and "2 sealed bets" for the opponent.
  - `describeEffect` → "🎟 Opponent castled — +34 ◎".
  - Game-over screen: a **Bet ledger** card listing both players' revealed bets.
  - Offline: the same flow against the local engine.
- Tests:
  - Each predicate (won, lost and void paths).
  - The integrity test: for every catalog entry, a scripted game shows the bettor alone cannot force a win (the opponent's moves are fixed to avoid it, and the bet must not settle won).
  - Window, limit and stake validation.
  - Server redaction: the opponent's socket payloads never contain bet kinds before game over.

## Shared files you may touch
`modes/registry.ts`, `GameManager.ts` (`placeBet` body plus the bot-bet hook in `create`/`join`), `PlayerBar.tsx` (accessory slot, if the foundation didn't provide one), and the game-over section of `GameView.tsx` (ledger slot).
