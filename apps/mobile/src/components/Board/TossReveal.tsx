import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Color, TurnResult } from '@risky-chess/shared';
import { isLightSquare, squareOrigin } from '../../lib/chess';
import { haptics } from '../../lib/haptics';
import { coinSpinMs, COIN_TURNS, FORCED_HOLD_MS, LAND_HOLD_MS, REDUCED_HOLD_MS, SLIDE_MS } from '../../lib/motion';
import { moveSfx, playSfx } from '../../lib/sfx';
import { colors, slotColor } from '../../lib/theme';
import { MoveArrow, pairOffset } from './MoveArrow';
import { Piece } from './Piece';

interface Props {
  result: TurnResult;
  orientation: Color;
  cell: number;
  /** The viewer's own toss runs slightly longer than the opponent's. */
  mine: boolean;
  onDone: () => void;
}

/** Each time the coin shows the other face. Module-level so the worklet captures one stable function. */
function tick() {
  playSfx('tick');
  haptics.selection();
}

/**
 * Reveals a resolved turn on the board itself. A coin spins over the board (no
 * dimming) above both candidate arrows until it lands on the winner; then the
 * piece slides along the winning arrow. The result is already known: this is
 * presentation only, it runs on the UI thread and the board underneath never
 * re-renders. Mount it with a key per turn.
 */
