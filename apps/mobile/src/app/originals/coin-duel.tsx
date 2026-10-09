import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { ORIGINALS, formatCents, type CoinDuelDeal, type CoinDuelResult, type MoveSlot, type TurnResult } from '@risky-chess/shared';
import { Board } from '../../components/Board/Board';
import { BoardOverlay } from '../../components/Board/BoardOverlay';
import { TossReveal } from '../../components/Board/TossReveal';
import { BalancePill, Banner, Button, EmptyState, Money, Screen, StakeInput } from '../../components/ui';
import { useNow } from '../../hooks/useNow';
import { haptics } from '../../lib/haptics';
import { playSfx } from '../../lib/sfx';
import { colors, slotColor, type as t } from '../../lib/theme';
import { request } from '../../net/socket';
import { useOnline } from '../../net/useOnline';
import { useWalletStore } from '../../state/walletStore';

const pct = (bps: number) => `${Math.round(bps / 100)}%`;

/** The reveal animation expects a resolved turn; a Coin Duel round is one, as far as the board is concerned. */
function asTurn(deal: CoinDuelDeal, r: CoinDuelResult): TurnResult {
  return {
    gameId: `duel:${deal.roundId}`,
    turnNumber: 1,
    mover: deal.fen.split(' ')[1] === 'b' ? 'b' : 'w',
    fenBefore: deal.fen,
    moveA: deal.moveA,
    moveB: deal.moveB,
    forced: false,
    coin: { chosen: r.chosen, method: 'hmac-commit-reveal', roll: r.roll },
    odds: deal.odds,
    executed: r.executed,
    fenAfter: r.fenAfter,
    inCheck: false,
    status: 'finished',
    effects: [],
    resolvedAt: Date.now(),
  };
}

/**
 * Coin Duel: the house deals a position and its two best moves; back one and
 * the committed coin decides. The stronger move pays more, exactly as the
 * Odds Market prices it.
 */
