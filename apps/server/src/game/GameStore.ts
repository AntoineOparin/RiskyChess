import type { Ack, Color, GameSession, PropBet } from '@risky-chess/shared';

/** Server-side record; only `session` is ever sent to clients. */
export interface GameRecord {
  session: GameSession;
  tokens: Partial<Record<Color, string>>;
  /** Socket currently bound to each seat, so a stale socket's disconnect is ignored. */
  connections: Partial<Record<Color, string>>;
  /** When each disconnected seat forfeits (pvp only). */
  graceDeadlines: Partial<Record<Color, number>>;
  /** clientSubmissionId → ack already returned, for idempotent retries. */
  submissions: Map<string, Ack<{ accepted: true }>>;
  /**
   * Provably Fair: turnNumber → secret server seed (hex), committed at turn
   * start. Never sent until the turn resolves, never logged, deleted once revealed.
   */
  turnSeeds: Map<number, string>;
  /** `${color}:${clientBetId}` → ack already returned, so a retried placement never debits twice. */
  betAcks: Map<string, Ack<{ bet: PropBet }>>;
}

export interface GameStore {
  get(id: string): GameRecord | undefined;
  set(record: GameRecord): void;
  delete(id: string): void;
  values(): Iterable<GameRecord>;
}

export class InMemoryGameStore implements GameStore {
  private readonly games = new Map<string, GameRecord>();
  get(id: string) {
    return this.games.get(id);
  }
  set(record: GameRecord) {
    this.games.set(record.session.id, record);
  }
  delete(id: string) {
    this.games.delete(id);
  }
  values() {
    return this.games.values();
  }
}
