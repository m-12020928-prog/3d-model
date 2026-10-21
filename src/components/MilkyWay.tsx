import { useEffect, useRef } from 'react'
import './milkyway.css'

type Star = { radius: number; angle: number; size: number; alpha: number; warm: boolean; speed: number; phase: number }
type Dust = { x: number; y: number; alpha: number; phase: number; size: number }

// 保留原来的银河与旋臂，用档案蓝和旧金色重新配光；离屏及后台不保留动画循环。
export default function MilkyWay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let width = 1, height = 1, ratio = 1, frame = 0, last = 0, elapsed = 0
    let onScreen = false, disposed = false
    let stars: Star[] = [], dust: Dust[] = []
    let nebula: HTMLCanvasElement | null = null
    const sprite = document.createElement('canvas')
    sprite.width = 32; sprite.height = 32
    const brush = sprite.getContext('2d')
    if (brush) {
      const light = brush.createRadialGradient(16, 16, 0, 16, 16, 16)
      light.addColorStop(0, '#f1e7d2e6'); light.addColorStop(0.2, '#e4d7be70'); light.addColorStop(1, '#e4d7be00')
      brush.fillStyle = light; brush.fillRect(0, 0, 32, 32)
    }
    const draw = () => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1
      context.fillStyle = '#182436'; context.fillRect(0, 0, width, height)
      context.globalCompositeOperation = 'lighter'
      if (nebula) {
        context.save(); context.translate(width * 0.55, height * 0.46)
        context.rotate(motion.matches ? 0 : Math.sin(elapsed * 0.000025) * 0.055)
        context.drawImage(nebula, -width * 0.55, -height * 0.46, width, height); context.restore()
      }
      const maxR = Math.max(width, height) * 0.68
      for (const star of stars) {
        const angle = star.angle + (motion.matches ? 0 : elapsed * 0.000009 * star.speed)
        const x = width * 0.55 + Math.cos(angle) * star.radius * maxR
        const y = height * 0.46 + Math.sin(angle) * star.radius * maxR * 0.46
        if (x < -12 || x > width + 12 || y < -12 || y > height + 12) continue
        context.globalAlpha = star.alpha * (motion.matches ? 0.8 : 0.78 + Math.sin(elapsed * 0.0007 + star.phase) * 0.22)
        const size = star.size * 2.2
        context.drawImage(sprite, x - size, y - size, size * 2, size * 2)
        if (star.warm) { context.fillStyle = '#b49352'; context.fillRect(x, y, 0.7, 0.7) }
      }
      context.fillStyle = '#e4d7be'
      for (const speck of dust) {
        const drift = motion.matches ? 0 : Math.sin(elapsed * 0.00013 + speck.phase) * 0.008
        context.globalAlpha = speck.alpha * 0.25
        context.fillRect((speck.x + drift) * width, (speck.y + drift * 0.5) * height, speck.size, speck.size)
      }
      context.globalAlpha = 1; context.globalCompositeOperation = 'source-over'
    }
    const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0 }
    const requestDraw = () => { if (!disposed && onScreen && !document.hidden && !frame) frame = requestAnimationFrame(tick) }
    function tick(time: number) {
      frame = 0
      if (disposed || !onScreen || document.hidden) { last = 0; return }
      if (!last || time - last >= 32 || motion.matches) {
        elapsed += last ? Math.min(70, time - last) : 0
        last = time; draw()
      }
      if (!motion.matches) requestDraw()
    }
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width); height = Math.max(1, rect.height)
      ratio = Math.min(window.devicePixelRatio || 1, width < 760 ? 1 : 1.25)
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
      const count = Math.round(Math.min(width < 760 ? 180 : 540, Math.max(120, width * height / 3600)))
      stars = Array.from({ length: count }, (_, index) => {
        const radius = Math.pow(Math.random(), 0.65)
        return { radius, angle: (index % 3) * Math.PI * 2 / 3 + radius * 4.1 + (Math.random() - 0.5) * (0.6 + radius * 0.6), size: 0.3 + Math.random() * 0.9, alpha: 0.15 + Math.random() * 0.55, warm: Math.random() > 0.7, speed: 0.5 + radius, phase: Math.random() * Math.PI * 2 }
      })
      dust = Array.from({ length: width < 760 ? 25 : 70 }, () => ({ x: Math.random(), y: Math.random(), alpha: Math.random(), phase: Math.random() * Math.PI * 2, size: 0.4 + Math.random() * 0.5 }))
      nebula = document.createElement('canvas'); nebula.width = Math.round(width); nebula.height = Math.round(height)
      const layer = nebula.getContext('2d')
      if (layer) {
        const clouds: Array<[number, number, number, string]> = [[0.55, 0.46, 0.65, '#b4935218'], [0.3, 0.32, 0.4, '#263b573b'], [0.78, 0.6, 0.45, '#8f292b12'], [0.5, 0.8, 0.5, '#71809512']]
        for (const [x, y, radius, colour] of clouds) {
          const r = radius * Math.max(width, height)
          const gradient = layer.createRadialGradient(width * x, height * y, 0, width * x, height * y, r)
          gradient.addColorStop(0, colour); gradient.addColorStop(1, '#18243600')
          layer.fillStyle = gradient; layer.fillRect(0, 0, width, height)
        }
      }
      if (onScreen && !document.hidden) draw()
      requestDraw()
    }
    const visibility = () => { if (document.hidden) stop(); else requestDraw() }
    const preference = () => { stop(); requestDraw() }
    const observer = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; if (onScreen) requestDraw(); else stop() }, { rootMargin: '120px' })
    observer.observe(canvas)
    const resizer = new ResizeObserver(resize); resizer.observe(canvas)
    document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', preference)
    resize()
    return () => { disposed = true; stop(); observer.disconnect(); resizer.disconnect(); document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', preference); nebula = null; stars = []; dust = [] }
  }, [])
  return <div className="milkyway" aria-hidden="true"><canvas ref={canvasRef} className="milkyway-canvas" /></div>
}
