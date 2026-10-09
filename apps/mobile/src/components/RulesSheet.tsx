import { StyleSheet, Text, View } from 'react-native';
import { isClassic, type GameRules } from '@risky-chess/shared';
import { activeUi } from '../modes/registry';
import { CHIP, colors } from '../lib/theme';
import { Button, Sheet } from './ui';

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
    <Sheet visible={visible} onClose={onClose} title={`Table rules${isClassic(rules) ? ': Classic' : ''}`} footer={<Button label={closeLabel} onPress={onClose} />}>
      <View style={styles.body}>
        <Section title="Every game" bullets={CLASSIC_BULLETS} />
        {modes.map(([id, ui]) => (
          <Section key={id} title={ui.title} pitch={ui.pitch} bullets={ui.bullets} />
        ))}
        {!isClassic(rules) && (
          <Text style={styles.note}>
            Both players start with 100 {CHIP}. Captures earn the captured piece’s value. Chips are play money.
          </Text>
        )}
      </View>
    </Sheet>
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
  body: { gap: 14 },
  section: { gap: 4 },
  sectionTitle: { color: colors.slotA, fontWeight: '800', fontSize: 15 },
  pitch: { color: colors.text, fontWeight: '600' },
  bullet: { color: colors.textMuted, lineHeight: 20 },
  note: { color: colors.textMuted, fontSize: 12 },
});
