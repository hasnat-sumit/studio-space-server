/**
 * Minimal dependency-free logger.
 * Level is read from LOG_LEVEL (debug | info | warn | error), defaulting to info.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel = readConfiguredLevel();
const threshold: number = LEVEL_WEIGHT[configuredLevel] ?? LEVEL_WEIGHT.info;

function readConfiguredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').trim().toLowerCase();
  return raw in LEVEL_WEIGHT ? (raw as LogLevel) : 'info';
}

function format(level: LogLevel, message: string): string {
  const stamp = new Date().toISOString().toUpperCase();
  return `[${stamp}] ${level.toUpperCase().padEnd(5)} ${message}`;
}

function write(level: LogLevel, message: string, ...args: unknown[]): void {
  if (LEVEL_WEIGHT[level] < threshold) return;

  const line = format(level, message);
  switch (level) {
    case 'debug':
      console.debug(line, ...args);
      break;
    case 'info':
      console.info(line, ...args);
      break;
    case 'warn':
      console.warn(line, ...args);
      break;
    case 'error':
      console.error(line, ...args);
      break;
  }
}

const logger = {
  debug: (message: string, ...args: unknown[]): void => write('debug', message, ...args),
  info: (message: string, ...args: unknown[]): void => write('info', message, ...args),
  warn: (message: string, ...args: unknown[]): void => write('warn', message, ...args),
  error: (message: string, ...args: unknown[]): void => write('error', message, ...args),
};

export default logger;
