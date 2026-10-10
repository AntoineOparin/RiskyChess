import { Component, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { ModeId } from '@risky-chess/shared';
import { errorFields, logger } from '../lib/log';
import type { TableCtx } from '../modes/types';
import { colors } from '../lib/theme';

const log = logger('mode-ui');

interface Props {
  mode: ModeId;
  /** Which part of the mode's UI this wraps, for the log. */
  part: 'Panel' | 'SlotBadge' | 'PlayerAccessory' | 'GameOverCard';
  ctx: TableCtx;
  children: ReactNode;
}

/** A compact snapshot of the table, enough to reproduce a mode UI failure. */
export const ctxSummary = (ctx: TableCtx) => ({
  fen: ctx.fen,
  myColor: ctx.myColor,
  turnNumber: ctx.turnNumber,
  rules: ctx.rules.modes.join('+') || 'classic',
  slots: { A: ctx.slots.A?.lan ?? null, B: ctx.slots.B?.lan ?? null },
  extras: ctx.extras,
  odds: ctx.odds,
  canAct: ctx.canAct,
  online: ctx.online,
});

/**
 * Keeps one mode's UI failure from taking down the game screen: logs the
 * error with the table it happened on and renders a small notice instead.
 * Resets when the position changes.
 */
export class ModeBoundary extends Component<Props, { failedAt: string | null }> {
  override state = { failedAt: null as string | null };

  static getDerivedStateFromError(): Partial<{ failedAt: string | null }> {
    return { failedAt: '' };
  }

  override componentDidCatch(error: unknown) {
    log.error(`${this.props.mode}.${this.props.part} crashed`, { ...errorFields(error), table: ctxSummary(this.props.ctx) });
    this.setState({ failedAt: this.props.ctx.fen });
  }

  override componentDidUpdate(prev: Props) {
    if (this.state.failedAt !== null && prev.ctx.fen !== this.props.ctx.fen) this.setState({ failedAt: null });
  }

  override render() {
    if (this.state.failedAt === null) return this.props.children;
    return this.props.part === 'Panel' ? <Text style={styles.notice}>This mode’s controls hit an error (logged).</Text> : null;
  }
}

const styles = StyleSheet.create({
  notice: { color: colors.danger, fontSize: 12, textAlign: 'center' },
});
