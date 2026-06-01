import { captureError } from './monitoring'

type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  timestamp: string
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  }
  if (level === 'error') {
    console.error(`[${entry.timestamp}] ${message}`, context || '')
    captureError(new Error(message), context)
  } else if (level === 'warn') {
    console.warn(`[${entry.timestamp}] ${message}`, context || '')
  } else {
    console.log(`[${entry.timestamp}] ${message}`, context || '')
  }
}

export const logger = {
  info:  (msg: string, ctx?: Record<string, unknown>) => log('info',  msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => log('warn',  msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
}

export default logger