export function TossReveal({ result, orientation, cell, mine, onDone }: Props) {
  const reduceMotion = useReducedMotion();
  const tossed = result.coin !== null;
  /** An All-In: one move on a win/bust coin. */
  const allIn = tossed && result.moveB === null;
  /** A busted All-In: nothing moves, the capturing piece fades off its square. */
  const bust = result.effects?.some((e) => e.kind === 'all_in' && !e.won) ?? false;
  const winner = result.coin?.chosen === 'B' ? 1 : 0;
  const endAngle = 360 * COIN_TURNS + winner * 180;

  const spin = useSharedValue(0);
  /** 0–1 position of the odds marker; slides to the roll while the coin spins. */
  const marker = useSharedValue(0);
  const weighted = tossed && result.odds.A !== 5000;
  const rollAt = result.coin?.roll ?? (winner === 0 ? result.odds.A / 2 : (result.odds.A + 10_000) / 2);
  /** Gate for ticks: 1 once the coin has landed (or never spins). */
  const landed = useSharedValue(0);
  const slide = useSharedValue(0);

  // A tick each time the coin turns to its other face: fast at first, slowing as it lands.
  // The reaction only crosses to JS on a face change (about six times), not every frame.
  useAnimatedReaction(
    () => (Math.cos((spin.value * Math.PI) / 180) >= 0 ? 0 : 1),
    (face, prev) => {
      if (prev !== null && face !== prev && landed.value === 0) scheduleOnRN(tick);
    },
    [],
  );

  useEffect(() => {
    const onLand = () => {
      playSfx('land');
      haptics.medium();
    };
    const onEnd = () => {
      playSfx(moveSfx(result));
      if (result.inCheck) haptics.heavy();
      onDone();
    };
    const startSlide = (delay: number) => {
      'worklet';
      slide.value = withDelay(
        delay,
        withTiming(1, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(onEnd);
        }),
      );
    };

    if (reduceMotion) {
      landed.value = 1;
      spin.value = winner * 180;
      marker.value = rollAt / 10_000;
      if (tossed) onLand();
      else playSfx('forced');
      const t = setTimeout(onEnd, REDUCED_HOLD_MS);
      return () => clearTimeout(t);
    }

    if (!tossed) {
      landed.value = 1;
      playSfx('forced');
      haptics.rigid();
      startSlide(FORCED_HOLD_MS);
    } else {
      marker.value = withTiming(rollAt / 10_000, { duration: coinSpinMs(mine), easing: Easing.out(Easing.quad) });
      spin.value = withTiming(endAngle, { duration: coinSpinMs(mine), easing: Easing.out(Easing.quad) }, (finished) => {
        'worklet';
        if (!finished) return;
        landed.value = 1;
        scheduleOnRN(onLand);
        startSlide(LAND_HOLD_MS);
      });
    }
    return () => {
      cancelAnimation(spin);
      cancelAnimation(slide);
      cancelAnimation(marker);
    };
  }, [result, mine, reduceMotion, onDone, tossed, winner, endAngle, spin, landed, slide, marker, rollAt]);

  // The coin clears out of the way as the piece starts moving.
  const coinWrap = useAnimatedStyle(() => ({ opacity: interpolate(slide.value, [0, 0.4], [1, 0], 'clamp') }));
  // A flat flip: the coin narrows to its edge and widens again (scaleX = |cos|),
  // showing B while its back is up. No 3D transform or backface culling, which
  // flicker edge-on (notably on Android); everything stays on the UI thread.
  const coinSize = cell * 1.6;
  const flipStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0.06, Math.abs(Math.cos((spin.value * Math.PI) / 180))) }],
  }));
  const backFace = useAnimatedStyle(() => ({ opacity: Math.cos((spin.value * Math.PI) / 180) < 0 ? 1 : 0 }));

  const { executed, mover } = result;
  const from = squareOrigin(executed.from, orientation, cell);
  const to = squareOrigin(executed.to, orientation, cell);
  const pieceStyle = useAnimatedStyle(() => ({
    opacity: !bust && slide.value > 0 ? 1 : 0,
    transform: [{ translateX: from.x + (to.x - from.x) * slide.value }, { translateY: from.y + (to.y - from.y) * slide.value }],
  }));
  // The grid still shows the old position: cover the moving piece's origin once
  // it lifts off, and fade out a captured piece as the mover arrives.
  const fromCover = useAnimatedStyle(() => ({ opacity: bust ? slide.value : slide.value > 0 ? 1 : 0 }));
  const toCover = useAnimatedStyle(() => ({ opacity: interpolate(slide.value, [0.7, 1], [0, 1], 'clamp') }));
  const squareBg = (light: boolean) => ({ backgroundColor: light ? colors.lightSquare : colors.darkSquare });

  const offsets = pairOffset(result.moveA, result.moveB);
  const coin = coinSize;
  const board = cell * 8;
  const barW = board * 0.8;
  const markerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: marker.value * barW - 2 }] }));
  const pctA = Math.round(result.odds.A / 100);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <MoveArrow from={result.moveA.from} to={result.moveA.to} slot="A" orientation={orientation} cell={cell} offset={offsets.A} />
      {result.moveB && (
        <MoveArrow from={result.moveB.from} to={result.moveB.to} slot="B" orientation={orientation} cell={cell} offset={offsets.B} />
      )}
      <Animated.View style={[styles.cell, { width: cell, height: cell, left: from.x, top: from.y }, squareBg(isLightSquare(executed.from)), fromCover]} />
      {executed.captured && !bust && (
        <Animated.View style={[styles.cell, { width: cell, height: cell, left: to.x, top: to.y }, squareBg(isLightSquare(executed.to)), toCover]} />
      )}
      <Animated.View style={[styles.cell, { width: cell, height: cell }, pieceStyle]}>
        <Piece type={executed.piece} color={mover} size={cell} />
      </Animated.View>
      {tossed && (
        <Animated.View style={[styles.coinWrap, { left: board / 2 - coin / 2, top: board / 2 - coin / 2, width: coin, height: coin }, coinWrap]}>
          <Animated.View style={[StyleSheet.absoluteFill, flipStyle]}>
            {(['A', 'B'] as const).map((slot) => (
              <Animated.View
                key={slot}
                style={[
                  styles.face,
                  { width: coin, height: coin, borderRadius: coin / 2, backgroundColor: slotColor(slot) },
                  slot === 'B' && backFace,
                ]}
              >
                <Text allowFontScaling={false} style={[styles.letter, { fontSize: coin * 0.48 }]}>
                  {allIn ? (slot === 'A' ? '✓' : '✕') : slot}
                </Text>
              </Animated.View>
            ))}
          </Animated.View>
        </Animated.View>
      )}
      {weighted && (
        // A static split (A's share = its odds) with a marker sliding to where the roll fell.
        <Animated.View style={[styles.oddsWrap, { left: board * 0.1, top: board / 2 + coin / 2 + cell * 0.2, width: barW }, coinWrap]}>
          <View style={styles.oddsBar}>
            <View style={{ width: `${pctA}%`, backgroundColor: slotColor('A') }} />
            <View style={{ flex: 1, backgroundColor: slotColor('B') }} />
            <Animated.View style={[styles.oddsMarker, markerStyle]} />
          </View>
          <View style={styles.oddsLabels}>
            <Text style={styles.oddsText}>A {pctA}%</Text>
            <Text style={styles.oddsText}>B {100 - pctA}%</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { position: 'absolute', left: 0, top: 0 },
  coinWrap: { position: 'absolute' },
  face: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  letter: { fontWeight: '900', color: '#111' },
  oddsWrap: { position: 'absolute', gap: 2 },
  oddsBar: { height: 12, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.55)' },
  oddsMarker: { position: 'absolute', left: 0, top: -2, bottom: -2, width: 4, backgroundColor: '#fff', borderRadius: 2 },
  oddsLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  oddsText: { color: '#111', fontWeight: '900', fontSize: 12, backgroundColor: 'rgba(255,255,255,0.75)', paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden' },
});
