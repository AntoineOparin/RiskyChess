import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../lib/theme';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  left?: ReactNode;
  onPress?: () => void;
}

/** One line of a list: optional glyph, title/subtitle, and a right-hand value or control. */
export function ListRow({ title, subtitle, right, left, onPress }: ListRowProps) {
  const body = (
    <>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
      {onPress && !right ? <Text style={styles.chevron}>›</Text> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, minHeight: 56 },
  left: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { color: colors.text, fontWeight: '700', fontSize: 15 },
  subtitle: { color: colors.textMuted, fontSize: 13 },
  right: { alignItems: 'flex-end', justifyContent: 'center' },
  chevron: { color: colors.textMuted, fontSize: 22, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});
