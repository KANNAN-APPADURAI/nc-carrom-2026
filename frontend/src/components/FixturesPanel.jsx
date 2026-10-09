import { useMemo, useState } from 'react'
import { groupStyle, MAX_BOARDS } from '../constants'

export default function FixturesPanel({ state, busy, onSaveResult }) {
  const groups = state?.groups ?? []
  const [active, setActive] = useState(groups[0]?.code ?? 'A')

  const group = groups.find((item) => item.code === active) ?? groups[0]
  const teamsById = useMemo(() => {
    const map = new Map()
    ;(state?.teams ?? []).forEach((team) => map.set(team.id, team))
    return map
  }, [state])

  if (!group) return null

  const style = groupStyle(group.code)
  const rounds = [...new Set(group.matches.map((match) => match.round))].sort((a, b) => a - b)

  return (
    <section className="panel" style={{ '--accent': style.color, '--glow': style.glow }}>
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Fixtures &amp; results</h2>
          <p className="panel__sub">
            Best of {MAX_BOARDS} boards. Enter the boards each team won, then save — the standings
            update straight away.
          </p>
        </div>
      </div>

      <div className="grouptabs">
        {groups.map((item) => {
          const itemStyle = groupStyle(item.code)
          return (
            <button
              key={item.code}
              className={`grouptab ${item.code === active ? 'is-active' : ''}`}
              style={{ '--accent': itemStyle.color }}
              onClick={() => setActive(item.code)}
            >
              <span className="grouptab__code">{item.code}</span>
              <span className="grouptab__name">{item.name}</span>
              <span className="grouptab__count">
                {item.played}/{item.total_matches}
              </span>
            </button>
          )
        })}
      </div>

      {rounds.map((round) => (
        <div key={round} className="round">
          <h3 className="round__title">
            <span className="round__no">Round {round}</span>
            <span className="round__rule" aria-hidden="true" />
          </h3>

          {group.matches
            .filter((match) => match.round === round)
            .map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                teamA={teamsById.get(match.team_a_id)}
                teamB={teamsById.get(match.team_b_id)}
                busy={busy}
                onSave={onSaveResult}
              />
            ))}
        </div>
      ))}
    </section>
  )
}

function MatchRow({ match, teamA, teamB, busy, onSave }) {
  const [a, setA] = useState(match.boards_a ?? '')
  const [b, setB] = useState(match.boards_b ?? '')
  const [editing, setEditing] = useState(false)

  const dirty = String(a) !== String(match.boards_a ?? '') || String(b) !== String(match.boards_b ?? '')
  const valid = a !== '' && b !== '' && Number(a) !== Number(b)
  const aWon = match.played && match.boards_a > match.boards_b
  const bWon = match.played && match.boards_b > match.boards_a

  const options = Array.from({ length: MAX_BOARDS + 1 }, (_, index) => index)

  if (!teamA || !teamB) return null

  return (
    <div className={`match ${match.played ? 'is-played' : ''}`}>
      <span className="match__no">M{match.match_no}</span>

      <div className={`match__team match__team--a ${aWon ? 'is-winner' : ''}`}>
        <span className="match__code">{teamA.code}</span>
        <span className="match__players">
          {teamA.player1_name} &amp; {teamA.player2_name}
        </span>
      </div>

      <div className="match__score">
        {match.played && !editing ? (
          <button className="scoreline" onClick={() => setEditing(true)} disabled={busy}>
            <span className={aWon ? 'is-winner' : ''}>{match.boards_a}</span>
            <span className="scoreline__dash">–</span>
            <span className={bWon ? 'is-winner' : ''}>{match.boards_b}</span>
          </button>
        ) : (
          <div className="scoreedit">
            <select
              className="scoreedit__select"
              value={a}
              disabled={busy}
              onChange={(event) => setA(event.target.value)}
              aria-label={`Boards won by ${teamA.code}`}
            >
              <option value="">–</option>
              {options.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="scoreedit__vs">v</span>
            <select
              className="scoreedit__select"
              value={b}
              disabled={busy}
              onChange={(event) => setB(event.target.value)}
              aria-label={`Boards won by ${teamB.code}`}
            >
              <option value="">–</option>
              {options.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className={`match__team match__team--b ${bWon ? 'is-winner' : ''}`}>
        <span className="match__players">
          {teamB.player1_name} &amp; {teamB.player2_name}
        </span>
        <span className="match__code">{teamB.code}</span>
      </div>

      <div className="match__actions">
        {match.played && !editing ? (
          <button
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => {
              setA('')
              setB('')
              onSave(match.id, null, null)
              setEditing(false)
            }}
          >
            Clear
          </button>
        ) : (
          <button
            className="btn btn--primary btn--sm"
            disabled={busy || !valid || (!dirty && match.played)}
            onClick={() => {
              onSave(match.id, Number(a), Number(b))
              setEditing(false)
            }}
          >
            Save
          </button>
        )}
      </div>
    </div>
  )
}
