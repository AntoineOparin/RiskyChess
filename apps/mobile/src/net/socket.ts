import Constants from 'expo-constants';
import { io, type Socket } from 'socket.io-client';
import type { Ack, AckFn, ClientToServerEvents, ServerToClientEvents } from '@risky-chess/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_PORT = 3001;
const ACK_TIMEOUT_MS = 8000;

/**
 * EXPO_PUBLIC_SERVER_URL wins; otherwise reuse the dev machine's host from
 * Metro so simulators and devices on the same LAN reach the local server.
 */
function resolveServerUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_SERVER_URL;
  if (explicit) return explicit;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:${SERVER_PORT}`;
}

export const SERVER_URL = resolveServerUrl();

let socket: GameSocket | null = null;
export function getSocket(): GameSocket {
  socket ??= io(SERVER_URL, { transports: ['websocket'] });
  return socket;
}

type AckData<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[1] extends AckFn<infer T> ? T : never;
export type ClientAck<T> = Ack<T> | { ok: false; error: 'NETWORK'; message: string };

/** Emits with an ack and a timeout; a timeout resolves as a NETWORK error instead of hanging. */
export function request<E extends keyof ClientToServerEvents>(
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<ClientAck<AckData<E>>> {
  return new Promise((resolve) => {
    (getSocket() as unknown as Socket)
      .timeout(ACK_TIMEOUT_MS)
      .emit(event, payload, (err: Error | null, res: Ack<AckData<E>>) => {
        resolve(err ? { ok: false, error: 'NETWORK', message: 'Server did not respond' } : res);
      });
  });
}
