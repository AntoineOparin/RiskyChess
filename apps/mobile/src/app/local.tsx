import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MODE_IDS, type Color, type GameRules, type ModeId } from '@risky-chess/shared';
import { GameView } from '../components/GameView';
import { useLocalBotGame } from '../hooks/useLocalBotGame';

export default function LocalGame() {
  const { modes } = useLocalSearchParams<{ modes?: string }>();
  const rules: GameRules = useMemo(
    () => ({ modes: (modes ?? '').split(',').filter((m): m is ModeId => (MODE_IDS as readonly string[]).includes(m)) }),
    [modes],
  );
  const [color] = useState<Color>(() => (Math.random() < 0.5 ? 'w' : 'b'));
  const game = useLocalBotGame(color, rules);

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
        table={{
          gameId: 'local',
          rules,
          wallet: game.wallet,
          modeState: game.modeState,
          turnNumber: game.history.length + 1,
          online: false,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
