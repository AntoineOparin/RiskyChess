# Plan 04: All-In Toss (double or nothing on a capture)

## Agent brief (meta prompt)
You are a **chess-variant rules designer** (fluent in FEN internals, castling and en-passant edge cases) and a **high-variance game designer** who understands spectacle moments. You never produce an illegal position. Every board you write is round-tripped through `new Chess(fen)` and covered by a test. List the edge cases before coding.

## Rules
- Instead of a pair, the mover may declare **All-In on a single capturing move** (`extras.allIn = true`, `moveB = null`).
- A fixed 50/50 coin (not affected by stakes or the market; still provably fair) decides:
  - **Win:** the capture plays **and** the mover gets a bonus turn (a normal pair turn). Exception: if the capture gives check, or ends the game, there is no bonus; the capture just plays.
  - **Lose:** no move is played, the capturing piece is **removed** from its square, and the turn passes.
- Limits: no king captures, once per piece type per player per game (`ALL_IN_USED`), and only on a turn with ≥ 2 legal moves.
- It is illegal if removing the piece would leave the mover's own king in check (`ALL_IN_INVALID`).

## Edge cases (each needs a test)
- Bonus ply FEN: side to move = mover, the en-passant square is cleared, the fullmove number is correct when the mover is black, and the halfmove clock is reset (it was a capture).
- Removal: if the removed piece is a rook on its home square, revoke that castling right. Check whether chess.js `remove()` does this; if not, patch it. The removal must not leave the opponent with no legal moves without `deriveOutcome` catching it (stalemate or insufficient material).
- A pinned capturer, en-passant All-In, a promotion capture with All-In (allowed, promotion keeps), a capture that mates (game over, no bonus), and repetition counting with bonus plies.

## Changes
- `packages/engine/src/modes/all-in.ts`:
  - `validate`: rules above, plus `modeState.allInsUsed`.
  - `adjustOdds`: force 5000 and ignore later modules. Mark this via an `exclusive: true` flag that the foundation pipeline respects. If the flag is missing, add it to `modes/types.ts` as an optional field; that is allowed as an additive change.
  - `apply`: win and lose FEN construction.
  - `effects`: `all_in` effect, plus capture income only on a win.
  - `botExtras`: All-In when captured value ≥ capturer value, the piece type is unused, and `rng.int(4) === 0`.
- Server: no changes beyond the pipeline. The bonus ply works because the turn comes from the FEN (foundation). Add a socket test showing that the same seat moves twice after a win.
- `apps/mobile/src/modes/all-in/`:
  - `Panel`: an **ALL IN** toggle shown only when slot A holds a legal capture with an unused piece type. Turning it on hides slot B and shows the risk line "Risk ♜ (5) → Win ♝ (3) + extra move".
  - `useMoveSelection` must accept a "single" submission when All-In is armed. Use the foundation's extras store; touch `useMoveSelection` only to allow `moveB = null` when `extras.allIn` is set.
  - `describeEffect` shows a large banner, "ALL IN — WON ♝ + bonus move" (green) or "ALL IN — LOST ♜" (red). Lost pieces fade out in `TossReveal` via opacity only.
- Tests: all edge cases above plus the limits.

## Shared files you may touch
`modes/registry.ts`, `modes/types.ts` (additive `exclusive?` only), `useMoveSelection.ts` (single-move allowance), and `TossReveal.tsx` (removed-piece fade).

