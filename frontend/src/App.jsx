import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { clearSession, readSession, saveSession } from './auth'
import FixturesPanel from './components/FixturesPanel.jsx'
import GroupsPanel from './components/GroupsPanel.jsx'
import Header from './components/Header.jsx'
import PlayoffsPanel from './components/PlayoffsPanel.jsx'
import SignIn from './components/SignIn.jsx'
import StageRibbon from './components/StageRibbon.jsx'
import SuperSixPanel from './components/SuperSixPanel.jsx'
import Toast from './components/Toast.jsx'

const TABS = [
  { id: 'league', label: 'League Stage', hint: 'Groups A–E' },
  { id: 'super_six', label: 'Super Six', hint: 'Foxtrot & Golf' },
  { id: 'playoffs', label: 'Playoffs', hint: 'Q1 · Elim · Q2 · Final' },
]

export default function App() {
  const [state, setState] = useState(null)
  const [session, setSession] = useState(() => readSession())
  const [authRequired, setAuthRequired] = useState(true)
  const [tab, setTab] = useState('league')
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
      const next = await api.getState()
      setState(next)
      setTab(next.stage === 'done' ? 'playoffs' : next.stage)
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

  // Keep a second screen - a projector, a viewer's phone - up to date on its
  // own. Skipped while a save is in flight and while the tab is hidden.
  useEffect(() => {
    if (!state || fatal) return undefined
    const timer = setInterval(async () => {
      if (busy || document.hidden) return
      try {
        setState(await api.getState())
      } catch {
        /* a blip; the next tick tries again */
      }
    }, 15000)
    return () => clearInterval(timer)
  }, [state, busy, fatal])

  const handleSignIn = useCallback(async (username, password) => {
    try {
      const next = await api.signIn(username, password)
      saveSession(next)
      setSession(next)
      setLoading(true)
      const data = await api.getState()
      setState(data)
      setTab(data.stage === 'done' ? 'playoffs' : data.stage)
      setLoading(false)
      return null
    } catch (error) {
      setLoading(false)
      return error.message
    }
  }, [])

  const run = useCallback(
    async (action, successText) => {
      setBusy(true)
      try {
        const next = await action()
        setState(next)
        if (successText) notify(successText, 'success')
        return next
      } catch (error) {
        if (error.status === 401) signOut('Your session ended. Sign in again.')
        else notify(error.message, 'error')
        return null
      } finally {
        setBusy(false)
      }
    },
    [notify, signOut],
  )

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

  const league = state.league ?? {}
  const readOnly = state.can_edit === false
  const leagueFrozen = state.stage !== 'league' || readOnly
  const saveResult = (matchId, winner, coins, red) =>
    run(
      () => api.saveResult(matchId, winner, coins, red),
      winner ? 'Result saved.' : 'Result cleared.',
    )

  return (
    <div className="app">
      <div className="app__glow" aria-hidden="true" />

      {authRequired && session && (
        <div className="sessionbar">
          <span className="sessionbar__who">
            <span className="sessionbar__dot" aria-hidden="true" />
            Signed in as <strong>{session.username}</strong>
            {readOnly && <span className="sessionbar__role">view only</span>}
          </span>
          <button className="btn btn--ghost btn--sm" onClick={() => signOut('Signed out.')}>
            Sign out
          </button>
        </div>
      )}

      <Header state={state} />
      <StageRibbon stages={state.stages ?? []} champion={state.playoffs?.champion} />

      <nav className="tabs" aria-label="Stages">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`tab ${tab === item.id ? 'is-active' : ''}`}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
          >
            <span className="tab__label">{item.label}</span>
            <span className="tab__hint">{item.hint}</span>
          </button>
        ))}
      </nav>

      <main className="main">
        {tab === 'league' && (
          <section className="panel">
            <div className="panel__head">
              <div>
                <h2 className="panel__title">League Stage</h2>
                <p className="panel__sub">
                  25 teams, five groups, everyone plays the other four in their group. A win is{' '}
                  <strong>2 points</strong>; <strong>PD</strong> carries the coins (plus the red
                  when the winner took it) and breaks ties.
                </p>
              </div>
              {state.stage !== 'league' && <span className="pill pill--frozen">Frozen ❄</span>}
            </div>

            <GroupsPanel
              groups={league.groups ?? []}
              qualify={2}
              qualifyNote="Top 2 go through; the best two third-placed teams join them."
            />

            <h3 className="section__title">Fixtures</h3>
            <FixturesPanel
              groups={league.groups ?? []}
              busy={busy}
              frozen={leagueFrozen}
              onSaveResult={saveResult}
            />
          </section>
        )}

        {tab === 'super_six' && (
          <SuperSixPanel
            state={state}
            busy={busy}
            readOnly={readOnly}
            onDraw={(seed) => run(() => api.drawSuperSix(seed))}
            onSaveResult={saveResult}
            onOpenPlayoffs={() =>
              run(() => api.openPlayoffs(), 'Super Six frozen — the bracket is set.')
            }
          />
        )}

        {tab === 'playoffs' && (
          <PlayoffsPanel
            state={state}
            busy={busy}
            readOnly={readOnly}
            onSaveResult={saveResult}
            onOpenPlayoffs={() =>
              run(() => api.openPlayoffs(), 'Super Six frozen — the bracket is set.')
            }
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
