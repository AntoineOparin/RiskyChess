import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { Color, GameOutcome, MoveInput, TurnResult } from '@gamble/shared';
import { useMoveSelection } from '../hooks/useMoveSelection';
import { describeOutcome } from '../lib/chess';
import { colors } from '../lib/theme';
import { Board, type Marker } from './Board/Board';
import { CoinFlip } from './CoinFlip';
import { MoveSlotBar } from './MoveSlotBar';
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
}

const marker = (m: { from: Marker['from']; to: Marker['to'] } | null | undefined): Marker | null =>
  m ? { from: m.from, to: m.to } : null;

/**
 * Shared board screen for offline and online games. New turn results are
 * queued and animated one at a time; the board shows each turn's starting
 * position until its coin lands.
 */
export function GameView({ fen, myColor, history, myTurn, outcome, names, banner, submitting = false, error, onSubmit, onResign }: GameViewProps) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 480);

  const seen = useRef(history.length);
  const [queue, setQueue] = useState<TurnResult[]>([]);
  useEffect(() => {
    if (history.length > seen.current) {
      const fresh = history.slice(seen.current);
      setQueue((q) => [...q, ...fresh]);
    }
    seen.current = history.length;
  }, [history]);
  const onCoinDone = useCallback(() => setQueue((q) => q.slice(1)), []);

  const animating = queue[0];
  const displayFen = animating ? animating.fenBefore : fen;
  const canAct = myTurn && !animating && !outcome;
  const sel = useMoveSelection(displayFen, canAct);

  const lastShown = animating ? undefined : history.at(-1);
  const ghostMove = lastShown?.moveB && (lastShown.coin?.chosen === 'A' ? lastShown.moveB : lastShown.moveA);

  const status = (() => {
    if (animating) return animating.forced ? 'Forced move' : 'Tossing the coin…';
    if (outcome) return describeOutcome(outcome, myColor);
    if (banner) return banner;
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
      <Text style={styles.player}>{names.opponent}</Text>
      <View style={{ width: size, height: size }}>
        <Board
          fen={displayFen}
          orientation={myColor}
          size={size}
          selected={sel.from}
          targets={sel.targets}
          slots={
            animating
              ? { A: marker(animating.moveA), B: marker(animating.moveB) }
              : canAct
                ? { A: marker(sel.slots.A), B: marker(sel.slots.B) }
                : {}
          }
          lastMove={marker(lastShown?.executed)}
          ghost={marker(ghostMove)}
          onSquarePress={sel.onSquarePress}
        />
        {animating && <CoinFlip key={`${animating.gameId}:${animating.turnNumber}`} result={animating} onDone={onCoinDone} />}
      </View>
      <Text style={styles.player}>{names.me}</Text>

      <Text style={[styles.status, outcome && !animating && styles.outcome]}>{status}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!outcome && (
        <MoveSlotBar
          slots={sel.slots}
          forced={sel.forced && canAct}
          canSubmit={canAct && sel.submission !== null}
          submitting={submitting}
          onClear={sel.clear}
          onSubmit={() => sel.submission && onSubmit(sel.submission.moveA, sel.submission.moveB)}
        />
      )}
      {!outcome && (
        <Pressable onPress={confirmResign} style={styles.resign}>
          <Text style={styles.resignText}>Resign</Text>
        </Pressable>
      )}
      {lastShown && !lastShown.forced && (
        <Text style={styles.lastTurn}>
          Last toss: {lastShown.moveA.san} vs {lastShown.moveB?.san} → {lastShown.coin?.chosen} ({lastShown.executed.san})
        </Text>
      )}
      <PromotionPicker visible={sel.pendingPromotion !== null} color={myColor} onPick={sel.choosePromotion} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, alignItems: 'stretch' },
  player: { color: colors.textMuted, fontWeight: '600' },
  status: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  outcome: { fontSize: 20, color: colors.slotA },
  error: { color: colors.danger, textAlign: 'center' },
  resign: { alignSelf: 'center', padding: 8 },
  resignText: { color: colors.danger, fontWeight: '600' },
  lastTurn: { color: colors.textMuted, textAlign: 'center', fontSize: 12 },
});
