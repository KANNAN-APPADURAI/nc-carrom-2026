import { useEffect, useRef, useState } from 'react'
import Confetti from './Confetti.jsx'
import FixturesPanel from './FixturesPanel.jsx'
import GroupsPanel from './GroupsPanel.jsx'
import QualificationBoard, { SuperSixShells } from './QualificationBoard.jsx'
import { groupStyle } from '../constants'

const SHUFFLE_MS = 1900
const LINES = [
  'Sealing the league tables…',
  'Drawing three groups out of five…',
  'Keeping each group’s top two apart…',
  'Weighing up the third-placed teams…',
  'Seating Foxtrot and Golf…',
]

export default function SuperSixPanel({
  state,
  busy,
  readOnly,
  onDraw,
  onSaveResult,
  onOpenPlayoffs,
}) {
  const superSix = state?.super_six ?? {}
  const league = state?.league ?? {}
  const groups = superSix.groups ?? []
  const frozen = readOnly || state?.stage === 'playoffs' || state?.stage === 'done'

  const [phase, setPhase] = useState(superSix.drawn ? 'done' : 'idle')
  const [seedInput, setSeedInput] = useState('')
  const [showSeed, setShowSeed] = useState(false)
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

  const runDraw = async () => {
    setPhase('drawing')
    setLine(0)
    const started = Date.now()
    const next = await onDraw(seedInput.trim())
    const wait = Math.max(0, SHUFFLE_MS - (Date.now() - started))
    setTimeout(() => setPhase(next?.super_six?.drawn ? 'done' : 'idle'), wait)
  }

  // --- not drawn yet -------------------------------------------------------
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
              <h2 className="drawhero__title">Drawing the Super Six…</h2>
              <p className="drawhero__status">{LINES[line]}</p>
            </>
          ) : (
            <>
              <h2 className="drawhero__title">The Super Six</h2>
              <p className="drawhero__status">
                {league.complete
                  ? 'All 50 league matches are in. Twelve teams go through to Foxtrot and Golf.'
                  : `${remaining} league match${remaining === 1 ? '' : 'es'} still to play.`}
              </p>

              <div className="qualrules">
                <div className="qualrules__col">
                  <h4>Who goes through</h4>
                  <ul>
                    <li>All five group winners</li>
                    <li>All five runners-up</li>
                    <li>The best two third-placed teams, on points then PD</li>
                  </ul>
                </div>
                <div className="qualrules__col">
                  <h4>How they split</h4>
                  <ul>
                    <li>Three groups are drawn at random</li>
                    <li>Those three send their winner to Foxtrot, their runner-up to Golf</li>
                    <li>The other two do the reverse — so a group's top two never meet again</li>
                    <li>Best 3rd to Golf, second best to Foxtrot</li>
                  </ul>
                </div>
              </div>

              <QualificationBoard league={league} />
              <SuperSixShells />

              {readOnly ? (
                <p className="readonly">
                  The organiser will make this draw once the league is finished.
                </p>
              ) : (
                <button
                  className="btn btn--primary btn--xl"
                  disabled={!league.complete || busy}
                  onClick={runDraw}
                >
                  🎲 Draw the Super Six
                </button>
              )}

              {!readOnly && (
                <button className="linkbtn" onClick={() => setShowSeed((value) => !value)}>
                  {showSeed ? 'Hide' : 'Use a fixed seed (optional)'}
                </button>
              )}

              {showSeed && !readOnly && (
                <div className="seedbox">
                  <input
                    className="seedbox__input"
                    value={seedInput}
                    maxLength={24}
                    placeholder="e.g. SUPERSIX26"
                    onChange={(event) => setSeedInput(event.target.value.toUpperCase())}
                  />
                  <p className="seedbox__hint">
                    Announce it before you draw and anyone can reproduce the exact same split.
                  </p>
                </div>
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
          <span className="drawstrip__label">Super Six seed</span>
          <span className="drawstrip__seed">{superSix.seed}</span>
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
