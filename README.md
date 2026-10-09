# Risky Chess

Chess where the side to move submits **two** legal moves and the server flips a fair coin to decide which one is played.

## Tech stack

- **Monorepo:** pnpm workspaces, TypeScript
- **Backend:** Node.js, Express 5, Socket.io (authoritative game server)
- **Frontend:** Expo (React Native + expo-router), Zustand
- **Rules:** custom variant engine on top of `chess.js`, shared by server and app
- **Tests:** Vitest

## Layout

| Package | What it is |
|---|---|
| `packages/shared` | Types, socket event contracts, zod payload schemas, constants |
| `packages/engine` | The variant rules on top of `chess.js` (validation, resolution, end conditions, bot). Used by both server and app |
| `apps/server` | Express + Socket.io authoritative game server |
| `apps/mobile` | Expo (expo-router) app: offline bot mode + online play |

## Rules

- Each turn, the player to move picks two different legal moves (Move A and Move B).
- Both candidate moves are validated against the **same start-of-turn position**. They are alternatives, not a sequence, so Move A giving check never affects Move B.
- Moves are distinct by long algebraic notation, so `e7e8q` and `e7e8n` are different moves.
- If exactly one legal move exists, it is played without a toss (`forced: true`).
- Mate, stalemate and draws are evaluated after the executed move. Repetition counts only executed positions.
- A disconnected player has 60 s to rejoin before forfeiting. A turn submitted before the drop still resolves. Bot games never forfeit on disconnect.
- Online tosses are provably fair (commit-reveal): the server commits to `sha256(serverSeed)` before the turn, the mover adds a client seed, and the roll is `HMAC-SHA256(serverSeed, "gameId:turn:clientSeed")` mapped uniformly to 0–9999. The app re-verifies every toss (see the Fairness screen). Offline games use a local, unverifiable coin.

## Game modes

Pick a table on **New game**. Modes combine freely; **High Roller** turns all four on. With any mode on, both players start with 100 ◎ (play money, no real-money wagering) and earn the captured piece's value on every capture.

| Mode | In two sentences |
|---|---|
| **Loaded Dice** | Favor slot A or B and stake 4 / 10 / 20 ◎ to move the coin +10 / +20 / +30 points toward it. The stake is paid whatever happens, and no line ever goes past 90/10. |
| **Odds Market** | The house leans up to 15 points against the stronger move of your pair (by the one-ply heuristic), so best-move-plus-junk sits near 35/65. If the stronger move plays anyway, you're paid edge/100 ◎. |
| **All-In** | Declare one capture on a fair 50/50 coin instead of a pair. Win: it plays and you move again (unless it checks or ends the game); lose: your capturing piece is removed. Once per piece type, never the king. |
| **Side Bets** | Up to 3 sealed bets of 5–25 ◎ during the first 4 plies, only on things you can't force (the opponent's castling, promotions, upsets and All-In busts; game length, with void rules). Your opponent sees only how many you hold until game over. |

Composition order for the line: base 50/50 → Odds Market → Loaded Dice stakes → clamp to [10%, 90%]. The side to move is always derived from the position (so an All-In bonus ply keeps the same seat to move).

Balance scripts (engine package): `pnpm --filter @risky-chess/engine sim:dice`, `sim:market`, and `price:bets` (regenerates `packages/shared/src/betOdds.ts`).

## Getting started

### Prerequisites

- Node.js (a recent LTS)
- pnpm, pinned via `packageManager`. If `pnpm` isn't on your PATH, run `corepack enable` or prefix commands with `corepack`.
- For the app: [Expo Go](https://expo.dev/go) on your phone, or an iOS simulator / Android emulator.

### Install and run

```sh
git clone git@github.com:AntoineOparin/RiskyChess.git
cd RiskyChess
pnpm install

pnpm dev:server    # http://localhost:3001
pnpm dev:mobile    # Expo dev server; open in Expo Go or a simulator
pnpm --filter @risky-chess/mobile exec expo start --web   # same app in the browser
```

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev:server` | Start the game server with hot reload (`tsx watch`) |
| `pnpm dev:mobile` | Start the Expo dev server |
| `pnpm test` | Run engine + server tests |
| `pnpm typecheck` | Type-check every package |

## Configuration

Copy the example env files if you need to change defaults:

```sh
cp apps/server/.env.example apps/server/.env
cp apps/mobile/.env.example apps/mobile/.env
```

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `PORT` | server | `3001` | Port the HTTP + Socket.io server listens on |
| `EXPO_PUBLIC_SERVER_URL` | mobile | `http://<metro host>:3001` | Game server URL used by the app |

The default server URL works for simulators and for physical devices on the same Wi-Fi as your dev machine.

## Native builds

The `ios/` and `android/` folders are generated (`npx expo prebuild`) and are not committed. Use EAS (`npx eas-cli@latest build`) for cloud builds.
