import { getToken } from './auth'

const BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

async function request(path, { method = 'GET', body, authed = true } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'

  const token = authed ? getToken() : null
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    const error = new Error(
      'Cannot reach the tournament service. Is the FastAPI backend running on :8000?',
    )
    error.status = 0
    throw error
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const data = await response.json()
      if (typeof data.detail === 'string') detail = data.detail
      else if (Array.isArray(data.detail) && data.detail[0]?.msg) detail = data.detail[0].msg
    } catch {
      /* keep the generic message */
    }
    const error = new Error(detail)
    error.status = response.status
    throw error
  }

  return response.json()
}

export const api = {
  health: () => request('/health', { authed: false }),
  signIn: (username, password) =>
    request('/login', { method: 'POST', body: { username, password }, authed: false }),
  session: () => request('/session'),

  getState: () => request('/state'),

  // The teams and the league draw are settled; the API refuses to change them.
  drawSuperSix: (seed) =>
    request('/stage/super-six', { method: 'POST', body: { seed: seed || null } }),
  openPlayoffs: () => request('/stage/playoffs', { method: 'POST' }),
  rollbackStage: () => request('/stage/rollback', { method: 'POST' }),
  /** winnerTeamId of null clears the result. */
  saveResult: (matchId, winnerTeamId, coins, redToWinner) =>
    request(`/matches/${matchId}`, {
      method: 'PATCH',
      body: {
        winner_team_id: winnerTeamId,
        coins: coins,
        red_to_winner: Boolean(redToWinner),
      },
    }),
}
