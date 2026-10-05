import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Color } from '@risky-chess/shared';
import { GameView } from '../components/GameView';
import { useLocalBotGame } from '../hooks/useLocalBotGame';

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
        outcomeAction={{ label: 'Play again', onPress: game.restart }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
