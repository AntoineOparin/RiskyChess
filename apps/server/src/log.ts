/**
 * Leveled, scoped server logging: one line per event with a JSON context.
 * LOG_LEVEL = debug | info (default) | warn | error | silent. Silent under
 * the test runner unless LOG_LEVEL is set. Never pass secrets in a context:
 * in particular, a turn's server seed must not be logged before it is revealed.
 *
 *   const log = logger('game');
 *   log.info('created', { gameId, mode, rules });
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

function configured(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in RANK) return env as LogLevel;
  return process.env.VITEST ? 'silent' : 'info';
}

let min = configured();
/** Overrides LOG_LEVEL at runtime (tests, scripts). */
export const setLogLevel = (level: LogLevel) => {
  min = level;
};

function write(level: Exclude<LogLevel, 'silent'>, scope: string, msg: string, ctx?: Record<string, unknown>) {
  if (RANK[level] < RANK[min]) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${ctx ? ` ${safeJson(ctx)}` : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return '[unserializable]';
  }
}

export function logger(scope: string) {
  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => write('debug', scope, msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => write('info', scope, msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => write('warn', scope, msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => write('error', scope, msg, ctx),
  };
}

export const errorFields = (e: unknown): Record<string, unknown> =>
  e instanceof Error ? { error: e.message, stack: e.stack?.split('\n').slice(0, 8).join('\n') } : { error: String(e) };
