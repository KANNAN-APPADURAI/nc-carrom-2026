import { groupStyle, QUALIFY_COUNT } from '../constants'

export default function GroupsPanel({ state, goToFixtures }) {
  const groups = state?.groups ?? []

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Groups &amp; standings</h2>
          <p className="panel__sub">
            Every team plays all four rivals in its group. Win = 2 pts. Ties are split by board
            difference, then boards won. Top {QUALIFY_COUNT} of each group go through.
          </p>
        </div>
        <button className="btn" onClick={goToFixtures}>
          Enter results →
        </button>
      </div>

      <div className="groupgrid">
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
                    <th title="Board difference">+/−</th>
                    <th title="Points">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {group.standings.map((row) => (
                    <tr
                      key={row.team_id}
                      className={row.rank <= QUALIFY_COUNT ? 'is-qualifying' : ''}
                    >
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
                      <td className={row.board_diff > 0 ? 'is-pos' : row.board_diff < 0 ? 'is-neg' : ''}>
                        {row.board_diff > 0 ? `+${row.board_diff}` : row.board_diff}
                      </td>
                      <td className="table__pts">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          )
        })}
      </div>
    </section>
  )
}
