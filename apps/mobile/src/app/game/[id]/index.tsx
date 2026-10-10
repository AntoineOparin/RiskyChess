import { useState } from 'react';
import { isClassic } from '@risky-chess/shared';
import { ActivityIndicator, Platform, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { GameView } from '../../../components/GameView';
import { RulesSheet } from '../../../components/RulesSheet';
import { Button } from '../../../components/ui';
import { useNow } from '../../../hooks/useNow';
import { useOnlineGame } from '../../../hooks/useOnlineGame';
import { colors } from '../../../lib/theme';

export default function OnlineGame() {
  const { id, joined } = useLocalSearchParams<{ id: string; joined?: string }>();
  const game = useOnlineGame(id);
  const { session, color } = game;
  const now = useNow(game.opponentGraceEndsAt !== null);
  // A joiner didn't pick the table: show its rules once, before the first move.
  const [rulesSeen, setRulesSeen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (!session || !color) {
    return (
      <View style={styles.center}>
        {game.error ? <Text style={styles.error}>{game.error}</Text> : <ActivityIndicator color={colors.slotA} />}
      </View>
    );
  }

  if (session.status === 'waiting_for_opponent') {
    const share = async () => {
      // Share sheets don't exist on the web; copying the code is the next best thing.
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(session.id);
        setCopied(true);
        return;
      }
      await Share.share({ message: `Join my Risky Chess game: ${session.id}` });
    };
    // Resigning an unjoined game just takes it down.
    const cancel = async () => {
      setCancelling(true);
      await game.resign();
      setCancelling(false);
      router.back();
    };
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Share this code with your opponent</Text>
        <Text style={styles.code} selectable>
          {session.id}
        </Text>
        <Button label={copied ? 'Copied!' : Platform.OS === 'web' ? 'Copy code' : 'Share code'} onPress={() => void share()} />
        <ActivityIndicator color={colors.slotA} />
        <Button label="Cancel" variant="ghost" onPress={() => void cancel()} loading={cancelling} />
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
    <>
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
        onSubmit={(a, b, extras) => void game.submit(a, b, extras)}
        onOpenFairness={() => router.push({ pathname: '/game/[id]/fairness', params: { id: session.id } })}
        onResign={() => void game.resign()}
        outcomeAction={{ label: 'Back home', onPress: () => router.replace('/') }}
        table={{
          gameId: session.id,
          rules: session.rules,
          modeState: session.modeState,
          turnNumber: session.turnNumber,
          online: true,
        }}
      />
      <RulesSheet
        visible={joined === '1' && !rulesSeen && !isClassic(session.rules) && session.history.length === 0 && !session.outcome}
        rules={session.rules}
        closeLabel="I'm in"
        onClose={() => setRulesSeen(true)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 },
  muted: { color: colors.textMuted, textAlign: 'center' },
  code: { color: colors.text, fontSize: 44, fontWeight: '900', letterSpacing: 8 },
  error: { color: colors.danger, textAlign: 'center' },
});
