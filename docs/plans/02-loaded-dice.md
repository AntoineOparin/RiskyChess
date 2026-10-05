# Plan 02: Loaded Dice (pay chips to tilt the coin)

## Agent brief (meta prompt)
You are a **casino game-economy designer** (bankroll curves, price elasticity, "tilt" psychology) working with a **senior TypeScript engineer**. The design goal is that chips should feel scarce at the decisive moment but never paralysing, and no purchase may ever guarantee an outcome. You balance with numbers, not vibes: write a short self-play simulation to check that the average chips spent per game sits at 40–70% of the starting stack.

## Rules
- Each turn the mover can **favor** slot A or B and stake a tier: `0` → no shift, `4 ◎` → +10 pts, `10 ◎` → +20 pts, `20 ◎` → +30 pts toward the favored slot.
- Final odds are clamped to 10–90% by the foundation. A guaranteed win is never possible.
- The stake is paid whatever the result. There is no stake on forced turns or All-In turns (`INVALID_STAKE`).
- Income comes from captures (foundation economy). That keeps the stack alive in long games.

## Changes
- `packages/engine/src/modes/loaded-dice.ts`:
  - `validate`: the stake must be a tier and ≤ wallet (`INSUFFICIENT_CHIPS`), and `favor` is required if stake > 0.
  - `adjustOdds`: shift toward `favor`.
  - `effects`: a `chips` debit with reason `stake`.
  - `botExtras`: stake only when `scoreMove` gap ≥ 3 and the wallet is above 30. Pick the highest affordable tier ≤ 10.
  - Export `LOADED_DICE_TIERS` for the UI.
- `apps/mobile/src/modes/loaded-dice/`:
  - `Panel`: a segmented control `[A] [—] [B]` for favor, plus four tier pills `0 · 4 · 10 · 20` showing a live preview of the resulting odds (computed with the engine's odds pipeline, so it composes with Odds Market). Unaffordable tiers are disabled.
  - `SlotBadge` shows final odds.
  - `describeEffect` → "−10 ◎ loaded toward A".
  - The panel resets each turn.
- Tests: tier validation, odds composition with a stubbed market module, wallet debits, the bot never staking above the wallet, and the server rejecting an over-stake with `INSUFFICIENT_CHIPS` without advancing the turn.

## Shared files you may touch
`modes/registry.ts` (one line, mobile and engine).

