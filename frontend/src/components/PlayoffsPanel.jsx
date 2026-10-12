import { useEffect, useMemo, useRef, useState } from 'react'
import Confetti from './Confetti.jsx'
import { MatchRow } from './FixturesPanel.jsx'
import PlayoffGraph from './PlayoffGraph.jsx'
import { Slot } from './QualificationBoard.jsx'
import { groupStyle } from '../constants'

const COLUMNS = [
  { title: 'Round 1', slots: ['q1', 'eliminator'] },
  { title: 'Round 2', slots: ['q2'] },
  { title: 'The Final', slots: ['final'] },
]

export default function PlayoffsPanel({ state, busy, readOnly, onSaveResult, onOpenPlayoffs }) {
  const playoffs = state?.playoffs ?? {}
  const matches = playoffs.matches ?? []
  const superSix = state?.super_six ?? {}
  const open = matches.some((match) => match.live)

  const teamsById = useMemo(() => {
    const map = new Map()
    ;(superSix.groups ?? []).forEach((group) =>
      group.teams.forEach((team) => map.set(team.id, team)),
    )
    return map
  }, [superSix])

  const champion = playoffs.champion ? teamsById.get(playoffs.champion) : null
  const runnerUp = playoffs.runner_up ? teamsById.get(playoffs.runner_up) : null
  const thirdPlace = playoffs.third_place ? teamsById.get(playoffs.third_place) : null
  const [confettiKey, setConfettiKey] = useState(0)
  const crownedRef = useRef(Boolean(champion))

  useEffect(() => {
    if (champion && !crownedRef.current) {
      crownedRef.current = true
      setConfettiKey((key) => key + 1)
    }
    if (!champion) crownedRef.current = false
  }, [champion])

  const bySlot = Object.fromEntries(matches.map((match) => [match.slot, match]))
  const waiting = superSix.total - superSix.played

  return (
    <section className="panel">
      <Confetti fireKey={confettiKey} />

      {champion ? (
        <div className="champion">
          <span className="champion__crown" aria-hidden="true">
            ♛
          </span>
          <div>
            <p className="champion__label">NC Carrom 2026 champions</p>
            <h2 className="champion__names">
              {champion.player1_name} &amp; {champion.player2_name}
            </h2>
            <p className="champion__code">{champion.code}</p>
            <p className="champion__rest">
              {runnerUp && (
                <span>
                  🥈 {runnerUp.player1_name} &amp; {runnerUp.player2_name}
                </span>
              )}
              {thirdPlace && (
                <span>
                  🥉 {thirdPlace.player1_name} &amp; {thirdPlace.player2_name}
                </span>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="panel__head">
          <div>
            <h2 className="panel__title">The run-in</h2>
            <p className="panel__sub">
              The top two of each Super Six group. Win Qualifier 1 and you go straight to the
              final; lose the Eliminator and you are out. Each box fills itself in as the results
              before it land.
            </p>
          </div>
          {!open && superSix.complete && superSix.drawn && !readOnly && (
            <button className="btn btn--primary" disabled={busy} onClick={onOpenPlayoffs}>
              Open the playoffs
            </button>
          )}
          {!open && !superSix.complete && (
            <span className="pill">
              {superSix.drawn
                ? `${waiting} Super Six match${waiting === 1 ? '' : 'es'} to go`
                : 'Super Six not drawn'}
            </span>
          )}
        </div>
      )}

      <QualifiedBoard superSix={superSix} teamsById={teamsById} />

      <h3 className="section__title">The bracket</h3>
      <PlayoffGraph state={state} teamsById={teamsById} />

      <h3 className="section__title">Results</h3>
      <div className="bracket">
        {COLUMNS.map((column) => (
          <div key={column.title} className="bracket__col">
            <h3 className="bracket__title">{column.title}</h3>
            {column.slots.map((slot) => {
              const match = bySlot[slot]
              if (!match) return null
              const teamA = teamsById.get(match.team_a_id)
              const teamB = teamsById.get(match.team_b_id)
              return (
                <div
                  key={slot}
                  className={`bracket__tie ${match.played ? 'is-played' : ''} ${
                    match.ready && match.live ? 'is-ready' : ''
                  }`}
                >
                  <div className="bracket__head">
                    <span className="bracket__name">{match.name}</span>
                    <span className="bracket__blurb">{match.blurb}</span>
                  </div>

                  {match.live ? (
                    <MatchRow
                      match={match}
                      teamA={teamA}
                      teamB={teamB}
                      labelA={match.source_a}
                      labelB={match.source_b}
                      heading=""
                      busy={busy}
                      frozen={readOnly}
                      onSave={onSaveResult}
                    />
                  ) : (
                    <EmptyTie
                      labelA={match.source_a}
                      labelB={match.source_b}
                      teamA={teamA}
                      teamB={teamB}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <p className="bracket__foot">
        Qualifier 1 loser drops into Qualifier 2 · Eliminator loser is out · Qualifier 1 and 2
        winners meet in the final
      </p>
    </section>
  )
}

/** The four playoff places, filling in as the Super Six plays out. */
function QualifiedBoard({ superSix, teamsById }) {
  const groups = superSix?.groups ?? []
  if (!groups.length) return null
  const settled = Boolean(superSix.complete)

  // Nothing played yet means the table is only the draw order, so show nothing.
  const seat = (group, index) => (group.played ? group.standings?.[index] ?? null : null)

  return (
    <div className="qualboard">
      <div className="qualboard__head">
        <h3>Who qualifies</h3>
        <span className={`pill ${settled ? 'pill--done' : ''}`}>
          {settled
            ? 'Final'
            : `Provisional · ${superSix.played}/${superSix.total} Super Six matches`}
        </span>
      </div>

      <div className="qualboard__row">
        <section>
          <h4 className="qualboard__kind">
            Into Qualifier 1 <span>— group winners</span>
          </h4>
          <div className="slotgrid">
            {groups.map((group) => (
              <Slot
                key={`w-${group.code}`}
                accent={groupStyle(group.code).color}
                label={`Group ${group.code} · ${group.name} · 1st`}
                row={seat(group, 0)}
                settled={settled}
              />
            ))}
          </div>
        </section>

        <section>
          <h4 className="qualboard__kind">
            Into the Eliminator <span>— runners-up</span>
          </h4>
          <div className="slotgrid">
            {groups.map((group) => (
              <Slot
                key={`r-${group.code}`}
                accent={groupStyle(group.code).color}
                label={`Group ${group.code} · ${group.name} · 2nd`}
                row={seat(group, 1)}
                settled={settled}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

/** A tie that does not exist yet: two labelled, empty boxes. */
function EmptyTie({ labelA, labelB, teamA, teamB }) {
  return (
    <div className="emptytie">
      <Side label={labelA} team={teamA} />
      <span className="emptytie__v">v</span>
      <Side label={labelB} team={teamB} />
    </div>
  )
}

function Side({ label, team }) {
  return (
    <div className={`emptytie__side ${team ? 'is-filled' : ''}`}>
      <span className="emptytie__label">{label}</span>
      {team ? (
        <span className="emptytie__team">
          <span className="emptytie__code">{team.code}</span>
          {team.player1_name} &amp; {team.player2_name}
        </span>
      ) : (
        <span className="emptytie__empty">— to be decided —</span>
      )}
    </div>
  )
}
