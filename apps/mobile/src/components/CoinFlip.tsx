import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { TurnResult } from '@risky-chess/shared';
import { colors, slotColor } from '../lib/theme';

const SPIN_MS = 1400;
const HOLD_MS = 700;

/** Overlay that flips a coin to the toss result, then reports done. Forced turns just flash a label. */
export function CoinFlip({ result, onDone }: { result: TurnResult; onDone: () => void }) {
  const spin = useRef(new Animated.Value(0)).current;
  const chosen = result.coin?.chosen ?? 'A';

  useEffect(() => {
    spin.setValue(0);
    if (result.forced) {
      const t = setTimeout(onDone, 900);
      return () => clearTimeout(t);
    }
    const anim = Animated.timing(spin, { toValue: 1, duration: SPIN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    let hold: ReturnType<typeof setTimeout> | undefined;
    anim.start(({ finished }) => {
      if (!finished) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      hold = setTimeout(onDone, HOLD_MS);
    });
    return () => {
      anim.stop();
      if (hold) clearTimeout(hold);
    };
  }, [result, spin, onDone]);

  const end = 360 * 5 + (chosen === 'B' ? 180 : 0);
  const rotateY = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${end}deg`] });
  const backRotateY = spin.interpolate({ inputRange: [0, 1], outputRange: ['180deg', `${end + 180}deg`] });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay]}>
      {result.forced ? (
        <Text style={styles.forced}>Forced: {result.executed.san}</Text>
      ) : (
        <>
          <View style={styles.coinWrap}>
            <Animated.View style={[styles.face, { backgroundColor: slotColor('A'), transform: [{ perspective: 800 }, { rotateY }] }]}>
              <Text style={styles.letter}>A</Text>
            </Animated.View>
            <Animated.View style={[styles.face, { backgroundColor: slotColor('B'), transform: [{ perspective: 800 }, { rotateY: backRotateY }] }]}>
              <Text style={styles.letter}>B</Text>
            </Animated.View>
          </View>
          <Animated.Text style={[styles.caption, { opacity: spin.interpolate({ inputRange: [0, 0.95, 1], outputRange: [0, 0, 1] }) }]}>
            {chosen} wins: {result.executed.san}
          </Animated.Text>
        </>
      )}
    </View>
  );
}

const SIZE = 110;
const styles = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', gap: 16 },
  coinWrap: { width: SIZE, height: SIZE },
  face: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  letter: { fontSize: 52, fontWeight: '900', color: '#111' },
  caption: { color: colors.text, fontSize: 20, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 },
  forced: { color: colors.text, fontSize: 20, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 },
});
