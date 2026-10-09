import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { ORIGINALS, formatCents, type PuzzleResult, type PuzzleRound, type PuzzleTier } from '@risky-chess/shared';
import { Board } from '../../components/Board/Board';
import { BoardOverlay } from '../../components/Board/BoardOverlay';
import { PromotionPicker } from '../../components/PromotionPicker';
import { BalancePill, Banner, Button, Card, Money, Pill, Screen, StakeInput } from '../../components/ui';
import { useMoveSelection } from '../../hooks/useMoveSelection';
import { useNow } from '../../hooks/useNow';
import { haptics } from '../../lib/haptics';
import { playSfx } from '../../lib/sfx';
import { colors, type as t } from '../../lib/theme';
import { getSocket, request } from '../../net/socket';
import { useOnline } from '../../net/useOnline';
import { useWalletStore } from '../../state/walletStore';

const TIERS: { tier: PuzzleTier; label: string; hint: string }[] = [
  { tier: 'mate1', label: 'Mate in 1', hint: `${ORIGINALS.PUZZLE_TIERS.mate1.seconds}s · ${(ORIGINALS.PUZZLE_TIERS.mate1.payoutX100 / 100).toFixed(2)}×` },
  { tier: 'mate2', label: 'Mate in 2', hint: `${ORIGINALS.PUZZLE_TIERS.mate2.seconds}s · ${(ORIGINALS.PUZZLE_TIERS.mate2.payoutX100 / 100).toFixed(2)}×` },
];

const EMPTY = '8/8/8/8/8/8/8/8 w - - 0 1';

