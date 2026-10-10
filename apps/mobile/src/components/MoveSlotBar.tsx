import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { MoveSlot, ResolvedMove } from '@risky-chess/shared';
import type { SlotEvent } from '../hooks/useMoveSelection';
import { haptics } from '../lib/haptics';
import { playSfx } from '../lib/sfx';
import { colors, slotColor } from '../lib/theme';

interface Props {
  slots: Record<MoveSlot, ResolvedMove | null>;
  /** The slot the next pick fills; it pulses. */
  armed: MoveSlot | null;
  filled: SlotEvent | null;
  rejected: SlotEvent | null;
  forced: boolean;
  /** False while it isn't this player's turn (or a reveal is running). */
  active: boolean;
  canSubmit: boolean;
  /** Submitted and waiting for the server: everything freezes. */
  locked: boolean;
  onArm: (slot: MoveSlot) => void;
  onClear: (slot: MoveSlot) => void;
  onSubmit: () => void;
  /** Mode text on each chip (odds, payout). */
  badge?: (slot: MoveSlot) => ReactNode;
  /** Replaces the submit label (e.g. an All-In declaration). */
  submitLabel?: string | null;
  /** Hides slot B (a single-move declaration). */
  singleSlot?: boolean;
}

export function MoveSlotBar({ slots, armed, filled, rejected, forced, active, canSubmit, locked, onArm, onClear, onSubmit, badge, submitLabel, singleSlot }: Props) {
  const submit = () => {
    playSfx('lock');
    haptics.light();
    onSubmit();
  };
  const label = locked
    ? '🔒 Locked in…'
    : submitLabel
      ? submitLabel
      : forced
      ? `Play forced move${slots.A ? `: ${slots.A.san}` : ''}`
      : slots.A && slots.B
        ? `Toss: ${slots.A.san} or ${slots.B.san}`
        : 'Pick two moves';

  return (
    <View style={styles.wrap}>
      {forced ? (
        <Text style={styles.forced}>Only one legal move: it plays without a coin toss.</Text>
      ) : (
        <View style={styles.row}>
          {(singleSlot ? (['A'] as const) : (['A', 'B'] as const)).map((slot) => (
            <SlotChip
              key={slot}
              slot={slot}
              move={slots[slot]}
              armed={active && !locked && armed === slot}
              disabled={!active || locked}
              locked={locked}
              filledN={filled?.slot === slot ? filled.n : 0}
              rejectedN={rejected?.slot === slot ? rejected.n : 0}
              onArm={onArm}
              onClear={onClear}
              badge={badge?.(slot)}
            />
          ))}
        </View>
      )}
      <Pressable
        disabled={!canSubmit || locked}
        onPress={submit}
        accessibilityRole="button"
        style={[styles.submit, (!canSubmit || locked) && styles.disabled]}
      >
        <Text numberOfLines={1} style={styles.submitText}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

interface ChipProps {
  slot: MoveSlot;
  move: ResolvedMove | null;
  armed: boolean;
  disabled: boolean;
  locked: boolean;
  filledN: number;
  rejectedN: number;
  onArm: (slot: MoveSlot) => void;
  onClear: (slot: MoveSlot) => void;
  badge?: ReactNode;
}

function SlotChip({ slot, move, armed, disabled, locked, filledN, rejectedN, onArm, onClear, badge }: ChipProps) {
  const reduceMotion = useReducedMotion();
  const glow = useSharedValue(0);
  const shake = useSharedValue(0);
  const pop = useSharedValue(1);

  useEffect(() => {
    if (armed && !reduceMotion) glow.value = withRepeat(withTiming(1, { duration: 650 }), -1, true);
    else {
      cancelAnimation(glow);
      glow.value = armed ? 1 : 0;
    }
  }, [armed, reduceMotion, glow]);

  useEffect(() => {
    if (!rejectedN || reduceMotion) return;
    shake.value = withSequence(
      withTiming(-8, { duration: 40 }),
      withTiming(8, { duration: 60 }),
      withTiming(-5, { duration: 50 }),
      withTiming(0, { duration: 40 }),
    );
  }, [rejectedN, reduceMotion, shake]);

  useEffect(() => {
    if (!filledN || reduceMotion) return;
    pop.value = withSequence(withTiming(1.06, { duration: 70 }), withSpring(1, { damping: 12, stiffness: 300 }));
  }, [filledN, reduceMotion, pop]);

  const chipStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }, { scale: pop.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.08 + glow.value * 0.2 }));
  const color = slotColor(slot);

  return (
    <Animated.View style={[styles.slotWrap, chipStyle, locked && styles.locked]}>
      <Pressable
        disabled={disabled}
        onPress={() => onArm(slot)}
        onLongPress={move ? () => onClear(slot) : undefined}
        accessibilityLabel={move ? `Move ${slot}: ${move.san}. Tap to replace, long-press to clear` : `Move ${slot}: empty`}
        style={[styles.slot, { borderColor: color }]}
      >
        {armed && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glow, { backgroundColor: color }, glowStyle]} />}
        <Text style={[styles.slotLabel, { color }]}>{slot}</Text>
        <Text numberOfLines={1} style={move ? styles.san : styles.placeholder}>
          {move ? move.san : armed ? 'pick on board' : 'empty'}
        </Text>
        {badge}
        {locked ? (
          <Text style={styles.clear}>🔒</Text>
        ) : move && !disabled ? (
          <Pressable hitSlop={12} onPress={() => onClear(slot)} accessibilityLabel={`Clear move ${slot}`}>
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  slotWrap: { flex: 1 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  glow: { borderRadius: 8 },
  locked: { opacity: 0.6 },
  slotLabel: { fontWeight: '900', fontSize: 16 },
  san: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 },
  placeholder: { color: colors.textMuted, fontSize: 14, flex: 1 },
  clear: { color: colors.textMuted, fontSize: 14 },
  forced: { color: colors.slotA, textAlign: 'center', fontWeight: '600' },
  submit: {
    backgroundColor: colors.slotA,
    borderRadius: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  submitText: { color: '#111', fontWeight: '800', fontSize: 17 },
});
