import { useEffect, useRef, useState } from 'react'
import Confetti from './Confetti.jsx'
import FixturesPanel from './FixturesPanel.jsx'
import GroupsPanel from './GroupsPanel.jsx'
import QualificationBoard, { SuperSixShells } from './QualificationBoard.jsx'
import { groupStyle, HAND_DRAWN } from '../constants'

const SHUFFLE_MS = 1900
const LINES = [
  'Sealing the league tables…',
  'Reading the slips off the table…',
  'Seating Foxtrot and Golf…',
  'Building thirty fixtures…',
]

export default function SuperSixPanel({
  state,
  busy,
  readOnly,
  onLockIn,
  onSaveResult,
  onOpenPlayoffs,
}) {
  const superSix = state?.super_six ?? {}
  const league = state?.league ?? {}
  const groups = superSix.groups ?? []
  const frozen = readOnly || state?.stage === 'playoffs' || state?.stage === 'done'

  const [phase, setPhase] = useState(superSix.drawn ? 'done' : 'idle')
  const [line, setLine] = useState(0)
  const [confettiKey, setConfettiKey] = useState(0)
  const drawnRef = useRef(superSix.drawn)

  useEffect(() => {
    if (superSix.drawn && !drawnRef.current) {
      drawnRef.current = true
      setConfettiKey((key) => key + 1)
    }
    if (!superSix.drawn) drawnRef.current = false
  }, [superSix.drawn])

  useEffect(() => {
    if (phase !== 'drawing') return undefined
    const timer = setInterval(() => setLine((n) => (n + 1) % LINES.length), 420)
    return () => clearInterval(timer)
  }, [phase])

  const runLockIn = async () => {
    setPhase('drawing')
    setLine(0)
    const started = Date.now()
    const next = await onLockIn()
    const wait = Math.max(0, SHUFFLE_MS - (Date.now() - started))
    setTimeout(() => setPhase(next?.super_six?.drawn ? 'done' : 'idle'), wait)
  }

  // --- not seated yet ------------------------------------------------------
  if (!superSix.drawn) {
    const remaining = (league.total ?? 0) - (league.played ?? 0)
    return (
      <section className="panel">
        <div className={`drawhero ${phase === 'drawing' ? 'is-shuffling' : ''}`}>
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

          {phase === 'drawing' ? (
            <>
              <h2 className="drawhero__title">Seating the Super Six…</h2>
              <p className="drawhero__status">{LINES[line]}</p>
            </>
          ) : (
            <>
              <h2 className="drawhero__title">The Super Six</h2>
              <p className="drawhero__status">
                {league.complete
                  ? 'All 50 league matches are in. The twelve teams drawn in the room are seated below.'
                  : `${remaining} league match${remaining === 1 ? '' : 'es'} still to play — if they are dead rubbers, go ahead.`}
              </p>

              <div className="qualrules qualrules--single">
                <div className="qualrules__col">
                  <h4>How the two groups were made</h4>
                  <ul>
                    <li>All five group winners, all five runners-up and the best two thirds go through</li>
                    <li>Foxtrot and Golf were drawn on paper lots in the room, entry number by entry number</li>
                    <li>The app only looks those numbers up and keeps the scores — it draws nothing</li>
                  </ul>
                </div>
              </div>

              <QualificationBoard league={league} />
              <SuperSixShells plan={superSix.plan ?? []} />

              {readOnly ? (
                <p className="readonly">
                  The organiser will open the Super Six once the league is finished.
                </p>
              ) : (
                <>
                  <button
                    className="btn btn--primary btn--xl"
                    disabled={busy}
                    onClick={runLockIn}
                  >
                    🔒 Lock in the Super Six
                  </button>
                  {!league.complete && (
                    <p className="drawhero__warn">
                      The twelve are already drawn, so this does not wait for the league. Anything
                      still unplayed is frozen unplayed.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>
    )
  }

  // --- drawn ---------------------------------------------------------------
  const ready = superSix.complete
  return (
    <section className="panel">
      <Confetti fireKey={confettiKey} />

      <div className="drawstrip">
        <div className="drawstrip__main">
          <span className="drawstrip__label">Super Six draw</span>
          <span className="drawstrip__seed">
            {superSix.seed === HAND_DRAWN ? 'PAPER LOTS' : superSix.seed}
          </span>
        </div>
        <div className="drawstrip__meta">
          <span>12 teams</span>
          <span>·</span>
          <span>
            {superSix.played}/{superSix.total} matches played
          </span>
        </div>
        {!frozen && !readOnly && (
          <div className="drawstrip__actions">
            <button
              className="btn btn--primary"
              disabled={busy || !ready}
              onClick={onOpenPlayoffs}
              title={ready ? '' : 'Finish every Super Six match first'}
            >
              {ready ? 'Freeze & open the playoffs →' : 'Playoffs locked'}
            </button>
          </div>
        )}
      </div>

      <div className="lineup">
        {groups.map((group) => {
          const style = groupStyle(group.code)
          return (
            <div key={group.code} className="lineup__col" style={{ '--accent': style.color }}>
              <h4>
                Group {group.code} · {group.name}
              </h4>
              <ul>
                {group.teams.map((team) => (
                  <li key={team.id}>
                    <span className="lineup__code">{team.code}</span>
                    <span className="lineup__players">
                      {team.player1_name} &amp; {team.player2_name}
                    </span>
                    <span className="lineup__origin">{team.super_origin}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <h3 className="section__title">Standings</h3>
      <GroupsPanel
        groups={groups}
        qualify={2}
        qualifyNote="Top 2 reach the playoffs: winners into Qualifier 1, runners-up into the Eliminator."
      />

      <h3 className="section__title">Fixtures</h3>
      <FixturesPanel
        groups={groups}
        busy={busy}
        frozen={frozen}
        onSaveResult={onSaveResult}
      />
    </section>
  )
}
