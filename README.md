# Risky Chess

A chess casino. The game is **Risky Chess**: the side to move submits **two** legal moves and a provably-fair coin decides which one is played. Around it sits a Stake-style platform: accounts with a play-money balance, buy-in tables, a lobby, a sportsbook for spectators, quick solo "Originals", a wallet, history and a leaderboard. Mobile (Expo) and web.

**Everything is play money.** ◎ chips have no real-world value; top-ups are mocked and nothing is ever charged.

## Tech stack

- **Monorepo:** pnpm workspaces, TypeScript
- **Backend:** Node.js 24, Express 5, Socket.io, SQLite via the built-in `node:sqlite` (no native deps)
- **Frontend:** Expo (React Native + expo-router), Zustand; runs on iOS, Android and the web
- **Rules:** custom variant engine on top of `chess.js`, shared by server and app
- **Tests:** Vitest

## Layout

| Package | What it is |
|---|---|
| `packages/shared` | Types, socket event contracts, zod payload schemas, constants, money helpers, the puzzle set |
| `packages/engine` | The variant rules, mode pipeline, settlement, sportsbook pricing, originals maths and provable-fairness primitives |
| `apps/server` | Authoritative game server: accounts, ledger, tables, lobby, sportsbook, originals |
| `apps/mobile` | Expo app: casino lobby, tables, watching, originals, wallet, profile |

## The platform

### Accounts and money
- Pick a username on first launch; the device gets a token (keychain on native, localStorage on web). No password. Signing out forgets the account.
- Every account starts with ◎ 1,000.00. The wallet has mock **top-up** and **withdraw** buttons; nothing real happens.
- Every balance change is one row in a server-side **ledger**: idempotent, never negative, with the balance after each entry. The house is an account too, so the sum of all balances only changes on top-ups and withdrawals.

### Tables (player vs player, for stakes)
- Host a table: pick the modes, a **buy-in** (free, ◎ 10, 50, 250 or 1,000) and whether it's listed in the lobby. The buy-in is held in escrow until the game ends.
- Both seats play with the usual 100 table chips; each chip is worth buy-in ÷ 100.
- **Decisive result:** the winner takes the pot minus a 5% rake. **Draw:** the pot is split pro-rata by final chip stacks. Resigning, abandoning or timing out counts as a loss.
- Cancel an unjoined table and the buy-in comes back. Tables nobody joins for 10 minutes are cancelled and refunded. Buy-ins held by games that die with the server are refunded at the next boot.
- **Bot games are free practice** (online and offline). The house never takes a side on the board.

### Sportsbook (spectators)
- Every public table in progress is a market: White / Draw / Black, priced from material and side to move with a 6% overround, re-priced after every toss.
- Watch the board live, place a bet at the odds shown (the server refuses if the line moved), see your open bets settle the moment the game ends.

### Originals (solo vs the house, provably fair)
- **Coin Duel:** the house deals a middlegame and its two best moves; back one and the committed coin decides. The line leans against the stronger move exactly as Odds Market does, so the better move pays more. 3% house edge.
- **Blitz Puzzle:** stake, get a mate-in-1 (15 s, 1.5×) or mate-in-2 (30 s, 3×) picked by the roll, find the key move before the clock runs out.
- Fairness is Stake-style: each account has a server seed (hash shown), a client seed you can change and a nonce. Round *n* rolls `HMAC-SHA256(serverSeed, "clientSeed:n")`. Rotate the pair to reveal the old server seed and the app re-derives every round on the device.

### Also
- **Lobby:** open tables, live markets, a feed of settled wins and losses.
- **Profile:** record, lifetime net, leaderboard, full history of games, bets and rounds.

## The game

- Each turn, the player to move picks two different legal moves (Move A and Move B); both are validated against the same start-of-turn position.
- If exactly one legal move exists it is played without a toss. Mate, stalemate and draws are evaluated after the executed move.
- A disconnected player has 60 s to rejoin before forfeiting.
- Online tosses are provably fair (commit-reveal): the server commits to `sha256(serverSeed)` before the turn, the mover adds a client seed, and the roll is `HMAC-SHA256(serverSeed, "gameId:turn:clientSeed")` mapped uniformly to 0–9999. The app re-verifies every toss.

### Modes
Modes combine freely; **High Roller** turns all four on. With any mode on, both seats start with 100 table chips and earn the captured piece's value on every capture.

| Mode | In two sentences |
|---|---|
| **Loaded Dice** | Favor slot A or B and stake 4 / 10 / 20 chips to move the coin +10 / +20 / +30 points toward it. The stake is paid whatever happens, and no line ever goes past 90/10. |
| **Odds Market** | The house leans up to 15 points against the stronger move of your pair, so best-move-plus-junk sits near 35/65. If the stronger move plays anyway, you're paid edge/100 chips. |
| **All-In** | Declare one capture on a fair 50/50 coin instead of a pair. Win: it plays and you move again; lose: your capturing piece is removed. Once per piece type, never the king. |
| **Side Bets** | Up to 3 sealed bets of 5–25 chips during the first 4 plies, only on things you can't force. Your opponent sees only how many you hold until game over. |

## Getting started

### Prerequisites
- Node.js 24 (for `node:sqlite`)
- pnpm, pinned via `packageManager` (`corepack enable` if it isn't on your PATH)
- For the app: a browser, [Expo Go](https://expo.dev/go) on your phone, or a simulator / emulator

### Install and run

```sh
pnpm install

pnpm dev:server    # http://localhost:3001, database in apps/server/data/
pnpm dev:mobile    # Expo dev server: press w for the web, or open in Expo Go
```

To try the whole thing alone on one machine, open the web app on three origins so each gets its own account: `http://localhost:8081`, `http://127.0.0.1:8081` and `http://[::1]:8081`. Host a table on one, join from the second, watch and bet from the third.

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev:server` | Start the server with hot reload |
| `pnpm dev:mobile` | Start the Expo dev server (`--web` for the browser) |
| `pnpm test` | Cycle check + engine and server tests |
| `pnpm typecheck` | Type-check every package |
| `pnpm --filter @risky-chess/engine gen:puzzles` | Regenerate the puzzle set |
| `pnpm --filter @risky-chess/engine sim:dice` / `sim:market` / `price:bets` | Mode balance scripts |

## Configuration

```sh
cp apps/server/.env.example apps/server/.env   # PORT, DB_PATH, LOG_LEVEL
cp apps/mobile/.env.example apps/mobile/.env   # EXPO_PUBLIC_SERVER_URL
```

Plans for each stage live in `docs/plans/`.
