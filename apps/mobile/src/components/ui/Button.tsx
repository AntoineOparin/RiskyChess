import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '../../lib/theme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** The one button. Primary is the gold call to action; ghost is text only. */
export function Button({ label, onPress, variant = 'primary', size = 'md', disabled = false, loading = false, style, accessibilityLabel }: ButtonProps) {
  const off = disabled || loading;
  const text = TEXT[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => [styles.base, VARIANT[variant], size === 'lg' && styles.lg, off && styles.off, pressed && !off && styles.pressed, style]}
    >
      {loading ? <ActivityIndicator color={text} /> : <Text style={[styles.label, { color: text }, size === 'lg' && styles.labelLg]}>{label}</Text>}
    </Pressable>
  );
}

const TEXT = { primary: '#111', secondary: colors.text, danger: colors.danger, ghost: colors.slotB } as const;

const VARIANT = StyleSheet.create({
  primary: { backgroundColor: colors.slotA },
  secondary: { backgroundColor: colors.surfaceRaised },
  danger: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.danger },
  ghost: { backgroundColor: 'transparent', minHeight: 40 },
});

const styles = StyleSheet.create({
  base: { minHeight: 52, borderRadius: radius.md, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  lg: { minHeight: 56 },
  label: { fontWeight: '800', fontSize: 16 },
  labelLg: { fontSize: 17 },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
});
