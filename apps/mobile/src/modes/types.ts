import type { ComponentType } from 'react';
import type {
  Color,
  GameRules,
  ModeState,
  MoveSlot,
  Odds,
  PropBetKind,
  ResolvedMove,
  TurnEffect,
  TurnExtras,
  TurnResult,
  Wallet,
} from '@risky-chess/shared';

export type BetRequest = { kind: PropBetKind; params?: Record<string, number>; stake: number };
export type BetOutcome = { ok: true } | { ok: false; message: string };

/** Everything a mode's UI may read about the table, from the viewer's side. */
export interface TableCtx {
  /** The position being decided (the start of the turn while a reveal runs). */
  fen: string;
  myColor: Color;
  rules: GameRules;
  /** As currently displayed (reveals not yet shown are not counted). */
  wallet?: Wallet;
  /** The viewer's view: the opponent's bets are sealed until game over. */
  modeState: ModeState;
  history: readonly TurnResult[];
  turnNumber: number;
  /** True when the viewer may build and submit a turn right now. */
  canAct: boolean;
  slots: Record<MoveSlot, ResolvedMove | null>;
  /** Pending extras for the viewer's next submission. */
  extras: TurnExtras;
  setExtras(patch: Partial<TurnExtras>): void;
  /** The line the current slots and extras would be tossed at; null until it is computable. */
  odds: Odds | null;
  /** Online: true. Offline games still run every mode against the local engine. */
  online: boolean;
  finished: boolean;
  placeBet?: (req: BetRequest) => Promise<BetOutcome>;
}

export type EffectTone = 'good' | 'bad' | 'neutral' | 'big_good' | 'big_bad';
export interface EffectLine {
  text: string;
  tone: EffectTone;
}

export interface ModeUi {
  title: string;
  /** One line, shown on the picker card. */
  pitch: string;
  /** 1–3 ◆ on the picker. */
  risk: 1 | 2 | 3;
  /** Exactly three "How it plays" bullets. */
  bullets: [string, string, string];
  /** Compact control (≤ 56 px) in the panel zone above the slot bar. */
  Panel?: ComponentType<{ ctx: TableCtx }>;
  /** Extra text on a slot chip (odds, payout). */
  SlotBadge?: ComponentType<{ ctx: TableCtx; slot: MoveSlot }>;
  /** Toast text for an effect this mode owns; null to stay silent. `turn` is the turn it came from, if any. */
  describeEffect?: (effect: TurnEffect, myColor: Color, turn?: TurnResult) => EffectLine | null;
  /** Small additions to a player's bar (e.g. sealed bets). */
  PlayerAccessory?: ComponentType<{ ctx: TableCtx; color: Color }>;
  /** A card on the game-over screen (e.g. the bet ledger). */
  GameOverCard?: ComponentType<{ ctx: TableCtx }>;
}
