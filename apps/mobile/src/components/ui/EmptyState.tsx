import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme';

/** What a list says when it has nothing to show. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.box} accessibilityRole="text">
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16, gap: 4 },
  title: { color: colors.text, fontWeight: '700', fontSize: 15, textAlign: 'center' },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
