import { createApp } from './app';
import { logger } from './log';

const log = logger('server');

const port = Number(process.env.PORT ?? 3001);
const { http } = createApp();
http.listen(port, () => {
  log.info('listening', { port, logLevel: process.env.LOG_LEVEL ?? 'info' });
});
