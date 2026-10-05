/**
 * Scoped logging for debugging. Debug and info lines print in development
 * only; warnings and errors always print. The last 300 entries are kept in
 * memory (see recentLogs) so a bug report can include what led up to it.
 *
 *   const log = logger('online');
 *   log.debug('turn_resolved', { turnNumber: 4, executed: 'e2e4' });
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  at: number;
  level: LogLevel;
  scope: string;
  msg: string;
  ctx?: Record<string, unknown>;
}

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_PRINT: LogLevel = typeof __DEV__ !== 'undefined' && __DEV__ ? 'debug' : 'warn';
const BUFFER = 300;
const entries: LogEntry[] = [];

function write(level: LogLevel, scope: string, msg: string, ctx?: Record<string, unknown>) {
  const entry: LogEntry = { at: Date.now(), level, scope, msg, ...(ctx ? { ctx } : {}) };
  entries.push(entry);
  if (entries.length > BUFFER) entries.shift();
  if (RANK[level] < RANK[MIN_PRINT]) return;
  const line = `[${scope}] ${msg}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'info' ? console.info : console.log;
  if (ctx) out(line, ctx);
  else out(line);
}

export function logger(scope: string) {
  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => write('debug', scope, msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => write('info', scope, msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => write('warn', scope, msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => write('error', scope, msg, ctx),
  };
}

/** The most recent log entries, oldest first. */
export const recentLogs = (): readonly LogEntry[] => [...entries];

/** An Error as plain loggable fields. */
export const errorFields = (e: unknown): Record<string, unknown> =>
  e instanceof Error ? { error: e.message, stack: e.stack?.split('\n').slice(0, 6).join('\n') } : { error: String(e) };
