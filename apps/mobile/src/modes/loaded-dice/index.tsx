import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isForcedTurn, LOADED_DICE_TIERS } from '@risky-chess/engine';
import { hasMode, type MoveSlot } from '@risky-chess/shared';
import { pct } from '../../components/OddsBadge';
import { signed } from '../../lib/format';
import { CHIP, colors, slotColor } from '../../lib/theme';
import { previewWith } from '../preview';
import type { ModeUi, TableCtx } from '../types';

/** Which way a turn's stake leaned, read from its odds breakdown. */
function leanOf(steps: { source: string; A: number }[] | undefined): MoveSlot | null {
  if (!steps) return null;
  const i = steps.findIndex((s) => s.source === 'loaded_dice');
  if (i < 1) return null;
  return steps[i]!.A > steps[i - 1]!.A ? 'A' : 'B';
}

/** Favor [A] [—] [B], then a stake tier; each tier previews the odds it would buy. */
function Panel({ ctx }: { ctx: TableCtx }) {
  const forced = useMemo(() => isForcedTurn(ctx.fen), [ctx.fen]);
  if (!ctx.canAct || forced || ctx.extras.allIn) return null;
  const favor = ctx.extras.favor ?? null;
  const stake = ctx.extras.stake ?? 0;
  const chips = ctx.wallet?.[ctx.myColor] ?? 0;
  const setFavor = (f: MoveSlot | null) => ctx.setExtras(f ? { favor: f } : { favor: undefined, stake: undefined });

  return (
    <View style={styles.row}>
      <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Load the coin toward">
        {(['A', null, 'B'] as const).map((f) => {
          const on = favor === f;
          return (
            <Pressable
              key={f ?? 'none'}
              onPress={() => setFavor(f)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={f ? `Favor ${f}` : 'No load'}
              style={[styles.seg, on && { backgroundColor: f ? slotColor(f) : colors.surfaceRaised }]}
            >
              <Text style={[styles.segText, on && f && styles.segTextOn]}>{f ?? '—'}</Text>
            </Pressable>
          );
        })}
      </View>
      {LOADED_DICE_TIERS.map(({ stake: tier }) => {
        const disabled = !favor || tier > chips;
        const on = favor !== null && stake === tier;
        const odds = favor ? previewWith(ctx, { ...ctx.extras, favor, stake: tier || undefined }) : null;
        return (
          <Pressable
            key={tier}
            disabled={disabled}
            onPress={() => ctx.setExtras({ stake: tier || undefined })}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled }}
            accessibilityLabel={`Stake ${tier} chips${odds && favor ? `, ${favor} at ${pct(odds, favor)}` : ''}${tier > chips ? ', not enough chips' : ''}`}
            style={[styles.pill, on && styles.pillOn, disabled && styles.disabled]}
          >
            <Text style={styles.pillStake}>
              {tier}
              {CHIP}
            </Text>
            {odds && favor ? <Text style={styles.pillOdds}>{pct(odds, favor)}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Final odds on each chip, unless the Odds Market badge already shows them. */
function SlotBadge({ ctx, slot }: { ctx: TableCtx; slot: MoveSlot }) {
  if (hasMode(ctx.rules, 'odds_market') || !ctx.odds || ctx.odds.A === 5000) return null;
  return <Text style={[styles.badge, ctx.extras.favor === slot && styles.badgeFavored]}>{pct(ctx.odds, slot)}</Text>;
}

export const loadedDiceUi: ModeUi = {
  title: 'Loaded Dice',
  pitch: 'Pay chips to tilt the coin toward the move you want.',
  risk: 2,
  bullets: [
    'Favor slot A or B and stake 4, 10 or 20 ◎ for +10, +20 or +30 points.',
    'The stake is paid whatever the coin does. Odds never pass 90%.',
    'Captures earn chips (the captured piece’s value), so stay aggressive.',
  ],
  Panel,
  SlotBadge,
  describeEffect(e, me, turn) {
    if (e.kind !== 'chips' || e.reason !== 'stake') return null;
    const lean = leanOf(turn?.effects.find((x) => x.kind === 'odds_breakdown')?.steps);
    const text = `${signed(e.delta)} ${CHIP} loaded${lean ? ` toward ${lean}` : ''}`;
    return e.color === me ? { text, tone: 'neutral' } : { text: `Opponent ${text}`, tone: 'neutral' };
  },
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segment: { flexDirection: 'row', borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, overflow: 'hidden' },
  seg: { minWidth: 34, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  segText: { color: colors.text, fontWeight: '800' },
  segTextOn: { color: '#111' },
  pill: { flex: 1, minHeight: 44, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pillOn: { borderColor: colors.chip, backgroundColor: '#3A3320' },
  pillStake: { color: colors.chip, fontWeight: '800', fontSize: 13 },
  pillOdds: { color: colors.text, fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.35 },
  badge: { color: colors.textMuted, fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'] },
  badgeFavored: { color: colors.text, fontWeight: '900' },
});
