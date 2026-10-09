import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme';

export interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

/** A section title with an optional trailing link ("See all"). */
export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={action.label}>
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  title: { color: colors.text, fontWeight: '800', fontSize: 16 },
  action: { color: colors.slotB, fontWeight: '700', fontSize: 13 },
});
