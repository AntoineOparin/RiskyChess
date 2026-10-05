import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { EffectLine } from '../modes/types';
import { EFFECT_TOAST_MS } from '../lib/motion';
import { colors } from '../lib/theme';

interface Props {
  /** Changes once per settled reveal; a new key replaces the visible toasts. */
  feedKey: string | null;
  lines: readonly EffectLine[];
}

/** Stacked toasts for a turn's effects, shown after its reveal settles and gone after 2.5 s. */
export function EffectsFeed({ feedKey, lines }: Props) {
  const [shown, setShown] = useState<{ key: string; lines: readonly EffectLine[] } | null>(null);

  useEffect(() => {
    if (!feedKey || !lines.length) return;
    setShown({ key: feedKey, lines });
    const t = setTimeout(() => setShown((s) => (s?.key === feedKey ? null : s)), EFFECT_TOAST_MS);
    return () => clearTimeout(t);
    // Lines are derived from the same turn as the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedKey]);

  if (!shown) return null;
  return (
    <View pointerEvents="none" style={styles.wrap} accessibilityLiveRegion="polite">
      {shown.lines.map((l, i) => {
        const big = l.tone === 'big_good' || l.tone === 'big_bad';
        return (
          <Animated.View key={`${shown.key}:${i}`} entering={FadeIn.duration(150)} exiting={FadeOut.duration(200)} style={[styles.toast, TONE[l.tone], big && styles.big]}>
            <Text style={[styles.text, big && styles.bigText]}>{l.text}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const TONE = StyleSheet.create({
  good: { borderColor: colors.success },
  bad: { borderColor: colors.danger },
  neutral: { borderColor: colors.border },
  big_good: { borderColor: colors.success, backgroundColor: '#1F3A26' },
  big_bad: { borderColor: colors.danger, backgroundColor: '#3E1D20' },
});

const styles = StyleSheet.create({
  wrap: { gap: 6, alignItems: 'center' },
  toast: { backgroundColor: colors.surfaceRaised, borderRadius: 10, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 12 },
  text: { color: colors.text, fontWeight: '700', fontSize: 14 },
  big: { paddingVertical: 10, paddingHorizontal: 18 },
  bigText: { fontSize: 18, fontWeight: '900' },
});
