/**
 * Shared plugin logger.
 * Supports banner output, log levels, and console formatting placeholders.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface RecentSonaLogEntry {
  at: number
  level: LogLevel
  message: string
}

interface LoggerOptions {
  /** Plugin name. */
  name: string
  /** Plugin version. */
  version: string
  /** Name badge background color. */
  primaryColor?: string
  /** Version badge background color. */
  accentColor?: string
}

const LEVEL_CONFIG: Record<LogLevel, { badge: string; color: string; method: keyof Console }> = {
  info:  { badge: 'INFO',  color: '#43b581', method: 'log'   },
  warn:  { badge: 'WARN',  color: '#faa61a', method: 'warn'  },
  error: { badge: 'ERROR', color: '#f04747', method: 'error' },
  debug: { badge: 'DEBUG', color: '#7289da', method: 'debug' },
}

const RECENT_LOG_LIMIT = 200
const recentLogs: RecentSonaLogEntry[] = []
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+\b/gi

function redactString(value: string) {
  return value
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(JWT_PATTERN, '[REDACTED_JWT]')
}

function truncate(value: string, limit = 800) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value
}

function stringifyForDebug(value: unknown): string {
  if (typeof value === 'string') return truncate(redactString(value))
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  if (value instanceof Error) return truncate(redactString(`${value.name}: ${value.message}`))
  if (typeof value === 'undefined') return 'undefined'
  if (typeof value === 'function') return '[Function]'
  if (Array.isArray(value)) return `[Array(${value.length})]`

  if (typeof value === 'object') {
    const ctorName = value.constructor?.name || 'Object'
    const keys = Object.keys(value as Record<string, unknown>).slice(0, 12)
    return keys.length > 0 ? `[${ctorName} keys=${keys.join(',')}]` : `[${ctorName}]`
  }

  return Object.prototype.toString.call(value)
}

function pushRecentLog(level: LogLevel, message: string, args: unknown[]) {
  recentLogs.push({
    at: Date.now(),
    level,
    message: [message, ...args.map(stringifyForDebug)].join(' '),
  })

  if (recentLogs.length > RECENT_LOG_LIMIT) {
    recentLogs.splice(0, recentLogs.length - RECENT_LOG_LIMIT)
  }
}

export function getRecentSonaLogs(limit = 50): RecentSonaLogEntry[] {
  return recentLogs.slice(-limit)
}

export function createLogger(options: LoggerOptions) {
  const {
    name,
    version,
    primaryColor = '#66ccff',
    accentColor = '#43b581',
  } = options

  const prefix = `${name}`

  /** Print the styled banner. */
  function printBanner() {
    const nameStyle = [
      'color: #fff',
      `background: ${primaryColor}`,
      'padding: 4px 8px',
      'border-radius: 4px 0 0 4px',
      'font-weight: bold',
      'font-size: 14px',
    ].join(';')

    const versionStyle = [
      'color: #fff',
      `background: ${accentColor}`,
      'padding: 4px 8px',
      'border-radius: 0 4px 4px 0',
      'font-weight: bold',
      'font-size: 14px',
    ].join(';')

    console.log(
      `%c ${name} ଘ(੭ˊᵕˋ)੭* ੈ✩‧₊˚♫ %c v${version} `,
      nameStyle,
      versionStyle,
    )
  }

  /**
   * Log output with a level tag.
   * Supports native console formatting placeholders: %s, %d, %i, %f, %o, %O, %c.
   *
   * @example
   *   logger.info('loaded in %dms', 42)
   *   logger.warn('missing key: %s', key)
   *   logger.error('request failed %o', err)
   */
  function log(level: LogLevel, message: string, ...args: unknown[]) {
    const { badge, color, method } = LEVEL_CONFIG[level]
    pushRecentLog(level, message, args)

    const nameBadgeStyle = [
      'color: #fff',
      `background: ${primaryColor}`,
      'padding: 2px 6px',
      'border-radius: 3px 0 0 3px',
      'font-weight: bold',
      'font-size: 13px',
    ].join(';')

    const levelBadgeStyle = [
      'color: #fff',
      `background: ${color}`,
      'padding: 2px 6px',
      'border-radius: 0 3px 3px 0',
      'font-weight: bold',
      'font-size: 13px',
    ].join(';')

    const resetStyle = 'color: inherit; background: inherit;'

    // %c plugin name, %c level, %c body. Keep placeholders for the browser.
    ;(console[method] as (...a: unknown[]) => void)(
      `%c${prefix}%c${badge}%c ${message}`,
      nameBadgeStyle,
      levelBadgeStyle,
      resetStyle,
      ...args,
    )
  }

  return {
    printBanner,
    info:  (msg: string, ...args: unknown[]) => log('info',  msg, ...args),
    warn:  (msg: string, ...args: unknown[]) => log('warn',  msg, ...args),
    error: (msg: string, ...args: unknown[]) => log('error', msg, ...args),
    debug: (msg: string, ...args: unknown[]) => log('debug', msg, ...args),
  }
}
