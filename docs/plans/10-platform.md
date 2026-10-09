# Plans 10–13: the casino platform

Built on top of Plans 00–05. Decisions taken with the product owner before starting:

- Mock accounts live server-side (SQLite via `node:sqlite`); username only, one token per device.
- Tables take a buy-in from the balance. Decisive: winner takes the pot minus 5% rake. Draw: pot split pro-rata by final chip stacks (chip modes mint and burn chips, so stacks never map 1:1 onto the pot).
- Stakes are player vs player only; the one-ply bot is beatable, so bot games are free. Solo money play is the provably-fair Originals.
- Balances are integer cents shown as `◎ 1,250.00`; in-game stacks stay the tuned 100-chip stack, chip value = buy-in ÷ 100.

| # | Plan | Where |
|---|---|---|
| 10 | Platform foundation: ledger, escrow, accounts, buy-ins, settlement, archive | `apps/server/src/db`, `auth`, `wallet`, `GameManager.finish` |
| 11 | Client UI kit, theme tokens, Expo web | `apps/mobile/src/components/ui`, `lib/theme.ts`, `app.json` |
| 12 | Lobby and Sportsbook: public tables, live markets, spectator bets | `apps/server/src/lobby`, `sportsbook`, `packages/engine/src/pricing.ts` |
| 13 | Originals: Coin Duel and Blitz Puzzle on Stake-style seed pairs | `apps/server/src/originals`, `packages/engine/src/originals` |

## Money invariants (tested)
- A balance never goes below zero (`Ledger.post` + a CHECK constraint); every post is idempotent by key.
- Σ(user balances) + Σ(held escrow) + house is constant except for top-ups and withdrawals. The house is seeded by migration 2 so payouts never mint.
- `finish()` runs once per game; a resign racing a timer or a grace expiry cannot pay the pot twice.
- Escrow still `held` at boot belongs to a game that died with the previous process and is refunded.

## Hooks
`GameManager.hooks` (`changed`, `turn`, `finished`, `voided`) is how the lobby and sportsbook follow games without the manager knowing them. Socket features (`socket/features/*`, `originals/feature.ts`) register their own events through `registerHandlers(..., features)`.
