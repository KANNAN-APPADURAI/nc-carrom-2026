import { useRef, useState } from 'react'

export default function SignIn({ onSignIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const userRef = useRef(null)

  const submit = async (event) => {
    event.preventDefault()
    if (!username.trim() || !password || busy) return
    setBusy(true)
    setError(null)
    const message = await onSignIn(username.trim(), password)
    if (message) {
      setError(message)
      setPassword('')
      setBusy(false)
      userRef.current?.focus()
    }
    // On success the whole screen is replaced, so there is nothing to reset.
  }

  return (
    <div className="signin">
      <div className="signin__glow" aria-hidden="true" />

      <form className="signin__card" onSubmit={submit}>
        <div className="signin__board" aria-hidden="true">
          <span className="pocket pocket--tl" />
          <span className="pocket pocket--tr" />
          <span className="pocket pocket--bl" />
          <span className="pocket pocket--br" />
          <span className="signin__queen" />
        </div>

        <p className="signin__kicker">nCompass Carrom Tournament</p>
        <h1 className="signin__title">
          NC Carrom <span>2026</span>
        </h1>
        <p className="signin__sub">
          Sign in to follow the tournament. Organisers can enter results; everyone else watches.
        </p>

        <label className="signin__field">
          <span>Username</span>
          <input
            ref={userRef}
            autoFocus
            autoComplete="username"
            value={username}
            maxLength={120}
            disabled={busy}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className="signin__field">
          <span>Password</span>
          <div className="signin__password">
            <input
              type={reveal ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              maxLength={200}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="signin__reveal"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? 'Hide password' : 'Show password'}
            >
              {reveal ? '🙈' : '👁'}
            </button>
          </div>
        </label>

        {error && (
          <p className="signin__error" role="alert">
            {error}
          </p>
        )}

        <button
          className="btn btn--primary btn--lg signin__submit"
          type="submit"
          disabled={busy || !username.trim() || !password}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="signin__foot">
          No accounts to create — the login lives in <code>backend\.env</code>.
        </p>
      </form>
    </div>
  )
}
