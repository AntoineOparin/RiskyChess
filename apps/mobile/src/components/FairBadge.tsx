import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { verifyToss } from '@risky-chess/engine';
import type { TurnResult } from '@risky-chess/shared';
import { logger } from '../lib/log';
import { colors } from '../lib/theme';

const log = logger('fairness');

/**
 * Checks a toss on this device: ✓ Verified when the revealed seed matches the
 * commitment and recomputes the roll, ⚠ Mismatch otherwise. Offline coins say
 * so instead of pretending.
 */
export function FairBadge({ result, onPress }: { result: TurnResult; onPress?: (() => void) | undefined }) {
  const check = useMemo(() => {
    if (result.coin?.method !== 'hmac-commit-reveal') return null;
    const v = verifyToss(result);
    if (!v.ok) log.error('toss failed verification', { reason: v.reason, gameId: result.gameId, turnNumber: result.turnNumber, coin: result.coin, odds: result.odds });
    return v;
  }, [result]);
  const [label, style] = !check ? ['Local coin: not verifiable', styles.local] : check.ok ? ['✓ Verified', styles.ok] : ['⚠ Mismatch', styles.bad];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={8}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={check && !check.ok ? `Toss mismatch: ${check.reason}` : label}
    >
      <Text style={[styles.badge, style]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  ok: { color: colors.success },
  bad: { color: colors.danger },
  local: { color: colors.textMuted },
});
