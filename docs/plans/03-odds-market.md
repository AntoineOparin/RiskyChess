# Plan 03: Odds Market (the house sets a line against you)

## Agent brief (meta prompt)
You are a **sportsbook trader / odds compiler** who also writes chess engines. You price each pair so that lazy "best move + throwaway" pairs are punished, while beating the line is rewarded. Line moves must be monotonic, explainable ("the house leans against your stronger move by 12%"), and cheap to compute on a phone. You validate pricing with self-play stats before committing constants.

## Rules
- `gap = scoreMove(fen, A) − scoreMove(fen, B)` (existing one-ply heuristic in `bot.ts`).
- `edge = min(1500, round(|gap| × 300))` bps, applied **against** the stronger move. A pair of equal moves stays at 50/50, and a strong move paired with junk ends up at about 35/65.
- **Beat the line:** if the stronger move executes anyway, the mover gets `round(edge / 100)` ◎ (`market_payout`).
- Composes before Loaded Dice. Players can buy back the line with stakes.

## Changes
- `packages/engine/src/modes/odds-market.ts`:
  - `adjustOdds` emits an `odds_breakdown` step.
  - `effects` handles the payout.
  - `botExtras` returns none. The bot instead **re-ranks its pair** to prefer small gaps: add an optional `pairPolicy` hook, or do it via `botExtras` returning nothing and the module exporting `preferBalancedPair()`, which `pickBotSubmission` calls when the mode is active. Coordinate only via the registry.
  - Export `marketLine(fen, A, B)` for client previews.
- `apps/mobile/src/modes/odds-market/`:
  - `SlotBadge`: "38% · pays 12◎" on the stronger slot and "62%" on the other. It updates live once both slots are filled.
  - The Panel is a one-line explainer: "House leans 12% against e4xd5".
  - `describeEffect` → "+12 ◎ beat the line".
- Tests: symmetry (swapping A/B mirrors the odds), monotonicity in the gap, edge cap, payout only when the stronger move executes, and determinism (client preview === server result).
- Optional (if time): `scripts/market-sim.ts`, which runs 500 bot-vs-bot games and prints the mean edge and payout per game. Put the result in the commit message.

## Shared files you may touch
`modes/registry.ts` (one line each), and `bot.ts` (only to add the exported pair-policy hook, if needed).

