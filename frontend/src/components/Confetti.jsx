import { useEffect, useRef } from 'react'

const COLORS = ['#F6C445', '#38BDF8', '#FB7185', '#34D399', '#A78BFA', '#FFFFFF']

/** A short burst of carrom-coin confetti. Fires once per `fireKey` change. */
export default function Confetti({ fireKey }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!fireKey) return undefined
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return undefined

    const context = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const width = () => canvas.clientWidth
    const height = () => canvas.clientHeight

    const coins = Array.from({ length: 120 }, () => ({
      x: width() / 2 + (Math.random() - 0.5) * width() * 0.6,
      y: height() * 0.3 + Math.random() * 40,
      vx: (Math.random() - 0.5) * 9,
      vy: -6 - Math.random() * 9,
      r: 4 + Math.random() * 6,
      spin: (Math.random() - 0.5) * 0.3,
      angle: Math.random() * Math.PI,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 1,
    }))

    let frame
    const tick = () => {
      context.clearRect(0, 0, width(), height())
      let alive = false
      for (const coin of coins) {
        coin.vy += 0.28
        coin.vx *= 0.995
        coin.x += coin.vx
        coin.y += coin.vy
        coin.angle += coin.spin
        coin.life -= 0.006
        if (coin.life <= 0 || coin.y > height() + 40) continue
        alive = true
        context.save()
        context.translate(coin.x, coin.y)
        context.rotate(coin.angle)
        context.globalAlpha = Math.max(0, Math.min(1, coin.life))
        context.fillStyle = coin.color
        context.beginPath()
        context.ellipse(0, 0, coin.r, coin.r * 0.45, 0, 0, Math.PI * 2)
        context.fill()
        context.restore()
      }
      if (alive) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [fireKey])

  return <canvas className="confetti" ref={canvasRef} aria-hidden="true" />
}
