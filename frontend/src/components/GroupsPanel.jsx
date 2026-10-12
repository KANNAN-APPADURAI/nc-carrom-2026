import { groupStyle, signed } from '../constants'

/**
 * Standings tables for one stage. Works for the five league groups and for
 * the two Super Six groups alike - the backend hands both over in the same
 * shape, with each team already carrying the code it uses in that stage.
 */
export default function GroupsPanel({ groups = [], qualify = 0, qualifyNote, columns = 2 }) {
  if (!groups.length) return null

  return (
    <div className={`groupgrid ${columns === 2 ? 'groupgrid--wide' : ''}`}>
      {groups.map((group) => {
        const style = groupStyle(group.code)
        const complete = group.total_matches > 0 && group.played === group.total_matches
        return (
          <article
            key={group.code}
            className="groupcard"
            style={{ '--accent': style.color, '--glow': style.glow }}
          >
            <header className="groupcard__head">
              <span className="groupcard__letter">{group.code}</span>
              <div className="groupcard__id">
                <h3>{group.name}</h3>
                <span>Group {group.code}</span>
              </div>
              <span className={`pill ${complete ? 'pill--done' : ''}`}>
                {group.played}/{group.total_matches} played
              </span>
            </header>

            <table className="table">
              <thead>
                <tr>
                  <th className="table__rank">#</th>
                  <th>Team</th>
                  <th title="Played">P</th>
                  <th title="Won">W</th>
                  <th title="Lost">L</th>
                  <th title="Reds pocketed in wins">♛</th>
                  <th title="Point difference">PD</th>
                  <th title="Points: 2 for a win">Pts</th>
                </tr>
              </thead>
              <tbody>
                {group.standings.map((row) => (
                  <tr key={row.team_id} className={qualify && row.rank <= qualify ? 'is-qualifying' : ''}>
                    <td className="table__rank">{row.rank}</td>
                    <td>
                      <div className="teamcell">
                        <span className="teamcell__code">{row.code}</span>
                        <span className="teamcell__players">{row.players.join(' & ')}</span>
                      </div>
                    </td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.lost}</td>
                    <td className="table__reds">{row.reds > 0 ? row.reds : '—'}</td>
                    <td className={row.pd > 0 ? 'is-pos' : row.pd < 0 ? 'is-neg' : ''}>
                      {signed(row.pd)}
                    </td>
                    <td className="table__pts">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {qualifyNote && <p className="groupcard__note">{qualifyNote}</p>}
          </article>
        )
      })}
    </div>
  )
}
