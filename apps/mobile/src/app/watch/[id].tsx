import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { matchPayout } from '@risky-chess/engine';
import { SPORTSBOOK, START_FEN, formatCents, type MatchSide } from '@risky-chess/shared';
import { Board } from '../../components/Board/Board';
import { BoardOverlay } from '../../components/Board/BoardOverlay';
import { TossReveal } from '../../components/Board/TossReveal';
import { PlayerBar } from '../../components/PlayerBar';
import { Banner, Button, EmptyState, Money, OddsText, Screen, SectionHeader, Sheet, StakeInput } from '../../components/ui';
import { useTurnPresenter } from '../../hooks/useTurnPresenter';
import { useWatchGame } from '../../hooks/useWatchGame';
import { describeOutcome, materialSummary } from '../../lib/chess';
import { moveSfx, playSfx } from '../../lib/sfx';
import { colors, type as t } from '../../lib/theme';
import { useWalletStore } from '../../state/walletStore';

const SIDE_LABEL: Record<MatchSide, string> = { w: 'White wins', d: 'Draw', b: 'Black wins' };

/** Spectate a public game and bet on its result. The board is read-only. */
export default function Watch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = useWatchGame(id);
  const { session, line } = game;
  const balance = useWalletStore((s) => s.balanceCents);
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 480);
  const cell = size / 8;

  const { current: revealing, done, settledOutcome, lastShown } = useTurnPresenter(session?.history ?? [], session?.outcome);
  const displayFen = revealing ? revealing.fenBefore : (session?.fen ?? START_FEN);
  const material = useMemo(() => materialSummary(displayFen), [displayFen]);
  const skip = useCallback(() => {
    if (!revealing) return;
    playSfx(moveSfx(revealing));
    done();
  }, [revealing, done]);

  const [slip, setSlip] = useState<MatchSide | null>(null);
  const [stake, setStake] = useState(1_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!session) {
    return (
      <View style={styles.center}>
        {game.error ? <Text style={styles.error}>{game.error}</Text> : <ActivityIndicator color={colors.slotA} />}
      </View>
    );
  }

  const odds = slip && line ? line[slip] : 0;
  const place = async () => {
    if (!slip || !line) return;
    setBusy(true);
    setError(null);
    const res = await game.placeBet(slip, stake, line[slip]);
    setBusy(false);
    if (!res.ok) return setError(res.line ? `${res.message} — the line moved; check the new odds and try again.` : res.message);
    setSlip(null);
    setNotice(`Bet placed: ${SIDE_LABEL[res.bet.side]} @ ${(res.bet.oddsX100 / 100).toFixed(2)}× for ${formatCents(res.bet.stakeCents)}`);
  };

  const ghost = (() => {
    if (!lastShown?.coin || !lastShown.moveB) return null;
    const slot = lastShown.coin.chosen === 'A' ? ('B' as const) : ('A' as const);
    const move = slot === 'A' ? lastShown.moveA : lastShown.moveB;
    return { slot, move: { from: move.from, to: move.to } };
  })();
  const lastMove = lastShown ? { from: lastShown.executed.from, to: lastShown.executed.to } : null;
  const bettingOpen = !settledOutcome && !session.outcome && session.status !== 'finished';
  const status = revealing
    ? revealing.forced
      ? 'Forced move'
      : `Tossing ${revealing.mover === 'w' ? "White's" : "Black's"} coin…`
    : settledOutcome
      ? describeOutcome(settledOutcome, 'w').replace(/^You /, 'White ')
      : `${session.players[session.turn]?.displayName ?? 'Someone'} is choosing…`;

  return (
    <Screen scroll>
      {!game.connected && <Banner tone="warn">Reconnecting…</Banner>}
      <PlayerBar name={session.players.b?.displayName ?? 'Black'} captured={material.b.captured} capturedColor="w" score={material.b.score} chips={session.wallet?.b} chipValueCents={session.chipValueCents || undefined} />
      <View style={{ width: size, height: size, alignSelf: 'center' }}>
        <Board fen={displayFen} orientation="w" size={size} lastMove={lastMove} onSquarePress={revealing ? skip : undefined} />
        {revealing ? (
          <TossReveal key={`${revealing.gameId}:${revealing.turnNumber}`} result={revealing} orientation="w" cell={cell} mine={false} onDone={done} />
        ) : (
          <BoardOverlay orientation="w" cell={cell} slots={{}} ghost={ghost} />
        )}
      </View>
      <PlayerBar name={session.players.w?.displayName ?? 'White'} captured={material.w.captured} capturedColor="b" score={material.w.score} chips={session.wallet?.w} chipValueCents={session.chipValueCents || undefined} />
      <Text style={styles.status}>{status}</Text>
      {lastShown && !lastShown.forced && (
        <Text style={styles.last}>
          {lastShown.moveB ? `Last toss: ${lastShown.moveA.san} vs ${lastShown.moveB.san} → ${lastShown.executed.san}` : `ALL IN ${lastShown.moveA.san}`}
        </Text>
      )}

      <SectionHeader title={bettingOpen ? 'Match odds' : 'Betting closed'} />
      {notice && <Banner tone="good">{notice}</Banner>}
      {line ? (
        <View style={styles.odds}>
          {(['w', 'd', 'b'] as const).map((side) => (
            <Pressable
              key={side}
              onPress={() => {
                setError(null);
                setSlip(side);
              }}
              disabled={!bettingOpen}
              style={[styles.oddsBox, !bettingOpen && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel={`${SIDE_LABEL[side]} at ${(line[side] / 100).toFixed(2)}`}
            >
              <Text style={styles.oddsLabel}>{SIDE_LABEL[side]}</Text>
              <OddsText oddsX100={line[side]} size="lg" />
            </Pressable>
          ))}
        </View>
      ) : (
        <EmptyState title="No line on this game" hint="Only public player-vs-player tables are priced." />
      )}
      <Text style={styles.muted}>
        Handle <Money cents={game.handleCents} size="sm" /> · odds update after every toss
      </Text>

      <SectionHeader title="Your bets" />
      {game.myBets.length === 0 ? (
        <EmptyState title="No bets on this game" />
      ) : (
        game.myBets.map((b) => (
          <View key={b.id} style={styles.betRow}>
            <Text style={styles.betText}>
              {SIDE_LABEL[b.side]} @ {(b.oddsX100 / 100).toFixed(2)}× · {formatCents(b.stakeCents)}
            </Text>
            {b.status === 'open' ? <Text style={styles.muted}>to win {formatCents(matchPayout(b.stakeCents, b.oddsX100))}</Text> : <Money cents={b.payoutCents - b.stakeCents} sign tone="auto" size="sm" />}
          </View>
        ))
      )}

      <Sheet
        visible={slip !== null}
        title={slip ? `Back ${SIDE_LABEL[slip]}` : ''}
        onClose={() => setSlip(null)}
        footer={<Button label={`Place bet · ${formatCents(stake)}`} onPress={() => void place()} loading={busy} disabled={stake < SPORTSBOOK.MIN_STAKE_CENTS || (balance !== null && stake > balance)} />}
      >
        <View style={styles.slipHead}>
          <Text style={styles.slipOdds}>
            Odds <OddsText oddsX100={odds} size="lg" />
          </Text>
          <Text style={styles.muted}>
            Pays <Money cents={matchPayout(stake, odds)} size="sm" /> on a win
          </Text>
        </View>
        <StakeInput valueCents={stake} onChange={setStake} minCents={SPORTSBOOK.MIN_STAKE_CENTS} maxCents={Math.min(SPORTSBOOK.MAX_STAKE_CENTS, balance ?? SPORTSBOOK.MAX_STAKE_CENTS)} presets={[500, 1_000, 2_500, 10_000]} label="Stake" />
        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.muted}>Your bet locks at the odds shown. Abandoned games count as a win for the player who stayed.</Text>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  status: { color: colors.text, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  last: { color: colors.textMuted, fontSize: t.tiny, textAlign: 'center' },
  odds: { flexDirection: 'row', gap: 8 },
  oddsBox: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12, alignItems: 'center', gap: 4, borderWidth: 2, borderColor: colors.border },
  disabled: { opacity: 0.4 },
  oddsLabel: { color: colors.textMuted, fontSize: t.tiny, fontWeight: '700', textTransform: 'uppercase' },
  muted: { color: colors.textMuted, fontSize: t.small, textAlign: 'center' },
  betRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  betText: { color: colors.text, fontWeight: '600', fontSize: t.small },
  slipHead: { alignItems: 'center', gap: 4, marginBottom: 12 },
  slipOdds: { color: colors.text, fontWeight: '800', fontSize: t.h3 },
  error: { color: colors.danger, marginTop: 8 },
});
