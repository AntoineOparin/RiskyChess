import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isClassic, type GameRules } from '@risky-chess/shared';
import { activeUi } from '../modes/registry';
import { CHIP, colors } from '../lib/theme';

const CLASSIC_BULLETS = [
  'Each turn, pick two different legal moves: A and B.',
  'A coin decides which one is played. With one legal move, it just plays.',
  'Checkmate, stalemate and draws count after the move that was played.',
];

interface Props {
  visible: boolean;
  rules: GameRules;
  onClose: () => void;
  /** Label of the dismiss button: "I'm in" when joining a table, "Got it" otherwise. */
  closeLabel?: string;
}

/** The table's rules in plain language: classic basics, then each active mode. */
export function RulesSheet({ visible, rules, onClose, closeLabel = 'Got it' }: Props) {
  const modes = activeUi(rules.modes);
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title}>Table rules{isClassic(rules) ? ': Classic' : ''}</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
            <Section title="Every game" bullets={CLASSIC_BULLETS} />
            {modes.map(([id, ui]) => (
              <Section key={id} title={ui.title} pitch={ui.pitch} bullets={ui.bullets} />
            ))}
            {!isClassic(rules) && (
              <Text style={styles.note}>
                Both players start with 100 {CHIP}. Captures earn the captured piece’s value. Chips are play money.
              </Text>
            )}
          </ScrollView>
          <Pressable onPress={onClose} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>{closeLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, pitch, bullets }: { title: string; pitch?: string; bullets: readonly string[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {pitch ? <Text style={styles.pitch}>{pitch}</Text> : null}
      {bullets.map((b) => (
        <Text key={b} style={styles.bullet}>
          • {b}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, gap: 12, maxHeight: '85%' },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  scroll: { flexGrow: 0 },
  body: { gap: 14 },
  section: { gap: 4 },
  sectionTitle: { color: colors.slotA, fontWeight: '800', fontSize: 15 },
  pitch: { color: colors.text, fontWeight: '600' },
  bullet: { color: colors.textMuted, lineHeight: 20 },
  note: { color: colors.textMuted, fontSize: 12 },
  button: { backgroundColor: colors.slotA, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#111', fontWeight: '800', fontSize: 16 },
});
