import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MoveSlot, ResolvedMove } from '@risky-chess/shared';
import { colors, slotColor } from '../lib/theme';

interface Props {
  slots: Record<MoveSlot, ResolvedMove | null>;
  forced: boolean;
  canSubmit: boolean;
  submitting: boolean;
  onClear: (slot: MoveSlot) => void;
  onSubmit: () => void;
}

export function MoveSlotBar({ slots, forced, canSubmit, submitting, onClear, onSubmit }: Props) {
  return (
    <View style={styles.wrap}>
      {forced ? (
        <Text style={styles.forced}>Only one legal move: it plays without a coin toss.</Text>
      ) : (
        <View style={styles.row}>
          {(['A', 'B'] as const).map((slot) => {
            const m = slots[slot];
            return (
              <Pressable
                key={slot}
                onPress={m ? () => onClear(slot) : undefined}
                accessibilityLabel={m ? `Clear move ${slot}` : `Move ${slot} empty`}
                style={[styles.slot, { borderColor: slotColor(slot) }]}
              >
                <Text style={[styles.slotLabel, { color: slotColor(slot) }]}>{slot}</Text>
                <Text style={m ? styles.san : styles.placeholder}>{m ? m.san : 'pick a move'}</Text>
                {m && <Text style={styles.clear}>✕</Text>}
              </Pressable>
            );
          })}
        </View>
      )}
      <Pressable
        disabled={!canSubmit || submitting}
        onPress={onSubmit}
        style={[styles.submit, (!canSubmit || submitting) && styles.disabled]}
      >
        <Text style={styles.submitText}>{submitting ? 'Submitting…' : forced ? 'Play forced move' : 'Flip the coin'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  slot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
  },
  slotLabel: { fontWeight: '900', fontSize: 16 },
  san: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 },
  placeholder: { color: colors.textMuted, fontSize: 14, flex: 1 },
  clear: { color: colors.textMuted, fontSize: 14 },
  forced: { color: colors.slotA, textAlign: 'center', fontWeight: '600' },
  submit: { backgroundColor: colors.slotA, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  disabled: { opacity: 0.35 },
  submitText: { color: '#111', fontWeight: '800', fontSize: 16 },
});
