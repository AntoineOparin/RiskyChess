import { useState } from 'react';
import { formatCents, isClassic } from '@risky-chess/shared';
import { ActivityIndicator, Platform, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { GameView } from '../../../components/GameView';
import { RulesSheet } from '../../../components/RulesSheet';
import { Button, Money } from '../../../components/ui';
import { useNow } from '../../../hooks/useNow';
import { useOnlineGame } from '../../../hooks/useOnlineGame';
import { colors, type as t } from '../../../lib/theme';
import { request } from '../../../net/socket';

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
      const message = `Join my Risky Chess table: ${session.id}`;
      // Share sheets don't exist on the web; copying the code is the next best thing.
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(session.id);
        setCopied(true);
        return;
      }
      await Share.share({ message });
    };
    const cancel = async () => {
      setCancelling(true);
      const res = await request('cancel_table', { gameId: session.id });
      setCancelling(false);
      if (res.ok) router.back();
    };
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{session.visibility === 'public' ? 'Listed in the lobby. Or share this code:' : 'Share this code with your opponent'}</Text>
        <Text style={styles.code} selectable>
          {session.id}
        </Text>
        {session.buyInCents > 0 && (
          <Text style={styles.muted}>
            Your buy-in of <Money cents={session.buyInCents} size="sm" /> is held until the game ends.
          </Text>
        )}
        <Button label={copied ? 'Copied!' : Platform.OS === 'web' ? 'Copy code' : 'Share code'} onPress={() => void share()} />
        <ActivityIndicator color={colors.slotA} />
        <Button label={session.buyInCents > 0 ? `Cancel table · refund ${formatCents(session.buyInCents)}` : 'Cancel table'} variant="ghost" onPress={() => void cancel()} loading={cancelling} />
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
        outcomeAction={{ label: 'Back to the casino', onPress: () => router.replace('/(tabs)') }}
        table={{
          gameId: session.id,
          rules: session.rules,
          wallet: session.wallet,
          modeState: session.modeState,
          turnNumber: session.turnNumber,
          online: true,
          placeBet: game.placeBet,
          chipValueCents: session.chipValueCents > 0 ? session.chipValueCents : undefined,
          settlement: session.settlement,
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
  muted: { color: colors.textMuted, textAlign: 'center', fontSize: t.body },
  code: { color: colors.text, fontSize: 44, fontWeight: '900', letterSpacing: 8 },
  error: { color: colors.danger, textAlign: 'center' },
});
