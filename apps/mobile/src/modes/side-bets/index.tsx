import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BET_CATALOG, BET_KINDS, BET_RULES, betPrice, type BetControl } from '@risky-chess/engine';
import { isSealed, type Color, type PropBet, type PropBetKind, type PropBetStatus } from '@risky-chess/shared';
import { haptics } from '../../lib/haptics';
import { CHIP, colors } from '../../lib/theme';
import type { ModeUi, TableCtx } from '../types';

export const BET_TITLES: Record<PropBetKind, string> = {
  opp_castles_by: 'Opponent castles by their move 10',
  opp_promotes: 'Opponent promotes a pawn',
  opp_toss_upset: 'Their underdog lands in their next 5 tosses',
  opp_all_in_bust: 'Opponent goes All-In and busts',
  game_length_under: 'Game ends before ply 60',
  game_length_over: 'Game lasts past ply 80',
};
const WON_LINE: Record<PropBetKind, string> = {
  opp_castles_by: 'Opponent castled',
  opp_promotes: 'Opponent promoted',
  opp_toss_upset: 'Their underdog landed',
  opp_all_in_bust: 'Opponent busted',
  game_length_under: 'Short game',
  game_length_over: 'Long game',
};
const CONTROL: Record<BetControl, { icon: string; label: string }> = {
  opponent: { icon: '👤', label: 'their choice' },
  chance: { icon: '🎲', label: 'chance' },
  mixed: { icon: '⚖︎', label: 'mixed, void rules' },
};
const STAKES = [5, 10, 25] as const;
const STATUS_COLOR: Record<PropBetStatus, string> = { open: colors.chip, won: colors.success, lost: colors.danger, void: colors.textMuted };
const mult = (x100: number) => `×${(x100 / 100).toFixed(x100 % 10 ? 2 : 1)}`;

const ownBets = (ctx: TableCtx, c: Color): PropBet[] => {
  const b = ctx.modeState.bets?.[c];
  return Array.isArray(b) ? b : [];
};
const windowOpen = (ctx: TableCtx) => !ctx.finished && ctx.turnNumber <= BET_RULES.WINDOW_LAST_TURN;

/** "🎟 Bet slip (2/3)" while betting is open; a one-line summary after. */
function Panel({ ctx }: { ctx: TableCtx }) {
  const [open, setOpen] = useState(false);
  const mine = ownBets(ctx, ctx.myColor);
  if (!windowOpen(ctx)) {
    return <Text style={styles.closed}>Betting closed{mine.length ? ` · ${mine.filter((b) => b.status === 'open').length} bet(s) riding` : ''}</Text>;
  }
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.slipButton} accessibilityRole="button" accessibilityLabel={`Bet slip, ${mine.length} of ${BET_RULES.MAX_BETS} bets placed`}>
        <Text style={styles.slipText}>
          🎟 Bet slip ({mine.length}/{BET_RULES.MAX_BETS})
        </Text>
        <Text style={styles.slipHint}>open until move {BET_RULES.WINDOW_LAST_TURN}</Text>
      </Pressable>
      <BetSlip visible={open} ctx={ctx} onClose={() => setOpen(false)} />
    </>
  );
}

