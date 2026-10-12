/**
 * The run-in as a graph: every tie is a node, every line says what travels
 * along it. Drawn as one inline SVG on a fixed viewBox so the geometry stays
 * exact while the whole thing scales to its container.
 *
 *   Foxtrot winner  ─┐
 *                    ├─> Qualifier 1 ──winner──────────────> FINAL
 *   Golf winner     ─┘        └──loser──┐                      ^
 *                                       v                      │
 *   Foxtrot runner-up ─┐          Qualifier 2 ──winner─────────┘
 *                      ├─> Eliminator ─^      └──loser──> 3rd place
 *   Golf runner-up    ─┘        └──loser──> out
 */

const W = 1000
const H = 430

const FEED_X = 10
const FEED_W = 184
const FEED_H = 44

const FEEDERS = [
  { key: 'q1a', y: 28, group: 'F', label: 'Foxtrot winner' },
  { key: 'q1b', y: 84, group: 'G', label: 'Golf winner' },
  { key: 'ea', y: 266, group: 'F', label: 'Foxtrot runner-up' },
  { key: 'eb', y: 322, group: 'G', label: 'Golf runner-up' },
]

const Q1 = { x: 244, y: 40, w: 204, h: 96 }
const EL = { x: 244, y: 268, w: 204, h: 96 }
const Q2 = { x: 524, y: 154, w: 204, h: 96 }
const FIN = { x: 790, y: 26, w: 196, h: 100 }
const THIRD = { x: 790, y: 288, w: 196, h: 76 }

