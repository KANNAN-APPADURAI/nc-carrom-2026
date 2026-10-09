import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { clearSession, readSession, saveSession } from './auth'
import Header from './components/Header.jsx'
import SignIn from './components/SignIn.jsx'
import TeamsPanel from './components/TeamsPanel.jsx'
import DrawPanel from './components/DrawPanel.jsx'
import GroupsPanel from './components/GroupsPanel.jsx'
import FixturesPanel from './components/FixturesPanel.jsx'
import Toast from './components/Toast.jsx'

const TABS = [
  { id: 'teams', label: 'Teams', hint: 'Enter the lots' },
  { id: 'draw', label: 'The Draw', hint: 'Deal the groups' },
  { id: 'groups', label: 'Groups', hint: 'Standings' },
  { id: 'fixtures', label: 'Fixtures', hint: 'Match results' },
]

export default function App() {
  const [state, setState] = useState(null)
  const [session, setSession] = useState(() => readSession())
  const [authRequired, setAuthRequired] = useState(true)
  const [tab, setTab] = useState('teams')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fatal, setFatal] = useState(null)
  const [toast, setToast] = useState(null)

  const notify = useCallback((text, kind = 'info') => setToast({ text, kind, at: Date.now() }), [])

  const signOut = useCallback(
    (message) => {
      clearSession()
      setSession(null)
      setState(null)
      if (message) notify(message, 'info')
    },
    [notify],
  )

  const boot = useCallback(async () => {
    setLoading(true)
    try {
      const health = await api.health()
      setAuthRequired(health.auth_required)
      setFatal(null)

      if (health.auth_required && !readSession()) {
        setSession(null)
        return
      }

      setState(await api.getState())
    } catch (error) {
      if (error.status === 401) {
        clearSession()
        setSession(null)
      } else {
        setFatal(error.message)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    boot()
  }, [boot])

  const handleSignIn = useCallback(async (username, password) => {
    try {
      const next = await api.signIn(username, password)
      saveSession(next)
      setSession(next)
      setLoading(true)
      setState(await api.getState())
      setLoading(false)
      return null
    } catch (error) {
      setLoading(false)
      return error.message // shown on the sign-in card
    }
  }, [])

  // Every mutating call returns the full tournament state, so one helper
  // covers saving teams, drawing, resetting and entering results.
  // `quiet` is for the teams autosave, which shouldn't pop a toast each time.
  const run = useCallback(
    async (action, successText, { quiet = false } = {}) => {
      if (!quiet) setBusy(true)
      try {
        const next = await action()
        setState(next)
        if (successText && !quiet) notify(successText, 'success')
        return next
      } catch (error) {
        if (error.status === 401) signOut('Your session ended. Sign in again.')
        else notify(error.message, 'error')
        return null
      } finally {
        if (!quiet) setBusy(false)
      }
    },
    [notify, signOut],
  )

  const hasDraw = Boolean(state?.draw && state.matches?.length)

  if (authRequired && !session && !loading && !fatal) {
    return <SignIn onSignIn={handleSignIn} />
  }

  if (loading) {
    return (
      <div className="boot">
        <div className="striker" aria-hidden="true" />
        <p>Setting up the board…</p>
      </div>
    )
  }

  if (fatal) {
    return (
      <div className="boot boot--error">
        <div className="boot__icon" aria-hidden="true">
          ⚠
        </div>
        <h1>Can't reach the tournament service</h1>
        <p>{fatal}</p>
        <pre>
          cd nc-carrom-2026\backend{'\n'}
          .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
        </pre>
        <button className="btn btn--primary" onClick={boot}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app__glow" aria-hidden="true" />

      {authRequired && session && (
        <div className="sessionbar">
          <span className="sessionbar__who">
            <span className="sessionbar__dot" aria-hidden="true" />
            Signed in as <strong>{session.username}</strong>
          </span>
          <button className="btn btn--ghost btn--sm" onClick={() => signOut('Signed out.')}>
            Sign out
          </button>
        </div>
      )}

      <Header state={state} />

      <nav className="tabs" aria-label="Sections">
        {TABS.map((item) => {
          const locked = !hasDraw && (item.id === 'groups' || item.id === 'fixtures')
          return (
            <button
              key={item.id}
              className={`tab ${tab === item.id ? 'is-active' : ''} ${locked ? 'is-locked' : ''}`}
              onClick={() =>
                locked ? notify('Draw the groups first to unlock this.', 'info') : setTab(item.id)
              }
              aria-current={tab === item.id ? 'page' : undefined}
            >
              <span className="tab__label">
                {locked && <span aria-hidden="true">🔒 </span>}
                {item.label}
              </span>
              <span className="tab__hint">{item.hint}</span>
            </button>
          )
        })}
      </nav>

      <main className="main">
        {tab === 'teams' && (
          <TeamsPanel
            state={state}
            busy={busy}
            hasDraw={hasDraw}
            onSave={(teams, options) =>
              run(
                () => api.saveTeams(teams),
                `Teams saved — ${teams.length} on the sheet.`,
                options,
              )
            }
          />
        )}

        {tab === 'draw' && (
          <DrawPanel
            state={state}
            busy={busy}
            hasDraw={hasDraw}
            onDraw={(seed) => run(() => api.runDraw(seed))}
            onReset={() => run(() => api.clearDraw(), 'Draw cleared. Your teams are untouched.')}
            onFinished={() => notify('Groups drawn — Alpha through Echo are set!', 'success')}
            goToGroups={() => setTab('groups')}
          />
        )}

        {tab === 'groups' && <GroupsPanel state={state} goToFixtures={() => setTab('fixtures')} />}

        {tab === 'fixtures' && (
          <FixturesPanel
            state={state}
            busy={busy}
            onSaveResult={(matchId, a, b) => run(() => api.saveResult(matchId, a, b), 'Result saved.')}
          />
        )}
      </main>

      <footer className="footer">
        <span className="coin coin--white" aria-hidden="true" />
        <span className="coin coin--black" aria-hidden="true" />
        <span className="coin coin--queen" aria-hidden="true" />
        <span>
          nCompass Carrom Tournament 2026 · storage:{' '}
          <strong>{state?.storage === 'postgres' ? 'Neon' : state?.storage}</strong>
          {!authRequired && ' · sign-in off'}
        </span>
      </footer>

      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  )
}
