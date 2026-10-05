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
- Tosses use `crypto.randomInt` on the server only.

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
