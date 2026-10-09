import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { amountSchema, clientSeedSchema, registerSchema, type ErrorCode, type User } from '@risky-chess/shared';
import type { Services } from '../platform';

/** The account a bearer token resolved to, attached by `requireUser`. */
type AuthedRequest = Request & { user: User };

const STATUS: Partial<Record<ErrorCode, number>> = {
  AUTH_REQUIRED: 401,
  USERNAME_TAKEN: 409,
  USERNAME_INVALID: 400,
  INVALID_PAYLOAD: 400,
  INSUFFICIENT_FUNDS: 402,
  GAME_NOT_FOUND: 404,
};

const sendError = (res: Response, error: ErrorCode, message: string) => res.status(STATUS[error] ?? 400).json({ ok: false, error, message });

/**
 * Account and wallet endpoints. Anything real-time stays on the socket;
 * these are plain request/response reads and the mock top-up.
 */
export function routes(services: Services): Router {
  const { auth, wallet, users, ledger, archive, bets, fairness } = services;
  const r = Router();
  r.use(express.json({ limit: '64kb' }));

  const requireUser = (req: Request, res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    const user = auth.authenticate(token);
    if (!user) return sendError(res, 'AUTH_REQUIRED', 'Sign in first');
    (req as AuthedRequest).user = user;
    next();
  };
  const me = (req: Request) => (req as AuthedRequest).user;

  r.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  r.post('/auth/register', (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 'USERNAME_INVALID', parsed.error.issues[0]?.message ?? 'Invalid username');
    const out = auth.register(parsed.data.username);
    if (!out.ok) return sendError(res, out.error, out.message);
    res.json({ ok: true, data: out.data });
  });

  r.get('/me', requireUser, (req, res) => {
    const user = users.byId(me(req).id)!;
    res.json({ ok: true, data: { user, stats: users.stats(user.id), seeds: fairness.current(user.id) } });
  });

  r.post('/wallet/deposit', requireUser, (req, res) => {
    const parsed = amountSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 'INVALID_PAYLOAD', 'Invalid amount');
    res.json({ ok: true, data: { balanceCents: wallet.deposit(me(req).id, parsed.data.amountCents) } });
  });

  r.post('/wallet/withdraw', requireUser, (req, res) => {
    const parsed = amountSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 'INVALID_PAYLOAD', 'Invalid amount');
    const out = wallet.withdraw(me(req).id, parsed.data.amountCents);
    if (out === 'INSUFFICIENT_FUNDS') return sendError(res, 'INSUFFICIENT_FUNDS', 'Not enough in your balance');
    res.json({ ok: true, data: { balanceCents: out } });
  });

  r.get('/wallet/transactions', requireUser, (req, res) => {
    res.json({ ok: true, data: ledger.transactions(me(req).id) });
  });

  r.get('/me/games', requireUser, (req, res) => {
    res.json({ ok: true, data: archive.gamesOf(me(req).id) });
  });

  r.get('/me/bets', requireUser, (req, res) => {
    const gameId = typeof req.query.gameId === 'string' ? req.query.gameId : undefined;
    res.json({ ok: true, data: bets.matchBetsOf(me(req).id, gameId ? { gameId } : {}) });
  });

  r.get('/me/rounds', requireUser, (req, res) => {
    res.json({ ok: true, data: bets.roundsOf(me(req).id) });
  });

  r.get('/me/seeds', requireUser, (req, res) => {
    const id = me(req).id;
    res.json({ ok: true, data: { current: fairness.current(id), history: fairness.history(id) } });
  });

  r.post('/me/seeds/rotate', requireUser, (req, res) => {
    res.json({ ok: true, data: fairness.rotate(me(req).id) });
  });

  r.post('/me/seeds/client', requireUser, (req, res) => {
    const parsed = clientSeedSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 'INVALID_PAYLOAD', '4–64 letters, digits, - or _');
    res.json({ ok: true, data: fairness.setClientSeed(me(req).id, parsed.data.clientSeed) });
  });

  r.get('/games/:id', requireUser, (req, res) => {
    const game = archive.game(String(req.params.id));
    if (!game) return sendError(res, 'GAME_NOT_FOUND', 'No such finished game');
    res.json({ ok: true, data: game });
  });

  r.get('/leaderboard', (_req, res) => {
    res.json({ ok: true, data: users.leaderboard() });
  });

  return r;
}
