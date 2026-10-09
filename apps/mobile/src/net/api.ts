import type { ErrorCode } from '@risky-chess/shared';
import { useAuthStore } from '../state/authStore';
import { SERVER_URL } from './socket';

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode | 'NETWORK',
    message: string,
  ) {
    super(message);
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; message: string };

/**
 * JSON request to the platform API with the account's bearer token. Throws
 * ApiError on refusal or when the server can't be reached; screens render
 * the message.
 */
export async function api<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown; token?: string | null } = {}): Promise<T> {
  const token = init.token === undefined ? useAuthStore.getState().token : init.token;
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new ApiError('NETWORK', `Can't reach ${SERVER_URL}`);
  }
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!json) throw new ApiError('NETWORK', `Bad response (${res.status})`);
  if (!json.ok) throw new ApiError(json.error, json.message);
  return json.data;
}