function BetSlip({ visible, ctx, onClose }: { visible: boolean; ctx: TableCtx; onClose: () => void }) {
  const [stake, setStake] = useState<number>(STAKES[0]);
  const [pick, setPick] = useState<PropBetKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = ownBets(ctx, ctx.myColor);
  const chips = ctx.wallet?.[ctx.myColor] ?? 0;
  const offered = BET_KINDS.filter((k) => betPrice(ctx.rules, k));
  const full = mine.length >= BET_RULES.MAX_BETS;

  const place = async () => {
    if (!pick || !ctx.placeBet) return;
    setBusy(true);
    setError(null);
    const res = await ctx.placeBet({ kind: pick, stake });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    haptics.success();
    setPick(null);
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Sealed side bets</Text>
            <Text style={styles.muted}>
              {CHIP} {chips} · {mine.length}/{BET_RULES.MAX_BETS}
            </Text>
          </View>
          <Text style={styles.muted}>Your opponent sees how many bets you hold, never which.</Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listBody}>
            {offered.map((kind) => {
              const spec = BET_CATALOG[kind];
              const price = betPrice(ctx.rules, kind)!;
              const held = mine.some((b) => b.kind === kind);
              const selected = pick === kind;
              return (
                <Pressable
                  key={kind}
                  disabled={held || full}
                  onPress={() => setPick(kind)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: held || full }}
                  accessibilityLabel={`${BET_TITLES[kind]}, pays ${mult(price.payoutX100)}, decided by ${spec.control.map((c) => CONTROL[c].label).join(' and ')}${held ? ', already placed' : ''}`}
                  style={[styles.card, selected && styles.cardOn, (held || full) && styles.disabled]}
                >
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{BET_TITLES[kind]}</Text>
                    <Text style={styles.cardMeta}>
                      {spec.control.map((c) => CONTROL[c].icon).join(' ')} {spec.control.map((c) => CONTROL[c].label).join(' + ')}
                      {held ? ' · placed' : ''}
                    </Text>
                  </View>
                  <Text style={styles.mult}>{mult(price.payoutX100)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.stakeRow} accessibilityRole="radiogroup" accessibilityLabel="Stake">
            {STAKES.map((v) => (
              <Pressable
                key={v}
                onPress={() => setStake(v)}
                disabled={v > chips}
                accessibilityRole="radio"
                accessibilityState={{ selected: stake === v, disabled: v > chips }}
                style={[styles.stake, stake === v && styles.stakeOn, v > chips && styles.disabled]}
              >
                <Text style={styles.stakeText}>
                  {v} {CHIP}
                </Text>
              </Pressable>
            ))}
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
            <Pressable
              onPress={() => void place()}
              disabled={!pick || busy || stake > chips || full}
              style={[styles.place, (!pick || busy || stake > chips || full) && styles.disabled]}
              accessibilityRole="button"
            >
              <Text style={styles.placeText}>
                {pick ? `Place ${stake} ${CHIP} → ${Math.floor((stake * betPrice(ctx.rules, pick)!.payoutX100) / 100)} ${CHIP}` : 'Pick a bet'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Your bets as status dots; the opponent's as a sealed count until they are revealed. */
function PlayerAccessory({ ctx, color }: { ctx: TableCtx; color: Color }) {
  const raw = ctx.modeState.bets?.[color];
  if (!raw) return null;
  if (isSealed(raw)) {
    return raw.count ? (
      <Text style={styles.acc} accessibilityLabel={`${raw.count} sealed bets`}>
        🎟×{raw.count}
      </Text>
    ) : null;
  }
  if (!raw.length) return null;
  return (
    <View style={styles.accRow} accessibilityLabel={raw.map((b) => `${BET_TITLES[b.kind]}: ${b.status}`).join('; ')}>
      <Text style={styles.acc}>🎟</Text>
      {raw.map((b) => (
        <View key={b.id} style={[styles.dot, { backgroundColor: STATUS_COLOR[b.status] }]} />
      ))}
    </View>
  );
}

/** Game over: every bet, both sides, revealed. */
function GameOverCard({ ctx }: { ctx: TableCtx }) {
  const sides = (['w', 'b'] as const).map((c) => [c, ownBets(ctx, c)] as const).filter(([, b]) => b.length);
  if (!sides.length) return null;
  return (
    <View style={styles.ledger}>
      <Text style={styles.ledgerTitle}>Bet ledger</Text>
      {sides.map(([c, bets]) => (
        <View key={c} style={styles.ledgerSide}>
          <Text style={styles.ledgerWho}>{c === ctx.myColor ? 'You' : 'Opponent'}</Text>
          {bets.map((b) => {
            const back = b.status === 'won' ? Math.floor((b.stake * b.payoutX100) / 100) : b.status === 'void' ? b.stake : 0;
            return (
              <View key={b.id} style={styles.ledgerRow}>
                <Text style={styles.ledgerBet} numberOfLines={1}>
                  {BET_TITLES[b.kind]}
                </Text>
                <Text style={[styles.ledgerResult, { color: STATUS_COLOR[b.status] }]}>
                  {b.stake}
                  {CHIP} {mult(b.payoutX100)} · {b.status === 'open' ? 'open' : `${b.status} ${back ? `+${back}` : ''}`}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export const sideBetsUi: ModeUi = {
  title: 'Side Bets',
  pitch: 'Sealed prop bets on your opponent and on chance.',
  risk: 1,
  bullets: [
    'In the first moves, place up to 3 sealed bets of 5–25 ◎.',
    'Bet only on what you can’t force: their castling, promotions, upsets, game length.',
    'Your opponent sees how many bets you hold, never which.',
  ],
  Panel,
  PlayerAccessory,
  GameOverCard,
  describeEffect(e, me, _turn, modeState) {
    if (e.kind !== 'bet_settled') return null;
    if (e.color !== me) {
      if (e.result === 'won') return { text: `🎟 Opponent’s bet won +${e.payout} ${CHIP}`, tone: 'bad' };
      return { text: `🎟 Opponent’s bet ${e.result === 'lost' ? 'lost' : 'void'}`, tone: e.result === 'lost' ? 'good' : 'neutral' };
    }
    const mine = modeState?.bets?.[me];
    const kind = Array.isArray(mine) ? mine.find((b) => b.id === e.betId)?.kind : undefined;
    if (e.result === 'won') return { text: `🎟 ${kind ? WON_LINE[kind] : 'Bet won'} — +${e.payout} ${CHIP}`, tone: 'big_good' };
    if (e.result === 'void') return { text: `🎟 Void${kind ? `: ${BET_TITLES[kind]}` : ''} — +${e.payout} ${CHIP} back`, tone: 'neutral' };
    return { text: `🎟 Lost${kind ? `: ${BET_TITLES[kind]}` : ''}`, tone: 'bad' };
  },
};

const styles = StyleSheet.create({
  closed: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  slipButton: { minHeight: 44, borderRadius: 10, borderWidth: 1.5, borderColor: colors.chip, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  slipText: { color: colors.chip, fontWeight: '800' },
  slipHint: { color: colors.textMuted, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, gap: 10, maxHeight: '88%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: colors.text, fontWeight: '800', fontSize: 18 },
  muted: { color: colors.textMuted, fontSize: 13 },
  list: { flexGrow: 0 },
  listBody: { gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 2, borderColor: 'transparent' },
  cardOn: { borderColor: colors.chip },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { color: colors.text, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 12 },
  mult: { color: colors.chip, fontWeight: '900', fontSize: 18, fontVariant: ['tabular-nums'] },
  stakeRow: { flexDirection: 'row', gap: 8 },
  stake: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stakeOn: { borderColor: colors.chip, backgroundColor: '#3A3320' },
  stakeText: { color: colors.text, fontWeight: '800' },
  error: { color: colors.danger },
  actions: { flexDirection: 'row', gap: 10 },
  cancel: { minHeight: 52, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center', backgroundColor: colors.surface },
  cancelText: { color: colors.text, fontWeight: '700' },
  place: { flex: 1, minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.chip },
  placeText: { color: '#111', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.35 },
  acc: { color: colors.chip, fontWeight: '700', fontSize: 12 },
  accRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ledger: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 8 },
  ledgerTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  ledgerSide: { gap: 4 },
  ledgerWho: { color: colors.textMuted, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
  ledgerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  ledgerBet: { color: colors.text, flex: 1, fontSize: 13 },
  ledgerResult: { fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'] },
});
