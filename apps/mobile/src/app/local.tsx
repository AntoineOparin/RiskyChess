import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Color } from '@risky-chess/shared';
import { GameView } from '../components/GameView';
import { useLocalBotGame } from '../hooks/useLocalBotGame';
import { colors } from '../lib/theme';

export default function LocalGame() {
  const [color] = useState<Color>(() => (Math.random() < 0.5 ? 'w' : 'b'));
  const game = useLocalBotGame(color);

  return (
    <View style={styles.flex}>
      <GameView
        fen={game.fen}
        myColor={color}
        history={game.history}
        myTurn={game.myTurn}
        outcome={game.outcome}
        names={{ me: `You (${color === 'w' ? 'White' : 'Black'})`, opponent: 'RiskyBot' }}
        error={game.error}
        onSubmit={game.play}
        onResign={game.resign}
      />
      {game.outcome && (
        <Pressable onPress={game.restart} style={styles.again}>
          <Text style={styles.againText}>Play again</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  again: { margin: 16, backgroundColor: colors.slotA, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  againText: { color: '#111', fontWeight: '800', fontSize: 16 },
});
