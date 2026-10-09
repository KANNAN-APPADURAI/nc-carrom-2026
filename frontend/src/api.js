const BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

async function request(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Cannot reach the tournament service. Is the FastAPI backend running on :8000?')
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
    throw new Error(detail)
  }

  return response.json()
}

export const api = {
  getState: () => request('/state'),
  /** teams: [{ player1, player2 }] - replaces the whole list. */
  saveTeams: (teams) => request('/teams', { method: 'PUT', body: { teams } }),
  runDraw: (seed) => request('/draw', { method: 'POST', body: { seed: seed || null } }),
  clearDraw: () => request('/draw', { method: 'DELETE' }),
  saveResult: (matchId, boardsA, boardsB) =>
    request(`/matches/${matchId}`, {
      method: 'PATCH',
      body: { boards_a: boardsA, boards_b: boardsB },
    }),
}
