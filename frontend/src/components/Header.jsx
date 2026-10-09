import { GROUP_STYLES } from '../constants'

function Stat({ value, label, tone }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  )
}

export default function Header({ state }) {
  const stats = state?.stats ?? { players: 0, teams: 0, matches: 0, played: 0 }
  const target = state?.target_teams ?? 25

  return (
    <header className="header">
      <div className="header__board" aria-hidden="true">
        {Object.keys(GROUP_STYLES).map((code) => (
          <span key={code} className="header__chip" style={{ '--accent': GROUP_STYLES[code].color }}>
            {code}
          </span>
        ))}
      </div>

      <p className="header__kicker">{state?.subtitle ?? 'nCompass Carrom Tournament'}</p>
      <h1 className="header__title">
        NC Carrom <span className="header__year">2026</span>
        <span className="header__dash">–</span>
        <span className="header__highlight">Team Selection!</span>
      </h1>
      <p className="header__tagline">
        Lots drawn on paper · {target} doubles teams · 5 groups · one striker to rule them all
      </p>

      <div className="header__stats">
        <Stat value={`${stats.teams}/${target}`} label="Teams in" />
        <Stat value={stats.players} label="Players" />
        <Stat value={5} label="Groups" />
        <Stat value={`${stats.played}/${stats.matches}`} label="Matches played" tone="accent" />
      </div>
    </header>
  )
}
