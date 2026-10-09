import { createApp } from './app';
import { openDb } from './db/db';
import { logger } from './log';

const log = logger('server');

const port = Number(process.env.PORT ?? 3001);
const dbPath = process.env.DB_PATH ?? 'data/risky.sqlite';
const { http } = createApp({ db: openDb(dbPath) });
http.listen(port, () => {
  log.info('listening', { port, dbPath, logLevel: process.env.LOG_LEVEL ?? 'info' });
});
