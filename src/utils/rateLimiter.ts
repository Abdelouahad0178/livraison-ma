// Rate limiting via localStorage — no backend required.
// Each "key" (e.g. "login:user@example.com") tracks its own attempt window.

const MAX_ATTEMPTS  = 5          // max failures before lockout
const WINDOW_MS     = 10 * 60 * 1000  // 10-minute sliding window
const LOCKOUT_MS    = 5  * 60 * 1000  // 5-minute lockout after MAX_ATTEMPTS

function storageKey(key: any) {
  return `rl_${key}`
}

function load(key: any) {
  try {
    const raw = localStorage.getItem(storageKey(key))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function save(key: any, data: any) {
  try { localStorage.setItem(storageKey(key), JSON.stringify(data)) } catch {}
}

function clear(key: any) {
  try { localStorage.removeItem(storageKey(key)) } catch {}
}

/**
 * Call before an action. Returns:
 *   { allowed: true }                          — proceed
 *   { allowed: false, retryAfter: <ms> }       — locked out
 */
export function checkRateLimit(key: any) {
  const now  = Date.now()
  const data = load(key)

  if (!data) return { allowed: true }

  // Still in hard lockout?
  if (data.lockedUntil && now < data.lockedUntil) {
    return { allowed: false, retryAfter: data.lockedUntil - now }
  }

  // Slide the window — drop attempts older than WINDOW_MS
  const recent = (data.attempts || []).filter((t: any) => now - t < WINDOW_MS)

  if (recent.length >= MAX_ATTEMPTS) {
    const lockedUntil = now + LOCKOUT_MS
    save(key, { ...data, attempts: recent, lockedUntil })
    return { allowed: false, retryAfter: LOCKOUT_MS }
  }

  return { allowed: true }
}

/**
 * Record a failed attempt.
 */
export function recordFailure(key: any) {
  const now  = Date.now()
  const data = load(key) || {}
  const recent = ((data.attempts || []).filter((t: any) => now - t < WINDOW_MS))
  recent.push(now)

  const lockedUntil = recent.length >= MAX_ATTEMPTS ? now + LOCKOUT_MS : (data.lockedUntil || 0)
  save(key, { attempts: recent, lockedUntil })
}

/**
 * Clear the rate limit after a successful action.
 */
export function clearRateLimit(key: any) {
  clear(key)
}

/**
 * Human-readable countdown string from ms.
 */
export function formatRetryAfter(ms: any) {
  const secs = Math.ceil(ms / 1000)
  if (secs >= 60) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return s > 0 ? `${m}m ${s}s` : `${m} min`
  }
  return `${secs}s`
}
