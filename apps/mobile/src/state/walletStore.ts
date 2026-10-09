import { create } from 'zustand';
import type { Transaction, UserStats } from '@risky-chess/shared';

interface WalletState {
  /** null until the first /me or balance_updated arrives. */
  balanceCents: number | null;
  stats: UserStats | null;
  transactions: Transaction[];
  setBalance(balanceCents: number): void;
  setStats(stats: UserStats): void;
  setTransactions(transactions: Transaction[]): void;
}

/** The account's money, mirrored from the server. The server is always right. */
export const useWalletStore = create<WalletState>()((set) => ({
  balanceCents: null,
  stats: null,
  transactions: [],
  setBalance: (balanceCents) => set({ balanceCents }),
  setStats: (stats) => set({ stats }),
  setTransactions: (transactions) => set({ transactions }),
}));
