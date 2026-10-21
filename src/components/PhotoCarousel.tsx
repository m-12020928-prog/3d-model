import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Photo } from '@/content/archive'
import './photo-carousel.css'

type Props = { photos: Photo[]; variant: 'liquid' | 'cylinder'; label: string }
const wrap = (n: number, count: number) => ((n % count) + count) % count
const relative = (n: number, count: number) => wrap(n + count / 2, count) - count / 2
const strips = Array.from({ length: 16 }, (_, i) => i)

/** 手动照片展览；没有计时推进、惯性或循环绘制。 */
export function PhotoCarousel({ photos, variant, label }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 900, height: 500 })
  const [ratios, setRatios] = useState<Record<string, number>>({})
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const [ready, setReady] = useState<Record<string, boolean>>({})
  const [near, setNear] = useState(false)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ id: number; x: number; y: number; start: number; moved: boolean; horizontal: boolean | null } | null>(null)
  const ignoreClick = useRef(false)
  const count = photos.length
  const positionRef = useRef(position)
  positionRef.current = position
  const height = Math.min(size.height * .53, size.width < 600 ? 220 : 310)
  const gap = 14
  const photoWidth = (photo: Photo) => height * Math.min(2.3, Math.max(.55, ratios[photo.id] ?? 1.5))
  const center = Math.round(position)
  const centerPhoto = photos[wrap(center, Math.max(count, 1))]
  const pitch = centerPhoto ? photoWidth(centerPhoto) + gap : 300
  const move = (delta: number) => { setSelected(null); setPosition(p => wrap(p + delta, Math.max(count, 1))) }

  useEffect(() => {
    const node = root.current
    if (!node) return
    const resize = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect?.width) setSize({ width: rect.width, height: rect.height })
    })
    resize.observe(node)
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setNear(true); observer.disconnect() } }, { rootMargin: '250px' })
    observer.observe(node)
    return () => { resize.disconnect(); observer.disconnect() }
  }, [])

  useEffect(() => {
    const node = root.current
    if (!node || count < 2) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return
      // 未操作展览时，纵向滚轮仍交给页面，不把访客困在展台。
      if (!node.contains(document.activeElement) && Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      event.preventDefault()
      setSelected(null)
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      setPosition(p => wrap(p + Math.max(-1, Math.min(1, delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1) / pitch)), count))
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
  }, [count, pitch, size.height])

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.carousel-control')) return
    ignoreClick.current = false
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: positionRef.current, moved: false, horizontal: null }
    if (event.pointerType === 'mouse') root.current?.focus({ preventScroll: true })
  }
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state || state.id !== event.pointerId) return
    const dx = event.clientX - state.x
    const dy = event.clientY - state.y
    if (state.horizontal === null && Math.hypot(dx, dy) > 7) state.horizontal = Math.abs(dx) > Math.abs(dy)
    if (!state.horizontal) return
    if (!state.moved) { state.moved = true; setDragging(true); setSelected(null); event.currentTarget.setPointerCapture(event.pointerId) }
    ignoreClick.current = true
    setPosition(wrap(state.start - dx / (variant === 'cylinder' ? Math.max(140, size.width * .4) : pitch), Math.max(count, 1)))
  }
  const pointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return
    const moved = drag.current.moved
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (moved) setPosition(p => wrap(Math.round(p), Math.max(count, 1)))
  }
  const choose = (photo: Photo, index: number) => {
    if (ignoreClick.current) { ignoreClick.current = false; return }
    if (selected === photo.id) { setSelected(null); return }
    const distance = relative(index - position, Math.max(count, 1))
    if (Math.abs(distance) > .12) { setSelected(null); setPosition(index) }
    else setSelected(photo.id)
  }
  const radius = Math.min(size.width * .48, 440)
  const angleStep = count > 1 ? Math.min(72, 360 / count) : 0
  const liquidOffset = (index: number) => {
    const distance = relative(index - center, Math.max(count, 1))
    let x = -(position - center) * pitch
    // 卡片按各自原始宽高比铺开；支持跨越首尾的连续拖动。
    if (distance > 0) for (let step = 0; step < distance; step++) {
      const a = photos[wrap(center + step, count)]
      const b = photos[wrap(center + step + 1, count)]
      x += (photoWidth(a) + photoWidth(b)) / 2 + gap
    }
    else for (let step = 0; step > distance; step--) {
      const a = photos[wrap(center + step, count)]
      const b = photos[wrap(center + step - 1, count)]
      x -= (photoWidth(a) + photoWidth(b)) / 2 + gap
    }
    return x
  }
  const curve = (x: number) => {
    const edge = Math.max(0, Math.abs(x) / Math.max(size.width / 2, 1) - .28)
    return Math.sign(x) * edge * edge * Math.min(200, size.height * .4)
  }

  return <div ref={root} className={`photo-carousel carousel-${variant}${selected ? ' is-enlarged' : ''}${dragging ? ' is-dragging' : ''}`} role="region" aria-roledescription="carousel" aria-label={label} tabIndex={0}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={() => { drag.current = null; setDragging(false) }}
    onKeyDown={event => {
      if (event.key === 'Escape') { setSelected(null); return }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1) }
      if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget && centerPhoto) { event.preventDefault(); choose(centerPhoto, wrap(center, count)) }
    }}>
    <p className="sr-only">Drag sideways or use the arrow keys to browse. Focus this gallery to use the mouse wheel. Select a side photograph to centre it; select it again to enlarge it here. Press Escape to return.</p>
    <div className="carousel-space">
      {photos.map((photo, index) => {
        const d = relative(index - position, Math.max(count, 1))
        const chosen = selected === photo.id
        const x = variant === 'liquid' ? liquidOffset(index) : 0
        const angle = d * angleStep
        const visible = chosen || (variant === 'liquid' ? Math.abs(x) < size.width / 2 + photoWidth(photo) : Math.abs(angle) < 104)
        const width = variant === 'cylinder' ? Math.min(size.width * .66, 370) : photoWidth(photo)
        const enlargedWidth = Math.min(size.width - 48, (size.height - 65) * (ratios[photo.id] ?? 1.5))
        const cardStyle: CSSProperties = {
          width: chosen ? enlargedWidth : width,
          height: chosen ? Math.min(size.height - 65, enlargedWidth / (ratios[photo.id] ?? 1.5)) : height,
          transform: chosen ? 'translate(-50%, -50%) translateZ(80px)' : variant === 'liquid' ? `translate(calc(-50% + ${x}px), -50%)` : `translate(-50%, -50%) translateZ(${-radius}px) rotateY(${angle}deg) translateZ(${radius}px)`,
          opacity: selected && !chosen ? .18 : variant === 'cylinder' ? Math.max(.2, 1 - Math.abs(angle) / 130) : 1,
          zIndex: chosen ? 40 : Math.round(20 - Math.abs(d)),
          visibility: visible ? 'visible' : 'hidden',
          pointerEvents: visible && (!selected || chosen) ? 'auto' : 'none',
        }
        return <button key={photo.id} type="button" className={`carousel-photo${chosen ? ' is-selected' : ''}`} style={cardStyle} tabIndex={visible && (!selected || chosen) ? 0 : -1} aria-label={`${chosen ? 'Reduce' : 'View'} ${photo.alt || photo.label}`} aria-pressed={chosen} onClick={() => choose(photo, index)}>
          {near && visible && photo.src && !failed[photo.id] && <img src={photo.src} alt={photo.alt || photo.label} draggable={false} loading="lazy" decoding="async" className={variant === 'liquid' && !chosen && ready[photo.id] ? 'carousel-source' : ''} onLoad={event => {
            const image = event.currentTarget
            setRatios(p => p[photo.id] ? p : { ...p, [photo.id]: image.naturalWidth / Math.max(1, image.naturalHeight) })
            setReady(p => p[photo.id] ? p : { ...p, [photo.id]: true })
          }} onError={() => setFailed(p => ({ ...p, [photo.id]: true }))} />}
          {near && visible && variant === 'liquid' && !chosen && ready[photo.id] && !failed[photo.id] && <span className="carousel-ribbon" aria-hidden="true">{strips.map(i => {
            const local = ((i + .5) / strips.length - .5) * width
            const global = x + local
            const shift = curve(global)
            const slope = (curve(global + 1) - curve(global - 1)) / 2
            return <span key={i} className="carousel-slice" style={{ left: `${i / strips.length * 100}%`, width: `calc(${100 / strips.length}% + .6px)`, backgroundImage: `url("${photo.src}")`, backgroundSize: `${width}px ${height}px`, backgroundPosition: `${-i / strips.length * width}px 0`, transform: `translateY(${shift}px) skewY(${Math.atan(slope) * 180 / Math.PI}deg) rotateY(${-Math.min(32, Math.abs(global) / size.width * 38) * Math.sign(global)}deg)` }} />
          })}</span>}
          {(!photo.src || failed[photo.id]) && <span className="carousel-fallback" role="status">{failed[photo.id] ? 'Photograph unavailable' : 'Photograph not yet provided'}</span>}
          {photo.src && !failed[photo.id] && !ready[photo.id] && <span className="carousel-loading" role="status">Loading photograph…</span>}
        </button>
      })}
    </div>
    {!count && <p className="carousel-fallback">Photographs not yet provided</p>}
    {count > 1 && <><button type="button" className="carousel-control carousel-prev" aria-label="Previous photograph" onClick={() => move(-1)}><ChevronLeft size={19} /></button><button type="button" className="carousel-control carousel-next" aria-label="Next photograph" onClick={() => move(1)}><ChevronRight size={19} /></button></>}
    {selected && <button type="button" className="carousel-control carousel-close" aria-label="Close enlarged photograph" onClick={() => setSelected(null)}><X size={19} /></button>}
  </div>
}
