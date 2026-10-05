import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

interface Props {
  title: string;
  pitch: string;
  risk: 0 | 1 | 2 | 3;
  bullets: readonly string[];
  selected: boolean;
  onPress: () => void;
}

/** One preset on the mode picker: name, pitch, risk meter and an expandable "How it plays". */
export function ModeCard({ title, pitch, risk, bullets, selected, onPress }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${pitch}. Risk ${risk} of 3`}
      style={[styles.card, selected && styles.selected]}
    >
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.risk} accessibilityElementsHidden>
          {'◆'.repeat(risk)}
          <Text style={styles.riskOff}>{'◆'.repeat(3 - risk)}</Text>
        </Text>
      </View>
      <Text style={styles.pitch}>{pitch}</Text>
      {bullets.length > 0 && (
        <Pressable onPress={() => setOpen((o) => !o)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.how}>{open ? 'Hide ▴' : 'How it plays ▾'}</Text>
        </Pressable>
      )}
      {open &&
        bullets.map((b) => (
          <Text key={b} style={styles.bullet}>
            • {b}
          </Text>
        ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 6, borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: colors.slotA },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontWeight: '800', fontSize: 16 },
  risk: { color: colors.slotA, fontSize: 13, letterSpacing: 2 },
  riskOff: { color: colors.border },
  pitch: { color: colors.textMuted },
  how: { color: colors.slotB, fontWeight: '600', fontSize: 13 },
  bullet: { color: colors.text, fontSize: 13, lineHeight: 19 },
});
