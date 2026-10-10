import type { ComponentType } from 'react';
import type { Color, GameRules, ModeState, MoveSlot, Odds, ResolvedMove, TurnEffect, TurnExtras, TurnResult } from '@risky-chess/shared';

/** Everything a mode's UI may read about the table, from the viewer's side. */
export interface TableCtx {
  /** The position being decided (the start of the turn while a reveal runs). */
  fen: string;
  myColor: Color;
  rules: GameRules;
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
  /** Extra text on a slot chip. */
  SlotBadge?: ComponentType<{ ctx: TableCtx; slot: MoveSlot }>;
  /**
   * Toast text for an effect this mode owns; null to leave it to others.
   * `turn` is the turn it came from, if any; `modeState` is the view after it.
   */
  describeEffect?: (effect: TurnEffect, myColor: Color, turn?: TurnResult, modeState?: ModeState) => EffectLine | null;
  /** Small additions to a player's bar. */
  PlayerAccessory?: ComponentType<{ ctx: TableCtx; color: Color }>;
  /** A card on the game-over screen. */
  GameOverCard?: ComponentType<{ ctx: TableCtx }>;
}