export default function CoinDuel() {
  const online = useOnline();
  const balance = useWalletStore((s) => s.balanceCents);
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 400);
  const cell = size / 8;

  const [deal, setDeal] = useState<CoinDuelDeal | null>(null);
  const [backed, setBacked] = useState<MoveSlot | null>(null);
  const [stake, setStake] = useState(1_000);
  const [result, setResult] = useState<CoinDuelResult | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(!!deal && !result);
  const expired = !!deal && !result && now > deal.expiresAt;

  const dealRound = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setBacked(null);
    const res = await request('coin_duel_deal', {});
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setDeal(res.data);
  }, []);

  useEffect(() => {
    if (online && !deal) void dealRound();
  }, [online, deal, dealRound]);

  const play = async () => {
    if (!deal || !backed) return;
    setBusy(true);
    setError(null);
    const res = await request('coin_duel_bet', { roundId: deal.roundId, slot: backed, stakeCents: stake });
    setBusy(false);
    if (!res.ok) {
      if (res.error === 'ROUND_EXPIRED') setDeal(null);
      return setError(res.message);
    }
    setResult(res.data);
    setRevealing(true);
  };

  const onRevealDone = () => {
    setRevealing(false);
    if (!result) return;
    playSfx(result.won ? 'win' : 'lose');
    if (result.won) haptics.success();
    else haptics.error();
    useWalletStore.getState().setBalance(result.balanceCents);
  };

  const mover = deal?.fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const turn = deal && result ? asTurn(deal, result) : null;
  const canBet = !!deal && !result && !expired && !!backed && stake >= ORIGINALS.MIN_STAKE_CENTS && (balance === null || stake <= balance);

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Coin Duel</Text>
        <BalancePill cents={balance} onPress={() => router.push('/(tabs)/wallet')} />
      </View>
      {!online && <Banner tone="warn">Connecting to the house…</Banner>}
      {!deal ? (
        <EmptyState title={busy ? 'Dealing…' : 'No deal'} hint={error ?? undefined} />
      ) : (
        <>
          <View style={{ width: size, height: size, alignSelf: 'center' }}>
            <Board fen={deal.fen} orientation={mover} size={size} lastMove={turn && !revealing ? { from: turn.executed.from, to: turn.executed.to } : null} />
            {turn && revealing ? (
              <TossReveal key={deal.roundId} result={turn} orientation={mover} cell={cell} mine onDone={onRevealDone} />
            ) : (
              <BoardOverlay orientation={mover} cell={cell} slots={result ? {} : { A: { from: deal.moveA.from, to: deal.moveA.to }, B: { from: deal.moveB.from, to: deal.moveB.to } }} ghost={null} />
            )}
          </View>
          <Text style={styles.muted}>{mover === 'w' ? 'White' : 'Black'} to move. The house offers its two best moves; which one does the coin play?</Text>

          <View style={styles.pair}>
            {(['A', 'B'] as const).map((slot) => {
              const move = slot === 'A' ? deal.moveA : deal.moveB;
              const p = slot === 'A' ? deal.odds.A : 10_000 - deal.odds.A;
              const selected = backed === slot;
              return (
                <Pressable
                  key={slot}
                  onPress={() => !result && setBacked(slot)}
                  disabled={!!result}
                  style={[styles.option, { borderColor: selected ? slotColor(slot) : colors.border }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${move.san}, ${pct(p)} to play, pays ${(deal.payoutX100[slot] / 100).toFixed(2)} times`}
                >
                  <Text style={[styles.slot, { color: slotColor(slot) }]}>{slot}</Text>
                  <Text style={styles.san}>{move.san}</Text>
                  <Text style={styles.odds}>{pct(p)} to play</Text>
                  <Text style={[styles.payout, { color: slotColor(slot) }]}>{(deal.payoutX100[slot] / 100).toFixed(2)}×</Text>
                </Pressable>
              );
            })}
          </View>

          {result && !revealing ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>{result.won ? 'The coin went your way' : 'The coin went the other way'}</Text>
              <Money cents={result.payoutCents - result.stakeCents} sign tone="auto" size="xl" />
              <Text style={styles.muted}>
                Roll {result.roll} · {result.executed.san} played · nonce {result.nonce}
              </Text>
              <Button label="Deal again" onPress={() => void dealRound()} loading={busy} />
            </View>
          ) : (
            <>
              <StakeInput valueCents={stake} onChange={setStake} minCents={ORIGINALS.MIN_STAKE_CENTS} maxCents={Math.min(ORIGINALS.MAX_STAKE_CENTS, balance ?? ORIGINALS.MAX_STAKE_CENTS)} presets={[500, 1_000, 2_500, 10_000]} label="Stake" />
              {backed && (
                <Text style={styles.muted}>
                  Backing {backed} pays <Money cents={Math.floor((stake * deal.payoutX100[backed]) / 100)} size="sm" /> on a win
                </Text>
              )}
              {expired ? (
                <Button label="Deal expired · deal again" onPress={() => void dealRound()} loading={busy} />
              ) : (
                <Button label={backed ? `Flip for ${formatCents(stake)} on ${backed}` : 'Pick a move to back'} onPress={() => void play()} disabled={!canBet || busy || revealing} loading={busy} size="lg" />
              )}
              {deal && !result && !expired && <Text style={styles.tiny}>Deal expires in {Math.max(0, Math.ceil((deal.expiresAt - now) / 1000))}s</Text>}
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable onPress={() => router.push('/fairness/seeds')} accessibilityRole="link">
            <Text style={styles.fair}>
              Provably fair · seed {deal.serverSeedHash.slice(0, 10)}… · nonce {deal.nonce} · {ORIGINALS.COIN_DUEL.EDGE * 100}% house edge
            </Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  title: { color: colors.text, fontSize: t.h2, fontWeight: '900' },
  muted: { color: colors.textMuted, fontSize: t.small, textAlign: 'center' },
  tiny: { color: colors.textMuted, fontSize: t.tiny, textAlign: 'center' },
  pair: { flexDirection: 'row', gap: 10 },
  option: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 2, padding: 12, alignItems: 'center', gap: 2 },
  slot: { fontWeight: '900', fontSize: t.tiny, letterSpacing: 2 },
  san: { color: colors.text, fontWeight: '900', fontSize: 24 },
  odds: { color: colors.textMuted, fontSize: t.small },
  payout: { fontWeight: '800', fontSize: t.h3 },
  resultCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, alignItems: 'center', gap: 8 },
  resultTitle: { color: colors.text, fontWeight: '800', fontSize: t.h3 },
  error: { color: colors.danger, textAlign: 'center' },
  fair: { color: colors.slotB, fontSize: t.tiny, textAlign: 'center', marginTop: 8 },
});
