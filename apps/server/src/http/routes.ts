import { Router } from 'express';

export function routes(): Router {
  const r = Router();
  r.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  return r;
}
