import { StyleSheet, Text } from 'react-native';
import type { Color, PieceSymbol } from '@risky-chess/shared';

// Filled glyphs for both sides, recolored; U+FE0E keeps iOS from rendering emoji.
const GLYPHS: Record<PieceSymbol, string> = {
  k: '♚︎',
  q: '♛︎',
  r: '♜︎',
  b: '♝︎',
  n: '♞︎',
  p: '♟︎',
};

export function Piece({ type, color, size }: { type: PieceSymbol; color: Color; size: number }) {
  return (
    <Text
      allowFontScaling={false}
      style={[
        styles.glyph,
        { fontSize: size * 0.78, lineHeight: size, width: size, height: size },
        color === 'w' ? styles.white : styles.black,
      ]}
    >
      {GLYPHS[type]}
    </Text>
  );
}

const styles = StyleSheet.create({
  glyph: { textAlign: 'center', includeFontPadding: false },
  white: { color: '#FFFFFF', textShadowColor: '#000', textShadowRadius: 2, textShadowOffset: { width: 0, height: 0 } },
  black: { color: '#1A1A1A', textShadowColor: '#FFF', textShadowRadius: 1, textShadowOffset: { width: 0, height: 0 } },
});