const fit = (text, max) =>
  !text ? '' : text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`

/** A soft S-curve from one node's edge to another's. */
const curve = (x1, y1, x2, y2) => {
  const dx = Math.max(28, (x2 - x1) * 0.45)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

export default function PlayoffGraph({ state, teamsById }) {
  const playoffs = state?.playoffs ?? {}
  const bySlot = Object.fromEntries((playoffs.matches ?? []).map((m) => [m.slot, m]))
  const superGroups = state?.super_six?.groups ?? []

  const seat = (code, index) => {
    const group = superGroups.find((g) => g.code === code)
    if (!group || group.played < group.total_matches) return null
    return teamsById.get(group.standings?.[index]?.team_id)
  }

  const feederTeam = {
    q1a: seat('F', 0),
    q1b: seat('G', 0),
    ea: seat('F', 1),
    eb: seat('G', 1),
  }

  const name = (team) =>
    team ? fit(`${team.player1_name} & ${team.player2_name}`, 24) : null

  const tie = (slot) => {
    const match = bySlot[slot] ?? {}
    return {
      match,
      a: teamsById.get(match.team_a_id),
      b: teamsById.get(match.team_b_id),
      winner: match.played ? match.winner_team_id : null,
    }
  }

  const q1 = tie('q1')
  const el = tie('eliminator')
  const q2 = tie('q2')
  const fin = tie('final')

  const champion = teamsById.get(playoffs.champion)
  const third = teamsById.get(playoffs.third_place)
  const out = teamsById.get(playoffs.eliminated)

  return (
    <div className="graph">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Playoff bracket">
        <title>Playoff bracket: Qualifier 1, Eliminator, Qualifier 2 and the Final</title>
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* ---------- edges, drawn under the nodes ---------- */}
        <g className="graph__edges">
          <Edge d={curve(FEED_X + FEED_W, 50, Q1.x, 70)} />
          <Edge d={curve(FEED_X + FEED_W, 106, Q1.x, 106)} />
          <Edge d={curve(FEED_X + FEED_W, 288, EL.x, 298)} />
          <Edge d={curve(FEED_X + FEED_W, 344, EL.x, 334)} />

          <Edge
            d={curve(Q1.x + Q1.w, 70, FIN.x, 60)}
            label="winner"
            lx={612}
            ly={52}
            tone="win"
          />
          <Edge
            d={curve(Q1.x + Q1.w, 112, Q2.x, 184)}
            label="loser"
            lx={488}
            ly={142}
            tone="loss"
          />
          <Edge
            d={curve(EL.x + EL.w, 296, Q2.x, 224)}
            label="winner"
            lx={488}
            ly={252}
            tone="win"
          />
          <Edge
            d={curve(EL.x + EL.w, 340, 600, 392)}
            label="loser · out"
            lx={556}
            ly={404}
            tone="loss"
          />
          <Edge
            d={curve(Q2.x + Q2.w, 180, FIN.x, 96)}
            label="winner"
            lx={762}
            ly={128}
            tone="win"
          />
          <Edge
            d={curve(Q2.x + Q2.w, 228, THIRD.x, 318)}
            label="loser"
            lx={762}
            ly={268}
            tone="loss"
          />
        </g>

        {/* ---------- feeder boxes ---------- */}
        {FEEDERS.map((feed) => (
          <Feeder
            key={feed.key}
            y={feed.y}
            group={feed.group}
            label={feed.label}
            team={feederTeam[feed.key]}
          />
        ))}

        {/* ---------- ties ---------- */}
        <Node
          box={Q1}
          title="Qualifier 1"
          tie={q1}
          fallbackA="Foxtrot winner"
          fallbackB="Golf winner"
          name={name}
        />
        <Node
          box={EL}
          title="Eliminator"
          tie={el}
          fallbackA="Foxtrot runner-up"
          fallbackB="Golf runner-up"
          name={name}
        />
        <Node
          box={Q2}
          title="Qualifier 2"
          tie={q2}
          fallbackA="Qualifier 1 loser"
          fallbackB="Eliminator winner"
          name={name}
        />
        <Node
          box={FIN}
          title="Final"
          tie={fin}
          fallbackA="Qualifier 1 winner"
          fallbackB="Qualifier 2 winner"
          name={name}
          crown
        />

        {/* ---------- third place ---------- */}
        <g className={`graph__node graph__node--third ${third ? 'is-filled' : ''}`}>
          <rect x={THIRD.x} y={THIRD.y} width={THIRD.w} height={THIRD.h} rx="12" />
          <text x={THIRD.x + 14} y={THIRD.y + 24} className="graph__title">
            Third place
          </text>
          <text x={THIRD.x + 14} y={THIRD.y + 50} className="graph__team">
            {third ? `${third.code}  ${name(third)}` : '— to be decided —'}
          </text>
        </g>

        {/* ---------- eliminated ---------- */}
        <text x={604} y={396} className="graph__out">
          {out ? `${out.code} eliminated` : 'eliminated'}
        </text>

        {champion && (
          <text x={FIN.x + FIN.w / 2} y={FIN.y + FIN.h + 26} className="graph__champ">
            ♛ champions
          </text>
        )}
      </svg>
    </div>
  )
}

function Edge({ d, label, lx, ly, tone }) {
  return (
    <>
      <path className={`graph__edge ${tone ? `graph__edge--${tone}` : ''}`} d={d} markerEnd="url(#arrow)" />
      {label && (
        <text className={`graph__edgelabel ${tone ? `graph__edgelabel--${tone}` : ''}`} x={lx} y={ly}>
          {label}
        </text>
      )}
    </>
  )
}

function Feeder({ y, group, label, team }) {
  return (
    <g className={`graph__node graph__node--feed g-${group} ${team ? 'is-filled' : ''}`}>
      <rect x={FEED_X} y={y} width={FEED_W} height={FEED_H} rx="10" />
      <text x={FEED_X + 12} y={y + 18} className="graph__title">
        {label}
      </text>
      <text x={FEED_X + 12} y={y + 35} className="graph__team">
        {team ? `${team.code}  ${team.player1_name}` : '— to be decided —'}
      </text>
    </g>
  )
}

function Node({ box, title, tie, fallbackA, fallbackB, name, crown }) {
  const { match, a, b, winner } = tie
  const rows = [
    { team: a, fallback: fallbackA },
    { team: b, fallback: fallbackB },
  ]

  return (
    <g className={`graph__node ${match.played ? 'is-played' : ''} ${crown ? 'graph__node--final' : ''}`}>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="12" />
      <text x={box.x + 14} y={box.y + 24} className="graph__title">
        {crown ? '♛ ' : ''}
        {title}
      </text>

      {rows.map((row, index) => {
        const won = row.team && winner === row.team.id
        return (
          <text
            key={index}
            x={box.x + 14}
            y={box.y + 50 + index * 24}
            className={`graph__team ${won ? 'is-winner' : ''} ${
              row.team ? '' : 'is-empty'
            }`}
          >
            {won ? '✓ ' : ''}
            {row.team ? `${row.team.code}  ${name(row.team)}` : row.fallback}
          </text>
        )
      })}
    </g>
  )
}
