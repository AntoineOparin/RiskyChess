import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { accent, colors, radius } from '../../lib/theme';

export interface BannerProps {
  tone: 'info' | 'warn' | 'bad' | 'good';
  children: ReactNode;
}

const TONE = { info: accent.blue, warn: colors.slotA, bad: colors.danger, good: accent.green } as const;
const GLYPH = { info: 'ℹ', warn: '⚠', bad: '✕', good: '✓' } as const;

/** A thin inline notice with a coloured edge and a glyph (never colour alone). */
export function Banner({ tone, children }: BannerProps) {
  return (
    <View style={[styles.banner, { borderLeftColor: TONE[tone] }]} accessibilityRole="alert">
      <Text style={[styles.glyph, { color: TONE[tone] }]}>{GLYPH[tone]}</Text>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.sm, borderLeftWidth: 3, paddingVertical: 10, paddingHorizontal: 12 },
  glyph: { fontWeight: '900', fontSize: 14 },
  text: { color: colors.text, fontSize: 13, flex: 1 },
});
