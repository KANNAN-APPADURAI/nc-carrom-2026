/** The road through the tournament: which stage is live, done, or still shut. */
export default function StageRibbon({ stages = [], champion }) {
  return (
    <ol className="ribbon">
      {stages.map((stage, index) => {
        const state = stage.complete ? 'done' : stage.live ? 'live' : 'locked'
        return (
          <li key={stage.id} className={`ribbon__step is-${state}`}>
            <span className="ribbon__dot" aria-hidden="true">
              {stage.complete ? '✓' : index + 1}
            </span>
            <span className="ribbon__text">
              <span className="ribbon__label">{stage.label}</span>
              <span className="ribbon__count">
                {stage.total > 0 ? `${stage.played}/${stage.total} played` : 'not drawn'}
              </span>
            </span>
            {index < stages.length - 1 && <span className="ribbon__line" aria-hidden="true" />}
          </li>
        )
      })}
      {champion && (
        <li className="ribbon__step is-champion">
          <span className="ribbon__dot" aria-hidden="true">
            ♛
          </span>
          <span className="ribbon__text">
            <span className="ribbon__label">Champions</span>
            <span className="ribbon__count">crowned</span>
          </span>
        </li>
      )}
    </ol>
  )
}
