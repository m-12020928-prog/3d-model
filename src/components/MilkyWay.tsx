import { useEffect, useRef } from 'react'
import './milkyway.css'

// 银河背景：纯 canvas 绘制，无额外依赖。
// 多层星云 + 三条旋臂 + 遍布全屏的星点，全部缓慢漂移；减少动态偏好时只画一帧静态画面。

type Star = { radius: number; angle: number; size: number; alpha: number; warm: boolean; speed: number; phase: number }
type Dust = { x: number; y: number; alpha: number; phase: number; size: number }

const TILT = 0.46

function radialSprite(radius: number, stops: Array<[number, string]>): HTMLCanvasElement {
  const sprite = document.createElement('canvas')
  sprite.width = radius * 2
  sprite.height = radius * 2
  const ctx = sprite.getContext('2d')
  if (!ctx) return sprite
  const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius)
  stops.forEach(([offset, colour]) => gradient.addColorStop(offset, colour))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, sprite.width, sprite.height)
  return sprite
}

export default function MilkyWay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const narrow = window.matchMedia('(max-width: 760px)').matches
    const dot = radialSprite(9, [[0, 'rgba(255,255,255,1)'], [0.28, 'rgba(240,240,236,0.9)'], [0.62, 'rgba(200,220,246,0.28)'], [1, 'rgba(200,220,246,0)']])

    let width = 1
    let height = 1
    let ratio = 1
    let stars: Star[] = []
    let dust: Dust[] = []
    let nebula: HTMLCanvasElement | null = null
    let base: CanvasGradient | null = null
    let animation = 0
    let last = 0
    let visible = true
    let disposed = false

    const buildNebula = (w: number, h: number): HTMLCanvasElement | null => {
      const layer = document.createElement('canvas')
      layer.width = Math.max(1, Math.round(w * ratio))
      layer.height = Math.max(1, Math.round(h * ratio))
      const ctx = layer.getContext('2d')
      if (!ctx) return null
      ctx.scale(ratio, ratio)
      ctx.globalCompositeOperation = 'lighter'

      const cx = w * 0.58
      const cy = h * 0.46
      const maxR = Math.max(w, h) * 0.68
      const disc = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR)
      disc.addColorStop(0, 'rgba(224,234,248,0.34)')
      disc.addColorStop(0.14, 'rgba(198,168,117,0.18)')
      disc.addColorStop(0.4, 'rgba(96,132,182,0.12)')
      disc.addColorStop(1, 'rgba(18,30,50,0)')
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(1, TILT)
      ctx.translate(-cx, -cy)
      ctx.fillStyle = disc
      ctx.beginPath()
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      const clouds: Array<[number, number, number, string]> = [
        [0.22, 0.18, 0.44, 'rgba(112,45,58,0.3)'],
        [0.8, 0.3, 0.38, 'rgba(198,168,117,0.24)'],
        [0.42, 0.8, 0.52, 'rgba(58,92,146,0.26)'],
        [0.66, 0.66, 0.34, 'rgba(185,200,213,0.16)'],
        [0.1, 0.6, 0.32, 'rgba(52,84,130,0.22)'],
        [0.5, 0.42, 0.26, 'rgba(230,240,255,0.14)'],
      ]
      clouds.forEach(([px, py, pr, colour]) => {
        const r = pr * Math.max(w, h)
        const gradient = ctx.createRadialGradient(w * px, h * py, 0, w * px, h * py, r)
        gradient.addColorStop(0, colour)
        gradient.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(w * px, h * py, r, 0, Math.PI * 2)
        ctx.fill()
      })
      return layer
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      base = context.createRadialGradient(width * 0.52, height * 0.44, 0, width * 0.52, height * 0.44, Math.max(width, height) * 0.85)
      base.addColorStop(0, '#0b1526')
      base.addColorStop(0.52, '#070d17')
      base.addColorStop(1, '#03050a')
      nebula = buildNebula(width, height)

      const capacity = Math.round(Math.min(1600, Math.max(380, (width * height) / 2400)))
      const count = narrow ? Math.round(capacity * 0.55) : capacity
      stars = Array.from({ length: count }, (_, i) => {
        const radius = Math.pow(Math.random(), 0.62)
        const arm = i % 3
        return {
          radius,
          angle: (arm * Math.PI * 2) / 3 + radius * 4.1 + (Math.random() - 0.5) * (0.75 + radius * 0.7),
          size: 0.35 + Math.random() * 1.15 + (1 - radius) * 0.5,
          alpha: 0.18 + Math.random() * 0.72,
          warm: Math.random() > 0.72,
          speed: 0.5 + radius * 1.15,
          phase: Math.random() * Math.PI * 2,
        }
      })

      const dustCount = Math.round(Math.min(280, Math.max(70, (width * height) / 11000)))
      dust = Array.from({ length: dustCount }, () => ({
        x: Math.random(),
        y: Math.random(),
        alpha: 0.12 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        size: 0.4 + Math.random() * 1.1,
      }))
      draw(0)
    }

    const draw = (time: number) => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = 1
      context.clearRect(0, 0, width, height)
      if (base) {
        context.fillStyle = base
        context.fillRect(0, 0, width, height)
      }

      context.globalCompositeOperation = 'lighter'
      if (nebula) {
        context.save()
        context.translate(width / 2, height / 2)
        context.rotate(reduced ? 0.2 : Math.sin(time * 0.000035) * 0.08 + time * 0.000009)
        context.scale(1.3, 1.3)
        context.globalAlpha = 0.92
        context.drawImage(nebula, -width / 2, -height / 2, width, height)
        context.restore()
      }

      const cx = width * 0.58
      const cy = height * 0.46
      const maxR = Math.max(width, height) * 0.66
      const spin = reduced ? 0 : time * 0.000024
      for (const star of stars) {
        const angle = star.angle + spin * star.speed
        const r = star.radius * maxR
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r * TILT
        if (x < -50 || x > width + 50 || y < -50 || y > height + 50) continue
        const twinkle = reduced ? 1 : 0.68 + Math.sin(time * 0.0011 + star.phase) * 0.32
        context.globalAlpha = Math.min(1, star.alpha * twinkle)
        context.fillStyle = star.warm ? 'rgba(236,214,176,1)' : 'rgba(214,228,247,1)'
        const s = star.size * 2.5
        context.drawImage(dot, x - s, y - s, s * 2, s * 2)
      }

      for (const speck of dust) {
        const drift = reduced ? 0 : Math.sin(time * 0.00022 + speck.phase) * 0.012
        const x = ((speck.x + drift) % 1) * width
        const y = ((speck.y + drift * 0.6) % 1) * height
        context.globalAlpha = reduced ? speck.alpha * 0.8 : speck.alpha * (0.55 + Math.sin(time * 0.0016 + speck.phase) * 0.45)
        context.fillStyle = 'rgba(226,236,250,1)'
        const s = speck.size * 1.6
        context.drawImage(dot, x - s, y - s, s * 2, s * 2)
      }
      context.globalAlpha = 1
      context.globalCompositeOperation = 'source-over'
    }

    resize()

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resize())
      resizeObserver.observe(canvas)
    } else {
      window.addEventListener('resize', resize)
    }

    let viewObserver: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined') {
      viewObserver = new IntersectionObserver(entries => {
        visible = entries[0]?.isIntersecting ?? true
      }, { rootMargin: '160px' })
      viewObserver.observe(canvas)
    }

    const onVisibility = () => {
      visible = !document.hidden
    }
    document.addEventListener('visibilitychange', onVisibility)

    if (!reduced) {
      const loop = (time: number) => {
        if (disposed) return
        animation = window.requestAnimationFrame(loop)
        if (!visible) {
          last = time
          return
        }
        last = time
        draw(time)
      }
      animation = window.requestAnimationFrame(loop)
    }

    return () => {
      disposed = true
      window.cancelAnimationFrame(animation)
      document.removeEventListener('visibilitychange', onVisibility)
      if (resizeObserver) resizeObserver.disconnect()
      else window.removeEventListener('resize', resize)
      viewObserver?.disconnect()
    }
  }, [])

  return (
    <div className="milkyway" aria-hidden="true">
      <canvas ref={canvasRef} className="milkyway-canvas" />
    </div>
  )
}
