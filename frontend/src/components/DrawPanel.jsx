import { useEffect, useMemo, useRef, useState } from 'react'
import Confetti from './Confetti.jsx'
import { groupStyle } from '../constants'

const SHUFFLE_MS = 2200
const REVEAL_STEP_MS = 110

const SHUFFLE_LINES = [
  'Tipping every team into the hat…',
  'Flicking the striker…',
  'Dealing teams into Alpha → Echo…',
  'Keeping the groups even…',
  'Chalking up the fixtures…',
]

export default function DrawPanel({ state, busy, hasDraw, onDraw, onReset, onFinished, goToGroups }) {
  const teams = state?.teams ?? []
  const groups = state?.groups ?? []
  const teamCount = teams.length
  const minTeams = state?.min_teams ?? 10

  const [phase, setPhase] = useState(hasDraw ? 'done' : 'idle')
  const [revealed, setRevealed] = useState(hasDraw ? 999 : 0)
  const [seedInput, setSeedInput] = useState('')
  const [showSeed, setShowSeed] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confettiKey, setConfettiKey] = useState(0)
  const [line, setLine] = useState(0)
  const finishedRef = useRef(onFinished)
  finishedRef.current = onFinished

  const eligible = teamCount >= minTeams

  // Reveal the teams column by column so all five groups fill up together.
  const revealIndex = useMemo(() => {
    const map = new Map()
    groups.forEach((group, groupIndex) => {
      group.teams.forEach((team, position) => {
        map.set(team.id, position * groups.length + groupIndex)
      })
    })
    return map
  }, [groups])

  useEffect(() => {
    if (phase !== 'shuffling') return undefined
    const timer = setInterval(() => setLine((n) => (n + 1) % SHUFFLE_LINES.length), 480)
    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'revealing') return undefined
    const total = teams.length
    let count = 0
    const timer = setInterval(() => {
      count += 1
      setRevealed(count)
      if (count >= total) {
        clearInterval(timer)
        setPhase('done')
        setConfettiKey((key) => key + 1)
        finishedRef.current?.()
      }
    }, REVEAL_STEP_MS)
    return () => clearInterval(timer)
  }, [phase, teams.length])

  const handleDraw = async () => {
    setPhase('shuffling')
    setRevealed(0)
    setLine(0)
    const startedAt = Date.now()
    const next = await onDraw(seedInput.trim())
    if (!next?.draw) {
      setPhase(hasDraw ? 'done' : 'idle')
      return
    }
    const remaining = Math.max(0, SHUFFLE_MS - (Date.now() - startedAt))
    setTimeout(() => setPhase('revealing'), remaining)
  }

  const handleReset = async () => {
    setConfirmReset(false)
    const next = await onReset()
    if (next) {
      setPhase('idle')
      setRevealed(0)
      setSeedInput('')
    }
  }

  if (phase === 'idle' || phase === 'shuffling') {
    return (
      <section className="panel draw">
        <div className={`drawhero ${phase === 'shuffling' ? 'is-shuffling' : ''}`}>
          <div className="drawhero__board" aria-hidden="true">
            <span className="pocket pocket--tl" />
            <span className="pocket pocket--tr" />
            <span className="pocket pocket--bl" />
            <span className="pocket pocket--br" />
            <div className="drawhero__coins">
              {Array.from({ length: 9 }).map((_, index) => (
                <span key={index} className={`chip chip--${index % 3}`} style={{ '--i': index }} />
              ))}
            </div>
            <span className="drawhero__queen" />
          </div>

          {phase === 'shuffling' ? (
            <>
              <h2 className="drawhero__title">Drawing…</h2>
              <p className="drawhero__status">{SHUFFLE_LINES[line]}</p>
            </>
          ) : (
            <>
              <h2 className="drawhero__title">Ready for the group draw</h2>
              <p className="drawhero__status">
                {teamCount} {teamCount === 1 ? 'team' : 'teams'} entered
                {eligible
                  ? ' → spread evenly across Groups A to E.'
                  : ` — enter at least ${minTeams} to deal the groups.`}
              </p>

              <button
                className="btn btn--primary btn--xl"
                disabled={!eligible || busy}
                onClick={handleDraw}
              >
                🎲 Draw the groups
              </button>

              <button className="linkbtn" onClick={() => setShowSeed((value) => !value)}>
                {showSeed ? 'Hide' : 'Use a fixed seed (optional)'}
              </button>

              {showSeed && (
                <div className="seedbox">
                  <input
                    className="seedbox__input"
                    value={seedInput}
                    maxLength={24}
                    placeholder="e.g. NCOMPASS26"
                    onChange={(event) => setSeedInput(event.target.value.toUpperCase())}
                  />
                  <p className="seedbox__hint">
                    The seed decides the randomness. Announce it before you draw and anyone can
                    reproduce the exact same groups — proof that nothing was rigged. Leave it blank
                    for a fresh random seed.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="panel draw">
      <Confetti fireKey={confettiKey} />

      <div className="drawstrip">
        <div className="drawstrip__main">
          <span className="drawstrip__label">Draw seed</span>
          <span className="drawstrip__seed">{state?.draw?.seed}</span>
        </div>
        <div className="drawstrip__meta">
          <span>{teams.length} teams</span>
          <span>·</span>
          <span>{state?.matches?.length ?? 0} group matches</span>
          <span>·</span>
          <span>{new Date(state?.draw?.created_at).toLocaleString()}</span>
        </div>
        <div className="drawstrip__actions">
          <button className="btn" onClick={goToGroups}>
            See the groups →
          </button>
          {confirmReset ? (
            <span className="confirm">
              <span>Clear the draw?</span>
              <button className="btn btn--danger btn--sm" onClick={handleReset} disabled={busy}>
                Yes, redraw
              </button>
              <button className="btn btn--sm" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="btn btn--ghost" onClick={() => setConfirmReset(true)} disabled={busy}>
              Redraw
            </button>
          )}
        </div>
      </div>

      <div className="drawgrid">
        {groups.map((group) => {
          const style = groupStyle(group.code)
          return (
            <div
              key={group.code}
              className="drawcol"
              style={{ '--accent': style.color, '--glow': style.glow }}
            >
              <div className="drawcol__head">
                <span className="drawcol__letter">{group.code}</span>
                <div>
                  <div className="drawcol__name">{group.name}</div>
                  <div className="drawcol__label">Group {group.code}</div>
                </div>
              </div>

              <ul className="drawcol__teams">
                {group.teams.map((team) => {
                  const visible = (revealIndex.get(team.id) ?? 0) < revealed
                  return (
                    <li key={team.id} className={`teamcard ${visible ? 'is-in' : ''}`}>
                      <span className="teamcard__code">{team.code}</span>
                      <span className="teamcard__players">
                        <span>{team.player1_name}</span>
                        <span className="teamcard__amp">&amp;</span>
                        <span>{team.player2_name}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
