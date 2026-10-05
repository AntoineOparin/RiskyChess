import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { allInProblem } from '@risky-chess/engine';
import { PIECE_VALUES, type PieceSymbol } from '@risky-chess/shared';
import { GLYPHS } from '../../components/Board/Piece';
import { colors } from '../../lib/theme';
import type { ModeUi, TableCtx } from '../types';

const glyph = (p: PieceSymbol) => GLYPHS[p];
const NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** The ALL IN toggle: only offered while slot A holds a capture that may be declared. */
function Panel({ ctx }: { ctx: TableCtx }) {
  const a = ctx.slots.A;
  const eligible = useMemo(() => !!a && ctx.canAct && !allInProblem(ctx.fen, a, ctx.modeState), [a, ctx.canAct, ctx.fen, ctx.modeState]);
  const on = !!ctx.extras.allIn;
  const { setExtras } = ctx;

  // Slot A changed to something that can't go All-In: drop the declaration.
  useEffect(() => {
    if (on && !eligible) setExtras({ allIn: undefined });
  }, [on, eligible, setExtras]);

  if (!eligible || !a?.captured) return null;
  const toggle = () => setExtras(on ? { allIn: undefined } : { allIn: true, stake: undefined, favor: undefined });
  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: on }}
        accessibilityLabel={`All-In on ${a.san}: win the ${NAMES[a.captured]} and an extra move, or lose your ${NAMES[a.piece]}`}
        style={[styles.toggle, on && styles.toggleOn]}
      >
        <Text style={[styles.toggleText, on && styles.toggleTextOn]}>ALL IN</Text>
      </Pressable>
      <Text style={styles.risk} numberOfLines={2}>
        {on ? (
          <>
            Risk {glyph(a.piece)} ({PIECE_VALUES[a.piece]}) → Win {glyph(a.captured)} ({PIECE_VALUES[a.captured]}) + extra move
          </>
        ) : (
          <>Bet {a.san} on one coin instead of a pair</>
        )}
      </Text>
    </View>
  );
}

export const allInUi: ModeUi = {
  title: 'All-In',
  pitch: 'Bet a capture on one 50/50 coin: win a bonus move or lose the piece.',
  risk: 3,
  bullets: [
    'Instead of a pair, declare one capture All-In.',
    'Win: the capture plays and you move again. Lose: your capturing piece is removed.',
    'Once per piece type per game. Never with the king.',
  ],
  Panel,
  describeEffect(e, me, turn) {
    if (e.kind !== 'all_in') return null;
    const mine = e.color === me;
    const who = mine ? '' : 'Opponent ';
    if (!e.won) return { text: `${who}ALL IN — LOST ${glyph(e.piece)}`, tone: mine ? 'big_bad' : 'big_good' };
    const taken = turn?.executed.captured;
    const text = `${who}ALL IN — WON${taken ? ` ${glyph(taken)}` : ''}${e.bonusPly ? ' + bonus move' : ''}`;
    return { text, tone: mine ? 'big_good' : 'big_bad' };
  },
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggle: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 2, borderColor: colors.danger, justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.danger },
  toggleText: { color: colors.danger, fontWeight: '900', letterSpacing: 1 },
  toggleTextOn: { color: '#fff' },
  risk: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
});
