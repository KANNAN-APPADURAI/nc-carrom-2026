import { useEffect } from 'react'

const ICONS = { success: '✓', error: '!', info: 'i' }

export default function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(onDone, toast.kind === 'error' ? 6000 : 3500)
    return () => clearTimeout(timer)
  }, [toast, onDone])

  if (!toast) return null

  return (
    <div className={`toast toast--${toast.kind}`} role="status">
      <span className="toast__icon" aria-hidden="true">
        {ICONS[toast.kind] ?? 'i'}
      </span>
      <span>{toast.text}</span>
      <button className="toast__close" onClick={onDone} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
