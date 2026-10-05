import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { GameView } from '../../components/GameView';
import { useOnlineGame } from '../../hooks/useOnlineGame';
import { colors } from '../../lib/theme';

/** Re-renders every second while a countdown is visible. */
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export default function OnlineGame() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = useOnlineGame(id);
  const { session, color } = game;
  const now = useNow(game.opponentGraceEndsAt !== null);

  if (!session || !color) {
    return (
      <View style={styles.center}>
        {game.error ? <Text style={styles.error}>{game.error}</Text> : <ActivityIndicator color={colors.slotA} />}
      </View>
    );
  }

  if (session.status === 'waiting_for_opponent') {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Share this code with your opponent</Text>
        <Text style={styles.code}>{session.id}</Text>
        <Pressable style={styles.share} onPress={() => void Share.share({ message: `Join my Gamble Chess game: ${session.id}` })}>
          <Text style={styles.shareText}>Share code</Text>
        </Pressable>
        <ActivityIndicator color={colors.slotA} />
      </View>
    );
  }

  const opp = session.players[color === 'w' ? 'b' : 'w'];
  const banner = !game.connected
    ? 'Reconnecting…'
    : game.opponentGraceEndsAt
      ? `${opp?.displayName ?? 'Opponent'} disconnected: forfeits in ${Math.max(0, Math.ceil((game.opponentGraceEndsAt - now) / 1000))}s`
      : null;

  return (
    <GameView
      fen={session.fen}
      myColor={color}
      history={session.history}
      myTurn={session.status === 'awaiting_submission' && session.turn === color && game.connected}
      outcome={session.outcome}
      names={{ me: `${session.players[color]?.displayName ?? 'You'} (you)`, opponent: opp?.displayName ?? 'Opponent' }}
      banner={banner}
      submitting={game.submitting}
      error={game.error}
      onSubmit={(a, b) => void game.submit(a, b)}
      onResign={() => void game.resign()}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 },
  muted: { color: colors.textMuted },
  code: { color: colors.text, fontSize: 44, fontWeight: '900', letterSpacing: 8 },
  share: { backgroundColor: colors.slotA, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  shareText: { color: '#111', fontWeight: '800' },
  error: { color: colors.danger, textAlign: 'center' },
});
