const KEY = 'nc-carrom-2026.session'

/** The stored session, or null if there isn't a usable one. */
export function readSession() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    if (!session?.token) return null
    // expires_at is unix seconds; drop it a minute early to avoid a race.
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
      localStorage.removeItem(KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    /* private mode - the session just won't survive a reload */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}

export const getToken = () => readSession()?.token ?? null
