import { Pressable, StyleSheet, Text } from 'react-native';
import { accent, colors, radius } from '../../lib/theme';

export interface PillProps {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  tone?: 'neutral' | 'accent' | 'good' | 'bad';
  disabled?: boolean;
  small?: boolean;
  accessibilityLabel?: string;
}

const TONE = { neutral: colors.surfaceRaised, accent: colors.slotA, good: accent.green, bad: colors.danger } as const;
const ON_TONE = { neutral: colors.text, accent: '#111', good: '#111', bad: colors.text } as const;

/** A rounded chip for pickers (tiers, presets, sides). Selected fills with its tone. */
export function Pill({ label, onPress, selected = false, tone = 'accent', disabled = false, small = false, accessibilityLabel }: PillProps) {
  const fill = selected ? TONE[tone] : colors.surface;
  const text = selected ? ON_TONE[tone] : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? 'radio' : 'text'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.pill,
        small && styles.small,
        { backgroundColor: fill, borderColor: selected ? TONE[tone] : colors.border },
        disabled && styles.off,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, small && styles.labelSmall, { color: text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  small: { minHeight: 30, paddingHorizontal: 10 },
  label: { fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  labelSmall: { fontSize: 12 },
  off: { opacity: 0.35 },
  pressed: { opacity: 0.8 },
});
