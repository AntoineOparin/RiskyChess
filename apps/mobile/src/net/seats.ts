import * as SecureStore from 'expo-secure-store';
import type { SeatGrant } from '@risky-chess/shared';

// The player token is the only credential for a seat, so it lives in the keychain.
const key = (gameId: string) => `seat_${gameId}`;

export async function saveSeat(seat: SeatGrant): Promise<void> {
  await SecureStore.setItemAsync(key(seat.gameId), JSON.stringify(seat));
}

export async function loadSeat(gameId: string): Promise<SeatGrant | null> {
  const raw = await SecureStore.getItemAsync(key(gameId));
  return raw ? (JSON.parse(raw) as SeatGrant) : null;
}
