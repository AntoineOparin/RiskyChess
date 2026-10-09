import { priceMatch } from '@risky-chess/engine';
import type { LiveMarket, LobbySnapshot, MatchLine, OpenTable } from '@risky-chess/shared';
import type { GameManager } from '../game/GameManager';
import type { GameRecord } from '../game/GameStore';
import type { Services } from '../platform';

/** How the lobby reaches clients; app.ts binds it to socket rooms. */
export interface LobbyTransport {
  lobby(snapshot: LobbySnapshot): void;
  market(gameId: string, p: { gameId: string; line: MatchLine; handleCents: number }): void;
  online(): number;
}

/** One lobby_update at most this often, however many games change. */
const THROTTLE_MS = 250;

const IN_PROGRESS = new Set(['awaiting_submission', 'paused_disconnect']);

/** A public pvp game other accounts may watch and bet on. */
export const isLive = (r: GameRecord): boolean => r.session.mode === 'pvp' && r.session.visibility === 'public' && IN_PROGRESS.has(r.session.status);

/** The sportsbook line for a game as it stands now. */
export const lineFor = (r: GameRecord): MatchLine => priceMatch(r.session.fen, r.session.history.length, r.session.turnNumber);

/**
 * What the home and sportsbook tabs show: open public tables, live markets
 * and the wager feed. Rebuilt from the game store on demand and pushed to
 * the lobby room, throttled, whenever a game changes.
 */
export class Lobby {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly manager: GameManager,
    private readonly services: Services,
    private readonly transport: LobbyTransport,
  ) {}

  snapshot(): LobbySnapshot {
    const tables: OpenTable[] = [];
    const markets: LiveMarket[] = [];
    for (const r of this.manager.records()) {
      const s = r.session;
      if (s.mode !== 'pvp' || s.visibility !== 'public') continue;
      const host = s.players[s.host];
      if (s.status === 'waiting_for_opponent' && host) {
        tables.push({ gameId: s.id, host: { userId: host.userId ?? '', username: host.displayName, color: s.host }, rules: s.rules, buyInCents: s.buyInCents, createdAt: s.createdAt });
      } else {
        const m = this.market(r);
        if (m) markets.push(m);
      }
    }
    tables.sort((a, b) => b.createdAt - a.createdAt);
    markets.sort((a, b) => b.handleCents - a.handleCents || b.buyInCents - a.buyInCents);
    return { tables, markets, feed: this.services.archive.feed(30), online: this.transport.online() };
  }

  market(r: GameRecord): LiveMarket | null {
    if (!isLive(r)) return null;
    const s = r.session;
    const w = s.players.w;
    const b = s.players.b;
    if (!w || !b) return null;
    return {
      gameId: s.id,
      players: { w: { userId: w.userId ?? '', username: w.displayName }, b: { userId: b.userId ?? '', username: b.displayName } },
      rules: s.rules,
      buyInCents: s.buyInCents,
      turnNumber: s.turnNumber,
      fen: s.fen,
      line: lineFor(r),
      handleCents: this.services.bets.handle(s.id),
    };
  }

  /** Something changed: push a fresh snapshot soon, coalescing bursts. */
  markDirty(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), THROTTLE_MS);
    this.timer.unref?.();
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.transport.lobby(this.snapshot());
  }

  /** A turn resolved: the line on that game moved. */
  turn(r: GameRecord): void {
    if (isLive(r)) this.transport.market(r.session.id, { gameId: r.session.id, line: lineFor(r), handleCents: this.services.bets.handle(r.session.id) });
    this.markDirty();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
