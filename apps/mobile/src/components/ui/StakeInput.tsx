import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatCents, parseMoney } from '@risky-chess/shared';
import { CHIP, colors, radius } from '../../lib/theme';
import { Pill } from './Pill';

export interface StakeInputProps {
  valueCents: number;
  onChange: (cents: number) => void;
  /** Usually the balance; also what "Max" fills in. */
  maxCents?: number;
  minCents?: number;
  /** Quick amounts, in cents. */
  presets?: readonly number[];
  label?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** An amount field with ½ / 2× / Max and optional presets, always holding a clamped value in cents. */
export function StakeInput({ valueCents, onChange, maxCents = Number.MAX_SAFE_INTEGER, minCents = 0, presets, label = 'Stake' }: StakeInputProps) {
  const [text, setText] = useState(formatCents(valueCents, { symbol: false }));
  const [editing, setEditing] = useState(false);
  // Follow outside changes (presets, ½, Max) while the field isn't being typed in.
  useEffect(() => {
    if (!editing) setText(formatCents(valueCents, { symbol: false }));
  }, [valueCents, editing]);

  const set = (cents: number) => onChange(clamp(cents, minCents, maxCents));
  const onText = (t: string) => {
    setText(t);
    const cents = parseMoney(t);
    if (cents !== null) set(cents);
  };

  return (
    <View style={styles.box}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.prefix}>{CHIP}</Text>
          <TextInput
            value={text}
            onChangeText={onText}
            onFocus={() => setEditing(true)}
            onBlur={() => {
              setEditing(false);
              setText(formatCents(valueCents, { symbol: false }));
            }}
            inputMode="decimal"
            keyboardType="decimal-pad"
            style={styles.input}
            accessibilityLabel={label}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <Quick label="½" onPress={() => set(Math.floor(valueCents / 2))} />
        <Quick label="2×" onPress={() => set(valueCents * 2)} />
        <Quick label="Max" onPress={() => set(maxCents)} disabled={maxCents === Number.MAX_SAFE_INTEGER} />
      </View>
      {presets?.length ? (
        <View style={styles.presets} accessibilityRole="radiogroup" accessibilityLabel={`${label} presets`}>
          {presets.map((p) => (
            <Pill key={p} small label={formatCents(p)} selected={valueCents === p} disabled={p > maxCents || p < minCents} onPress={() => set(p)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Quick({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.quick, disabled && styles.off, pressed && styles.pressed]}>
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  label: { color: colors.textMuted, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, minHeight: 48 },
  prefix: { color: colors.chip, fontWeight: '800', fontSize: 16, marginRight: 6 },
  input: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'], paddingVertical: 8 },
  quick: { minWidth: 48, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  quickText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  off: { opacity: 0.35 },
  pressed: { opacity: 0.8 },
});
