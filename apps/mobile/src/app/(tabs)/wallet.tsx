import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { DEPOSIT_PRESETS_CENTS, type Transaction, type TxKind } from '@risky-chess/shared';
import { Button, Card, EmptyState, ListRow, Money, Screen, SectionHeader, Sheet, StakeInput } from '../../components/ui';
import { colors, type as t } from '../../lib/theme';
import { api, ApiError } from '../../net/api';
import { refreshMe } from '../../net/presence';
import { useWalletStore } from '../../state/walletStore';

const KIND_LABEL: Record<TxKind, string> = {
  bonus: 'Welcome bonus',
  deposit: 'Top-up',
  withdraw: 'Withdrawal',
  buy_in: 'Table buy-in',
  refund: 'Buy-in refunded',
  cashout: 'Table cashout',
  rake: 'Rake',
  bet_stake: 'Sportsbook stake',
  bet_payout: 'Sportsbook payout',
  bet_refund: 'Sportsbook refund',
  original_stake: 'Originals stake',
  original_payout: 'Originals payout',
};

/** Balance, mock top-ups and the ledger. Nothing here touches real money. */
export default function Wallet() {
  const balance = useWalletStore((s) => s.balanceCents);
  const transactions = useWalletStore((s) => s.transactions);
  const [sheet, setSheet] = useState<'deposit' | 'withdraw' | null>(null);
  const [amount, setAmount] = useState(DEPOSIT_PRESETS_CENTS[1] ?? 1_000);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      useWalletStore.getState().setTransactions(await api<Transaction[]>('/wallet/transactions'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const submit = async () => {
    if (!sheet) return;
    setBusy(true);
    setError(null);
    try {
      const out = await api<{ balanceCents: number }>(`/wallet/${sheet}`, { body: { amountCents: amount } });
      useWalletStore.getState().setBalance(out.balanceCents);
      setSheet(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      scroll
      contentStyle={styles.content}
    >
      <Text style={styles.title}>Wallet</Text>
      <Card>
        <Text style={styles.label}>Balance</Text>
        <Money cents={balance ?? 0} size="xl" />
        <View style={styles.actions}>
          <Button label="Top up" onPress={() => setSheet('deposit')} style={styles.grow} />
          <Button label="Withdraw" variant="secondary" onPress={() => setSheet('withdraw')} style={styles.grow} />
        </View>
        <Text style={styles.hint}>Mock top-ups: chips are play money and never cost anything.</Text>
      </Card>

      <SectionHeader title="Transactions" action={{ label: 'Refresh', onPress: () => void load() }} />
      {error && <Text style={styles.error}>{error}</Text>}
      {transactions.length === 0 ? (
        <EmptyState title="No activity yet" />
      ) : (
        transactions.map((tx) => (
          <ListRow
            key={tx.id}
            title={KIND_LABEL[tx.kind] ?? tx.kind}
            subtitle={`${new Date(tx.createdAt).toLocaleString()}${tx.ref ? ` · ${tx.ref.id.slice(0, 8)}` : ''}`}
            right={
              <View style={styles.amount}>
                <Money cents={tx.amountCents} sign tone="auto" />
                <Text style={styles.after}>
                  <Money cents={tx.balanceAfterCents} size="sm" tone="muted" />
                </Text>
              </View>
            }
          />
        ))
      )}
      <RefreshControl
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void Promise.all([load(), refreshMe()]).finally(() => setRefreshing(false));
        }}
      />

      <Sheet
        visible={sheet !== null}
        title={sheet === 'deposit' ? 'Top up' : 'Withdraw'}
        onClose={() => setSheet(null)}
        footer={<Button label={sheet === 'deposit' ? 'Add chips' : 'Withdraw chips'} onPress={() => void submit()} loading={busy} disabled={amount <= 0} />}
      >
        <StakeInput valueCents={amount} onChange={setAmount} minCents={100} maxCents={sheet === 'withdraw' ? (balance ?? 0) : 10_000_000} presets={DEPOSIT_PRESETS_CENTS} label="Amount" />
        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.hint}>{sheet === 'deposit' ? 'No card, no bank: the house simply mints play chips.' : 'Withdrawals just remove chips from your balance.'}</Text>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  title: { color: colors.text, fontSize: t.h1, fontWeight: '900', marginTop: 8 },
  label: { color: colors.textMuted, fontSize: t.small, fontWeight: '700', textTransform: 'uppercase' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  grow: { flex: 1 },
  hint: { color: colors.textMuted, fontSize: t.tiny, marginTop: 10 },
  error: { color: colors.danger },
  amount: { alignItems: 'flex-end' },
  after: { marginTop: 2 },
});
