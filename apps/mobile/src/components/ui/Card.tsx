import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '../../lib/theme';

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  selected?: boolean;
  accessibilityLabel?: string;
}

/** A surface panel; pressable when given onPress, with the gold ring when selected. */
export function Card({ children, style, onPress, selected = false, accessibilityLabel }: CardProps) {
  if (!onPress) return <View style={[styles.card, selected && styles.selected, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, gap: 6, borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: colors.slotA },
  pressed: { opacity: 0.85 },
});
