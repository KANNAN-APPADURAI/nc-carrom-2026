import { groupStyle, signed } from '../constants'

/**
 * The twelve Super Six places, as boxes that fill in while the league plays.
 * Until every league match is in, the occupants are provisional.
 */
export default function QualificationBoard({ league }) {
  const groups = league?.groups ?? []
  const thirds = league?.thirds ?? []
  const settled = Boolean(league?.complete)

  const placed = (group, rank) => {
    const row = group.standings?.find((entry) => entry.rank === rank)
    // Nobody has played yet, so the table is just the draw order - show nothing.
    return group.played > 0 ? row : null
  }

  return (
    <div className="qualboard">
      <div className="qualboard__head">
        <h3>Qualification board</h3>
        <span className={`pill ${settled ? 'pill--done' : ''}`}>
          {settled ? 'Final' : `Provisional · ${league.played}/${league.total} league matches`}
        </span>
      </div>

      <div className="qualboard__row">
        <section>
          <h4 className="qualboard__kind">Group winners</h4>
          <div className="slotgrid">
            {groups.map((group) => (
              <Slot
                key={`w-${group.code}`}
                accent={groupStyle(group.code).color}
                label={`Group ${group.code} · 1st`}
                row={placed(group, 1)}
                settled={settled}
              />
            ))}
          </div>
        </section>

        <section>
          <h4 className="qualboard__kind">Runners-up</h4>
          <div className="slotgrid">
            {groups.map((group) => (
              <Slot
                key={`r-${group.code}`}
                accent={groupStyle(group.code).color}
                label={`Group ${group.code} · 2nd`}
                row={placed(group, 2)}
                settled={settled}
              />
            ))}
          </div>
        </section>
      </div>

      <section>
        <h4 className="qualboard__kind">
          Best third-placed teams <span>— on points, then PD</span>
        </h4>
        <div className="slotgrid slotgrid--thirds">
          <Slot
            label="Best 3rd overall → Golf"
            badge="1"
            row={thirds[0]}
            settled={settled}
            accent="var(--mint)"
            note={thirds[0] ? `from Group ${thirds[0].from_group}` : null}
          />
          <Slot
            label="2nd best 3rd → Foxtrot"
            badge="2"
            row={thirds[1]}
            settled={settled}
            accent="var(--mint)"
            note={thirds[1] ? `from Group ${thirds[1].from_group}` : null}
          />
          {thirds[2] && (
            <Slot
              label="First team missing out"
              badge="3"
              row={thirds[2]}
              settled={settled}
              accent="var(--queen)"
              note={`from Group ${thirds[2].from_group}`}
              out
            />
          )}
        </div>
      </section>
    </div>
  )
}

export function Slot({ label, row, settled, accent, badge, note, out }) {
  return (
    <div
      className={`slotbox ${row ? 'is-filled' : 'is-empty'} ${out ? 'is-out' : ''} ${
        settled && row ? 'is-settled' : ''
      }`}
      style={{ '--accent': accent }}
    >
      <span className="slotbox__label">
        {badge && <span className="slotbox__badge">{badge}</span>}
        {label}
      </span>

      {row ? (
        <>
          <span className="slotbox__team">
            <span className="slotbox__code">{row.code}</span>
            {row.players.join(' & ')}
          </span>
          <span className="slotbox__stats">
            {row.points} pts · {signed(row.pd)}
            {note && <span className="slotbox__note"> · {note}</span>}
            {!settled && <span className="slotbox__prov"> · provisional</span>}
          </span>
        </>
      ) : (
        <span className="slotbox__empty">— to be decided —</span>
      )}
    </div>
  )
}

/** The two Super Six groups as empty seats, before the draw deals them. */
export function SuperSixShells() {
  const shells = [
    {
      code: 'F',
      name: 'Foxtrot',
      seats: [
        'a group winner',
        'a group winner',
        'a group winner',
        'a runner-up',
        'a runner-up',
        '2nd best 3rd',
      ],
    },
    {
      code: 'G',
      name: 'Golf',
      seats: [
        'a runner-up',
        'a runner-up',
        'a runner-up',
        'a group winner',
        'a group winner',
        'best 3rd',
      ],
    },
  ]

  return (
    <div className="shells">
      {shells.map((shell) => (
        <div
          key={shell.code}
          className="shells__col"
          style={{ '--accent': groupStyle(shell.code).color }}
        >
          <h4>
            Group {shell.code} · {shell.name}
          </h4>
          <ul>
            {shell.seats.map((seat, index) => (
              <li key={index}>
                <span className="shells__code">
                  {shell.code}
                  {index + 1}
                </span>
                <span className="shells__seat">{seat}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
