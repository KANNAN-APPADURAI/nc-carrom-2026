import { useEffect, useMemo, useState } from 'react'
import { groupStyle, QUEEN_POINTS, signed } from '../constants'

/**
 * Fixtures and result entry for one stage. Each group's teams already carry
 * the code they use in that stage, so the same panel serves the league groups
 * and the Super Six.
 */
export default function FixturesPanel({ groups = [], busy, frozen, onSaveResult }) {
  const [active, setActive] = useState(groups[0]?.code ?? null)

  useEffect(() => {
    if (!groups.some((group) => group.code === active)) setActive(groups[0]?.code ?? null)
  }, [groups, active])

  const group = groups.find((item) => item.code === active) ?? groups[0]

  const teamsById = useMemo(() => {
    const map = new Map()
    groups.forEach((item) => item.teams.forEach((team) => map.set(team.id, team)))
    return map
  }, [groups])

  if (!group) return null

  const style = groupStyle(group.code)
  const rounds = [...new Set(group.matches.map((match) => match.round))].sort((a, b) => a - b)

  return (
    <div style={{ '--accent': style.color, '--glow': style.glow }}>
      {groups.length > 1 && (
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
      )}

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
                frozen={frozen}
                onSave={onSaveResult}
              />
            ))}
        </div>
      ))}
    </div>
  )
}

/**
 * One fixture: tap the winner, type the coins the loser left, flip the red on
 * if the winner pocketed it. Also used for the playoff bracket, where the two
 * sides can still be unknown.
 */
export function MatchRow({
  match,
  teamA,
  teamB,
  busy,
  frozen,
  onSave,
  labelA,
  labelB,
  heading,
}) {
  const [winner, setWinner] = useState(match.winner_team_id ?? null)
  const [coins, setCoins] = useState(match.coins ?? '')
  const [red, setRed] = useState(Boolean(match.red_to_winner))
  const [editing, setEditing] = useState(false)

  const ready = Boolean(teamA && teamB)
  const open = ready && !frozen && (!match.played || editing)
  const dirty =
    winner !== (match.winner_team_id ?? null) ||
    String(coins) !== String(match.coins ?? '') ||
    red !== Boolean(match.red_to_winner)
  const valid = winner !== null && coins !== ''
  const gain = (Number(coins) || 0) + (red ? QUEEN_POINTS : 0)

  const aWon = match.played && match.winner_team_id === teamA?.id
  const bWon = match.played && match.winner_team_id === teamB?.id

  const reset = () => {
    setWinner(match.winner_team_id ?? null)
    setCoins(match.coins ?? '')
    setRed(Boolean(match.red_to_winner))
    setEditing(false)
  }

  const pd = (won) =>
    match.played ? signed(won ? match.coins + (match.red_to_winner ? QUEEN_POINTS : 0) : -(match.coins + (match.red_to_winner ? QUEEN_POINTS : 0))) : null

  const staticSide = (team, label, won, flip) => (
    <div className={`match__team match__team--${flip ? 'b' : 'a'} ${won ? 'is-winner' : ''}`}>
      {team ? (
        <>
          {!flip && <span className="match__code">{team.code}</span>}
          <span className="match__players">
            {team.player1_name} &amp; {team.player2_name}
          </span>
          {flip && <span className="match__code">{team.code}</span>}
          {match.played && (
            <span className={`match__pd ${won ? '' : 'match__pd--loss'}`}>{pd(won)}</span>
          )}
        </>
      ) : (
        <span className="match__tbd">{label ?? 'To be decided'}</span>
      )}
    </div>
  )

  const pickSide = (team, flip) => (
    <button
      type="button"
      className={`match__team match__team--${flip ? 'b' : 'a'} match__pick ${
        winner === team.id ? 'is-picked' : ''
      }`}
      onClick={() => setWinner(team.id)}
      disabled={busy}
      title="Tap to mark as the winner"
    >
      {!flip && (
        <span className="match__tick" aria-hidden="true">
          {winner === team.id ? '✓' : ''}
        </span>
      )}
      {!flip && <span className="match__code">{team.code}</span>}
      <span className="match__players">
        {team.player1_name} &amp; {team.player2_name}
      </span>
      {flip && <span className="match__code">{team.code}</span>}
      {flip && (
        <span className="match__tick" aria-hidden="true">
          {winner === team.id ? '✓' : ''}
        </span>
      )}
    </button>
  )

  return (
    <div className={`match ${match.played ? 'is-played' : ''} ${open ? 'is-open' : ''}`}>
      <span className="match__no">{heading ?? `M${match.match_no}`}</span>

      {open ? pickSide(teamA, false) : staticSide(teamA, labelA, aWon, false)}

      <div className="match__score">
        {open ? (
          <div className="resultedit">
            <label className="resultedit__coins">
              <span>Coins left</span>
              <input
                inputMode="numeric"
                value={coins}
                disabled={busy || winner === null}
                placeholder="0"
                onChange={(event) => setCoins(event.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </label>

            <button
              type="button"
              className={`redtoggle ${red ? 'is-on' : ''}`}
              onClick={() => setRed((value) => !value)}
              disabled={busy || winner === null}
              aria-pressed={red}
              title={`The winner pocketed the red (+${QUEEN_POINTS})`}
            >
              <span className="redtoggle__coin" aria-hidden="true" />
              <span className="redtoggle__label">Red</span>
              <span className="redtoggle__track" aria-hidden="true">
                <span className="redtoggle__knob" />
              </span>
            </button>

            {valid && (
              <span className="resultedit__preview">
                {signed(gain)} / {signed(-gain)}
              </span>
            )}
          </div>
        ) : match.played ? (
          <button
            className="scoreline"
            onClick={() => setEditing(true)}
            disabled={busy || frozen}
            title={frozen ? 'This stage is frozen' : 'Edit'}
          >
            <span className="scoreline__coins">
              {match.coins} coin{match.coins === 1 ? '' : 's'}
            </span>
            {match.red_to_winner && <span className="scoreline__red" />}
          </button>
        ) : (
          <span className="match__waiting">{ready ? 'Not played' : 'Awaiting teams'}</span>
        )}
      </div>

      {open ? pickSide(teamB, true) : staticSide(teamB, labelB, bWon, true)}

      <div className="match__actions">
        {open ? (
          <>
            <button
              className="btn btn--primary btn--sm"
              disabled={busy || !valid || (!dirty && match.played)}
              onClick={() => {
                onSave(match.id, winner, Number(coins), red)
                setEditing(false)
              }}
            >
              Save
            </button>
            {match.played && (
              <button className="btn btn--ghost btn--sm" onClick={reset} disabled={busy}>
                Cancel
              </button>
            )}
          </>
        ) : (
          match.played &&
          !frozen && (
            <button
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => {
                setWinner(null)
                setCoins('')
                setRed(false)
                onSave(match.id, null, null, false)
              }}
            >
              Clear
            </button>
          )
        )}
      </div>
    </div>
  )
}