/** Blitz Puzzle: stake, get a mating position picked by the committed roll, find the key move before the clock runs out. */
export default function Puzzle() {
  const online = useOnline();
  const balance = useWalletStore((s) => s.balanceCents);
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 400);
  const cell = size / 8;

  const [tier, setTier] = useState<PuzzleTier>('mate1');
  const [stake, setStake] = useState(1_000);
  const [round, setRound] = useState<PuzzleRound | null>(null);
  const [result, setResult] = useState<PuzzleResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = !!round && !result;
  const now = useNow(live, 100);
  const sel = useMoveSelection(round?.fen ?? EMPTY, live, true);

  // The server settles a round its clock ended; mirror it so the board locks.
  useEffect(() => {
    const socket = getSocket();
    const onSettled = (p: { roundId: string; payoutCents: number; balanceCents: number }) => {
      if (p.roundId !== round?.roundId || result) return;
      setResult({ roundId: p.roundId, outcome: 'timeout', payoutCents: p.payoutCents, balanceCents: p.balanceCents });
      useWalletStore.getState().setBalance(p.balanceCents);
      playSfx('lose');
    };
    socket.on('original_settled', onSettled);
    return () => {
      socket.off('original_settled', onSettled);
    };
  }, [round, result]);

  const start = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await request('puzzle_start', { tier, stakeCents: stake });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setRound(res.data);
    playSfx('tick');
  };

  const answer = async () => {
    if (!round || !sel.submission) return;
    setBusy(true);
    const res = await request('puzzle_answer', { roundId: round.roundId, move: sel.submission.moveA });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setResult(res.data);
    useWalletStore.getState().setBalance(res.data.balanceCents);
    playSfx(res.data.outcome === 'solved' ? 'win' : 'lose');
    if (res.data.outcome === 'solved') haptics.success();
    else haptics.error();
  };

  const secondsLeft = round ? Math.max(0, (round.deadline - now) / 1000) : 0;
  const toMove = round?.fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const canStart = online && !busy && stake >= ORIGINALS.MIN_STAKE_CENTS && (balance === null || stake <= balance);

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Blitz Puzzle</Text>
        <BalancePill cents={balance} onPress={() => router.push('/(tabs)/wallet')} />
      </View>
      {!online && <Banner tone="warn">Connecting to the house…</Banner>}

      {round ? (
        <>
          <View style={styles.clockRow}>
            <Text style={styles.toMove}>{toMove === 'w' ? 'White' : 'Black'} to play · {round.tier === 'mate1' ? 'mate in 1' : 'mate in 2'}</Text>
            <Text style={[styles.clock, live && secondsLeft < 5 && styles.clockLow]}>{live ? `${secondsLeft.toFixed(1)}s` : result?.outcome === 'timeout' ? "time's up" : '—'}</Text>
          </View>
          <View style={{ width: size, height: size, alignSelf: 'center' }}>
            <Board
              fen={round.fen}
              orientation={toMove}
              size={size}
              selected={sel.from}
              targets={sel.targets}
              takenTargets={sel.takenTargets}
              lastMove={result?.move ? { from: result.move.from, to: result.move.to } : null}
              onSquarePress={live ? sel.onSquarePress : undefined}
            />
            <BoardOverlay orientation={toMove} cell={cell} slots={live && sel.slots.A ? { A: { from: sel.slots.A.from, to: sel.slots.A.to } } : {}} ghost={null} />
          </View>
          {result ? (
            <Card>
              <Text style={styles.resultTitle}>{result.outcome === 'solved' ? 'Mate! Paid out.' : result.outcome === 'timeout' ? 'Out of time' : `${result.move?.san ?? 'That'} is not mate`}</Text>
              <Money cents={result.payoutCents - round.stakeCents} sign tone="auto" size="xl" />
              <Button label="Another puzzle" onPress={() => setRound(null)} />
            </Card>
          ) : (
            <>
              <Button label={sel.slots.A ? `Play ${sel.slots.A.san}` : 'Tap a piece, then its square'} onPress={() => void answer()} disabled={!sel.submission || busy} loading={busy} size="lg" />
              {sel.slots.A && <Button label="Clear" variant="ghost" onPress={() => sel.clear('A')} />}
            </>
          )}
          <Text style={styles.tiny}>
            Stake {formatCents(round.stakeCents)} · pays {(round.payoutX100 / 100).toFixed(2)}× · nonce {round.nonce} · puzzle #{round.puzzleIndex}
          </Text>
        </>
      ) : (
        <>
          <View style={styles.tiers}>
            {TIERS.map((x) => (
              <Pill key={x.tier} label={`${x.label} · ${x.hint}`} selected={tier === x.tier} onPress={() => setTier(x.tier)} />
            ))}
          </View>
          <Card>
            <Text style={styles.muted}>
              You stake first. The roll picks a position from {tier === 'mate1' ? 'the mate-in-1' : 'the mate-in-2'} set and the clock starts the moment it lands. Find the key move; anything else loses the stake.
            </Text>
          </Card>
          <StakeInput valueCents={stake} onChange={setStake} minCents={ORIGINALS.MIN_STAKE_CENTS} maxCents={Math.min(ORIGINALS.MAX_STAKE_CENTS, balance ?? ORIGINALS.MAX_STAKE_CENTS)} presets={[500, 1_000, 2_500, 10_000]} label="Stake" />
          <Text style={styles.muted}>
            Solve it to win <Money cents={Math.floor((stake * ORIGINALS.PUZZLE_TIERS[tier].payoutX100) / 100)} size="sm" />
          </Text>
          <Button label={`Start · ${formatCents(stake)}`} onPress={() => void start()} disabled={!canStart} loading={busy} size="lg" />
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <PromotionPicker visible={sel.pendingPromotion !== null} color={toMove} onPick={sel.choosePromotion} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  title: { color: colors.text, fontSize: t.h2, fontWeight: '900' },
  clockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toMove: { color: colors.text, fontWeight: '700' },
  clock: { color: colors.slotA, fontWeight: '900', fontSize: t.h2, fontVariant: ['tabular-nums'] },
  clockLow: { color: colors.danger },
  tiers: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  muted: { color: colors.textMuted, fontSize: t.small, textAlign: 'center', lineHeight: 19 },
  tiny: { color: colors.textMuted, fontSize: t.tiny, textAlign: 'center' },
  resultTitle: { color: colors.text, fontWeight: '800', fontSize: t.h3, textAlign: 'center' },
  error: { color: colors.danger, textAlign: 'center' },
});
