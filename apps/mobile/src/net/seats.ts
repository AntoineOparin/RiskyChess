import type { SeatGrant } from '@risky-chess/shared';
import { storage } from '../lib/storage';

// The player token is the only credential for a seat: keychain on native, localStorage on the web.
const key = (gameId: string) => `seat_${gameId}`;

export async function saveSeat(seat: SeatGrant): Promise<void> {
  await storage.set(key(seat.gameId), JSON.stringify(seat));
}

export async function loadSeat(gameId: string): Promise<SeatGrant | null> {
  const raw = await storage.get(key(gameId));
  return raw ? (JSON.parse(raw) as SeatGrant) : null;
}
