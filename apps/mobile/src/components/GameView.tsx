import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Color, GameOutcome, MoveInput, TurnResult } from '@risky-chess/shared';
import { useMoveSelection } from '../hooks/useMoveSelection';
import { useTurnPresenter } from '../hooks/useTurnPresenter';
import { describeOutcome, materialSummary, other } from '../lib/chess';
import { haptics } from '../lib/haptics';
import { moveSfx, playSfx } from '../lib/sfx';
import { colors } from '../lib/theme';
import { Board, type Marker } from './Board/Board';
import { BoardOverlay } from './Board/BoardOverlay';
import { TossReveal } from './Board/TossReveal';
import { MoveSlotBar } from './MoveSlotBar';
import { PlayerBar } from './PlayerBar';
import { PromotionPicker } from './PromotionPicker';

export interface GameViewProps {
  /** Authoritative current position. */
  fen: string;
  myColor: Color;
  history: TurnResult[];
  /** True when the game is waiting on this player's submission. */
  myTurn: boolean;
  outcome?: GameOutcome | undefined;
  names: { me: string; opponent: string };
  banner?: string | null;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (moveA: MoveInput, moveB: MoveInput | null) => void;
  onResign: () => void;
  /** Shown once the game is over and the final reveal has finished. */
  outcomeAction?: { label: string; onPress: () => void };
}

const marker = (m: { from: Marker['from']; to: Marker['to'] } | null | undefined): Marker | null =>
  m ? { from: m.from, to: m.to } : null;

/**
 * Shared board screen for offline and online games. New turn results are
 * revealed one at a time on the board; it shows each turn's starting position
 * until its reveal ends. Tapping the board during a reveal skips it.
 */
export function GameView({ fen, myColor, history, myTurn, outcome, names, banner, submitting = false, error, onSubmit, onResign, outcomeAction }: GameViewProps) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 480);
  const cell = size / 8;

  const { current: revealing, done, settledOutcome, lastShown } = useTurnPresenter(history, outcome);
  const displayFen = revealing ? revealing.fenBefore : fen;
  const canAct = myTurn && !revealing && !outcome;
  const sel = useMoveSelection(displayFen, canAct && !submitting);
  // From the displayed position, so the count updates when a reveal lands, never before.
  const material = useMemo(() => materialSummary(displayFen), [displayFen]);
  const oppColor = other(myColor);

  const skip = useCallback(() => {
    if (!revealing) return;
    playSfx(moveSfx(revealing));
    done();
  }, [revealing, done]);

  // Game-over stinger, once, when the final reveal settles (not when reopening a finished game).
  const announced = useRef(settledOutcome !== undefined);
  useEffect(() => {
    if (!settledOutcome || announced.current) return;
    announced.current = true;
    const won = 'winner' in settledOutcome ? settledOutcome.winner === myColor : null;
    playSfx(won === null ? 'draw' : won ? 'win' : 'lose');
    if (won === null) haptics.warning();
    else if (won) haptics.success();
    else haptics.error();
  }, [settledOutcome, myColor]);
  useEffect(() => {
    if (!outcome) announced.current = false; // restarted
  }, [outcome]);

  // Memoized so unrelated re-renders (store updates mid-reveal, banners) don't
  // hand the memoized Board / BoardOverlay fresh objects.
  const lastMove = useMemo(() => marker(lastShown?.executed), [lastShown]);
  // The candidate the coin rejected last turn, left on the board as a faint arrow.
  const ghost = useMemo(() => {
    if (!lastShown?.coin || !lastShown.moveB) return null;
    const slot = lastShown.coin.chosen === 'A' ? ('B' as const) : ('A' as const);
    const move = slot === 'A' ? lastShown.moveA : lastShown.moveB;
    return { slot, move: { from: move.from, to: move.to } };
  }, [lastShown]);
  const slotMarkers = useMemo(
    () => (canAct ? { A: marker(sel.slots.A), B: marker(sel.slots.B) } : {}),
    [canAct, sel.slots],
  );

  const status = (() => {
    if (revealing) return revealing.forced ? 'Forced move' : revealing.mover === myColor ? 'Tossing your coin…' : 'Tossing their coin…';
    if (settledOutcome) return describeOutcome(settledOutcome, myColor);
    if (banner) return banner;
    if (submitting) return 'Locked in';
    if (myTurn) return sel.forced ? 'Your move (forced)' : 'Your move: choose two candidates';
    return `${names.opponent} is choosing…`;
  })();

  const confirmResign = () =>
    Alert.alert('Resign?', 'This ends the game as a loss.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resign', style: 'destructive', onPress: onResign },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <PlayerBar name={names.opponent} captured={material[oppColor].captured} capturedColor={myColor} score={material[oppColor].score} />
      <View style={{ width: size, height: size }}>
        <Board
          fen={displayFen}
          orientation={myColor}
          size={size}
          selected={sel.from}
          targets={sel.targets}
          takenTargets={sel.takenTargets}
          lastMove={lastMove}
          onSquarePress={revealing ? skip : sel.onSquarePress}
        />
        {revealing ? (
          <TossReveal
            key={`${revealing.gameId}:${revealing.turnNumber}`}
            result={revealing}
            orientation={myColor}
            cell={cell}
            mine={revealing.mover === myColor}
            onDone={done}
          />
        ) : (
          <BoardOverlay
            orientation={myColor}
            cell={cell}
            slots={slotMarkers}
            ghost={canAct && (sel.slots.A || sel.slots.B) ? null : ghost}
          />
        )}
      </View>
      <PlayerBar name={names.me} captured={material[myColor].captured} capturedColor={oppColor} score={material[myColor].score} />

      <View style={styles.statusRow}>
        <Text style={[styles.status, settledOutcome && styles.outcome]}>{status}</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!settledOutcome && (
        <MoveSlotBar
          slots={sel.slots}
          armed={sel.armed}
          filled={sel.filled}
          rejected={sel.rejected}
          forced={sel.forced && canAct}
          active={canAct}
          canSubmit={canAct && sel.submission !== null}
          locked={submitting}
          onArm={sel.arm}
          onClear={sel.clear}
          onSubmit={() => sel.submission && onSubmit(sel.submission.moveA, sel.submission.moveB)}
        />
      )}
      {lastShown && !lastShown.forced && (
        <Text style={styles.lastTurn}>
          Last toss: {lastShown.moveA.san} vs {lastShown.moveB?.san} → {lastShown.coin?.chosen} ({lastShown.executed.san})
        </Text>
      )}
      {settledOutcome && outcomeAction && (
        <Pressable onPress={outcomeAction.onPress} style={styles.action}>
          <Text style={styles.actionText}>{outcomeAction.label}</Text>
        </Pressable>
      )}
      {!settledOutcome && !outcome && (
        <Pressable onPress={confirmResign} style={styles.resign}>
          <Text style={styles.resignText}>Resign</Text>
        </Pressable>
      )}
      <PromotionPicker visible={sel.pendingPromotion !== null} color={myColor} onPick={sel.choosePromotion} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, alignItems: 'stretch' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, minHeight: 26 },
  status: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  outcome: { fontSize: 20, color: colors.slotA },
  error: { color: colors.danger, textAlign: 'center' },
  resign: { alignSelf: 'center', padding: 8 },
  resignText: { color: colors.danger, fontWeight: '600' },
  lastTurn: { color: colors.textMuted, textAlign: 'center', fontSize: 12 },
  action: { backgroundColor: colors.slotA, borderRadius: 12, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#111', fontWeight: '800', fontSize: 17 },
});
