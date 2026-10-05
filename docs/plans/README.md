# Risky Chess mode plans

| # | Plan | Depends on | Parallel? | Branch |
|---|---|---|---|---|
| 00 | Foundation: mode system, economy, UI shell | — | No, runs first | `develop` directly |
| 01 | Provably Fair House | 00 | Yes | `feat/provably-fair` |
| 02 | Loaded Dice | 00 | Yes | `feat/loaded-dice` |
| 03 | Odds Market | 00 | Yes | `feat/odds-market` |
| 04 | All-In Toss | 00 | Yes | `feat/all-in` |
| 05 | Side Bets | 00 | Yes | `feat/side-bets` |

## Git protocol for every feature agent
1. Branch from up-to-date `origin/develop` inside your worktree: `git fetch origin && git switch -c feat/<id> origin/develop`.
2. Commit in small logical steps. End every commit message with
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
3. When done: `git fetch origin && git rebase origin/develop`, then `pnpm install && pnpm typecheck && pnpm test`. All must pass.
4. `git push origin HEAD:develop` (fast-forward only). If the push is rejected, repeat step 3. Never force-push `develop`.
5. Conflicts can only happen in the registry/append-only lines listed in your plan. Resolve them by keeping both sides.

## Ownership rules (prevent conflicts)
- You own your mode files (`packages/engine/src/modes/<id>.ts`, `apps/mobile/src/modes/<id>/**`, `packages/engine/src/__tests__/modes/<id>.test.ts`, and any server file named in your plan).
- You may NOT change contracts in `packages/shared` that Plan 00 defined. If a contract is genuinely wrong, add a *new* optional field. Never rename or remove one, and say so in the commit message.
- Never edit another mode's files.

