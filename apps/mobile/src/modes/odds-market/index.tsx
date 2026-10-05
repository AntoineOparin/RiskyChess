import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { tryMarketLine, type MarketLine } from '@risky-chess/engine';
import { logger } from '../../lib/log';
import type { MoveSlot } from '@risky-chess/shared';
import { pct } from '../../components/OddsBadge';
import { signed } from '../../lib/format';
import { CHIP, colors } from '../../lib/theme';
import type { ModeUi, TableCtx } from '../types';

const log = logger('odds-market');

/** The house line for the pair in the slots; null until both are filled (or on an All-In). */
function useLine(ctx: TableCtx): MarketLine | null {
  const { A, B } = ctx.slots;
  return useMemo(() => {
    if (!A || !B || ctx.extras.allIn) return null;
    const line = tryMarketLine(ctx.fen, A, B);
    // Slots are keyed to their position, so this should never happen; if it does, say where.
    if (!line) log.warn('slots are not legal in the displayed position', { fen: ctx.fen, A: A.lan, B: B.lan, turnNumber: ctx.turnNumber });
    return line;
  }, [ctx.fen, A, B, ctx.extras.allIn, ctx.turnNumber]);
}

/** "House leans 12% against exd5", in one line. */
function Panel({ ctx }: { ctx: TableCtx }) {
  const line = useLine(ctx);
  if (!ctx.canAct || !line) return null;
  if (!line.stronger) return <Text style={styles.panel}>Even pair: the house keeps it at 50/50.</Text>;
  const strong = ctx.slots[line.stronger]!;
  return (
    <Text style={styles.panel}>
      House leans {line.edge / 100}% against <Text style={styles.em}>{strong.san}</Text>. Beat the line: +{line.payout} {CHIP}
    </Text>
  );
}

/** Final odds on each chip; the stronger move also shows what beating the line pays. */
function SlotBadge({ ctx, slot }: { ctx: TableCtx; slot: MoveSlot }) {
  const line = useLine(ctx);
  if (!line) return null;
  const odds = ctx.odds ?? line.odds;
  const text = line.stronger === slot ? `${pct(odds, slot)} · pays ${line.payout}${CHIP}` : pct(odds, slot);
  return <Text style={[styles.badge, ctx.extras.favor === slot && styles.favored]}>{text}</Text>;
}

export const oddsMarketUi: ModeUi = {
  title: 'Odds Market',
  pitch: 'The house leans against your stronger move. Beat the line, get paid.',
  risk: 2,
  bullets: [
    'Pair a great move with junk and the coin leans toward the junk (up to 35/65).',
    'Two moves of similar strength stay close to 50/50.',
    'If your stronger move plays anyway, you collect chips.',
  ],
  Panel,
  SlotBadge,
  describeEffect(e, me) {
    if (e.kind !== 'chips' || e.reason !== 'market_payout') return null;
    const text = `${signed(e.delta)} ${CHIP} beat the line`;
    return e.color === me ? { text, tone: 'good' } : { text: `Opponent ${text}`, tone: 'neutral' };
  },
};

const styles = StyleSheet.create({
  panel: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  em: { color: colors.text, fontWeight: '800' },
  badge: { color: colors.textMuted, fontWeight: '700', fontSize: 12, fontVariant: ['tabular-nums'] },
  favored: { color: colors.text, fontWeight: '900' },
});
