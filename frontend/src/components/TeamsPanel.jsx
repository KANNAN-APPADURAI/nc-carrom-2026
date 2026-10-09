import { useEffect, useMemo, useRef, useState } from 'react'
import { DEMO_TEAMS } from '../constants'

const serialise = (rows) =>
  rows
    .filter((row) => row.p1.trim() && row.p2.trim())
    .map((row) => `${row.p1.trim()}|${row.p2.trim()}`)
    .join('\n')

export default function TeamsPanel({ state, busy, hasDraw, onSave }) {
  const target = state?.target_teams ?? 25
  const nextKey = useRef(1)
  const makeRow = (p1 = '', p2 = '') => ({ key: `r${nextKey.current++}`, p1, p2 })

  const [rows, setRows] = useState(() =>
    (state?.teams ?? []).map((team) => makeRow(team.player1_name, team.player2_name)),
  )
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [bulk, setBulk] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [status, setStatus] = useState('saved')

  const firstRef = useRef(null)
  const savedRef = useRef(
    serialise((state?.teams ?? []).map((t) => ({ p1: t.player1_name, p2: t.player2_name }))),
  )

  const complete = rows.filter((row) => row.p1.trim() && row.p2.trim())
  const current = serialise(rows)
  const dirty = current !== savedRef.current

  const duplicates = useMemo(() => {
    const counts = new Map()
    rows.forEach((row) => {
      ;[row.p1, row.p2].forEach((name) => {
        const key = name.trim().toLowerCase()
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
      })
    })
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([key]) => key))
  }, [rows])

  const save = useRef(onSave)
  save.current = onSave

  // Live entry: every added team is written straight to the database, so a
  // closed laptop or a stray refresh never loses the lots already drawn.
  // Once the groups exist, saving would wipe them - so it waits for a click.
  useEffect(() => {
    if (hasDraw || !dirty || duplicates.size) return undefined
    setStatus('saving')
    const timer = setTimeout(async () => {
      const payload = complete.map((row) => ({ player1: row.p1.trim(), player2: row.p2.trim() }))
      const snapshot = current
      const ok = await save.current(payload, { quiet: true })
      if (ok) {
        savedRef.current = snapshot
        setStatus('saved')
      } else {
        setStatus('dirty')
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [current, dirty, hasDraw, duplicates.size]) // eslint-disable-line react-hooks/exhaustive-deps

  const addTeam = () => {
    if (!first.trim() || !second.trim()) return
    setRows((list) => [...list, makeRow(first.trim(), second.trim())])
    setFirst('')
    setSecond('')
    firstRef.current?.focus()
  }

  const setCell = (key, field, value) =>
    setRows((list) => list.map((row) => (row.key === key ? { ...row, [field]: value } : row)))

  const removeRow = (key) => setRows((list) => list.filter((row) => row.key !== key))

  const applyBulk = () => {
    const parsed = bulk
      .split('\n')
      .map((line) => line.replace(/^\s*\d+[.)\]]?\s*/, '').trim())
      .filter(Boolean)
      .map((line) => line.split(/\s*(?:&|\+|,|\/|\t|\svs?\s|\sand\s)\s*/i))
      .filter((parts) => parts.length >= 2)
      .map((parts) => makeRow(parts[0].trim(), parts[1].trim()))
    if (!parsed.length) return
    setRows(parsed)
    setBulk('')
    setShowBulk(false)
  }

  const canSave = complete.length > 0 && duplicates.size === 0 && dirty

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Teams</h2>
          <p className="panel__sub">
            Partners are drawn on the paper lots in the room. As each pair comes out, type the two
            names here. The app only draws which group each team lands in.
          </p>
        </div>

        <div className="meter" style={{ '--pct': `${Math.min(100, (complete.length / target) * 100)}%` }}>
          <div className="meter__bar">
            <span />
          </div>
          <div className="meter__text">
            <strong>{complete.length}</strong> / {target} teams
            <span className="meter__sub">{complete.length * 2} players</span>
          </div>
        </div>
      </div>

      {hasDraw && (
        <div className="notice notice--warn">
          <strong>The groups are already drawn.</strong> Changing the teams now clears the groups,
          fixtures and every result — you'd need to draw again. Nothing is saved until you press
          <strong> Save teams</strong>.
        </div>
      )}

      <div className="lotcard">
        <div className="lotcard__badge">
          <span className="lotcard__label">Lot</span>
          <span className="lotcard__no">{String(complete.length + 1).padStart(2, '0')}</span>
        </div>

        <div className="lotcard__fields">
          <input
            ref={firstRef}
            className="lotcard__input"
            placeholder="First name out of the hat"
            value={first}
            maxLength={60}
            disabled={busy}
            onChange={(event) => setFirst(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && addTeam()}
          />
          <span className="lotcard__amp" aria-hidden="true">
            &amp;
          </span>
          <input
            className="lotcard__input"
            placeholder="Partner they drew"
            value={second}
            maxLength={60}
            disabled={busy}
            onChange={(event) => setSecond(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && addTeam()}
          />
        </div>

        <button
          className="btn btn--primary btn--lg"
          onClick={addTeam}
          disabled={busy || !first.trim() || !second.trim()}
        >
          Add team
        </button>
      </div>

      <div className="toolbar">
        <button className="btn" onClick={() => setShowBulk((value) => !value)} disabled={busy}>
          {showBulk ? 'Hide paste box' : '📋 Paste a list'}
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => setRows(DEMO_TEAMS.map(([a, b]) => makeRow(a, b)))}
        >
          ✨ Fill sample teams
        </button>
        <button
          className="btn btn--ghost"
          disabled={busy || !rows.length}
          onClick={() => setRows([])}
        >
          Clear all
        </button>

        <span className={`savetag savetag--${hasDraw ? 'manual' : status}`}>
          {hasDraw
            ? dirty
              ? 'Unsaved changes'
              : 'Saved'
            : status === 'saving'
              ? 'Saving…'
              : 'Saved automatically'}
        </span>
      </div>

      {showBulk && (
        <div className="bulk">
          <textarea
            className="bulk__input"
            rows={8}
            placeholder={'One team per line:\nKannan & Ravi\nPriya & Sam\nArjun, Meera'}
            value={bulk}
            onChange={(event) => setBulk(event.target.value)}
          />
          <div className="bulk__actions">
            <span className="bulk__count">
              Separate the two names with &amp;, a comma, or a tab. This replaces the list below.
            </span>
            <button className="btn btn--primary" onClick={applyBulk} disabled={!bulk.trim()}>
              Load teams
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="empty">
          No teams yet. Draw the first lot, type both names above and press <kbd>Enter</kbd>.
        </p>
      ) : (
        <div className="teamlist">
          {rows.map((row, index) => {
            const dupe1 = row.p1.trim() && duplicates.has(row.p1.trim().toLowerCase())
            const dupe2 = row.p2.trim() && duplicates.has(row.p2.trim().toLowerCase())
            return (
              <div key={row.key} className={`teamrow ${dupe1 || dupe2 ? 'is-dupe' : ''}`}>
                <span className="teamrow__no">{String(index + 1).padStart(2, '0')}</span>
                <input
                  className={`teamrow__input ${dupe1 ? 'is-dupe' : ''}`}
                  value={row.p1}
                  maxLength={60}
                  disabled={busy}
                  onChange={(event) => setCell(row.key, 'p1', event.target.value)}
                />
                <span className="teamrow__amp" aria-hidden="true">
                  &amp;
                </span>
                <input
                  className={`teamrow__input ${dupe2 ? 'is-dupe' : ''}`}
                  value={row.p2}
                  maxLength={60}
                  disabled={busy}
                  onChange={(event) => setCell(row.key, 'p2', event.target.value)}
                />
                <button
                  className="teamrow__remove"
                  onClick={() => removeRow(row.key)}
                  disabled={busy}
                  aria-label={`Remove team ${index + 1}`}
                  title="Remove this team"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="panel__foot">
        <div className="checks">
          <Check ok={complete.length >= (state?.min_teams ?? 10)} label={`At least ${state?.min_teams ?? 10} teams`} />
          <Check ok={duplicates.size === 0} label="Nobody entered twice" />
          <Check ok={complete.length === target} label={`${target} teams (full house)`} soft />
        </div>

        {duplicates.size > 0 ? (
          <span className="foot__error">
            Same name in two places — add an initial to tell them apart.
          </span>
        ) : hasDraw ? (
          <button
            className="btn btn--danger btn--lg"
            disabled={busy || !canSave}
            onClick={() =>
              onSave(complete.map((row) => ({ player1: row.p1.trim(), player2: row.p2.trim() })))
            }
          >
            Save teams &amp; clear the draw
          </button>
        ) : (
          <span className="foot__hint">
            {complete.length >= (state?.min_teams ?? 10)
              ? 'Ready — head to The Draw to deal the groups.'
              : 'Keep going…'}
          </span>
        )}
      </div>
    </section>
  )
}

function Check({ ok, label, soft }) {
  return (
    <span className={`check ${ok ? 'is-ok' : soft ? 'is-soft' : 'is-bad'}`}>
      <span aria-hidden="true">{ok ? '✓' : soft ? '•' : '✕'}</span>
      {label}
    </span>
  )
}
