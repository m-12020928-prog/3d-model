import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, X } from 'lucide-react'
import MilkyWay from './MilkyWay'
import { chapterThemes, chapters, copy, tunnelPhotos } from '@/content/archive'
import type { Photo } from '@/content/archive'
import { ChapterLabel } from './ArchiveUI'
import { lookAt, multiply, perspective, projectToScreen, rotationY, scaling, translation } from './gl/matrix'
import type { Mat4, Vec3 } from './gl/matrix'
import { bindQuad, createProgram, createQuad, createTexture, loadPhoto, plateCanvas } from './gl/webgl'
import type { GlProgram, Quad } from './gl/webgl'
import './tunnel.css'

// 保留原有四章、左右交错和滚动相机。镜头只因滚动或主动选片改变，不自动巡航。
type Frame = { key: string; chapter: number; x: number; y: number; z: number; w: number; h: number; angle: number; photo: Photo }
type View = { eye: Vec3; focus: Vec3 }
type TextureEntry = { texture: WebGLTexture; size: number }
type Wanted = { photo: Photo; size: number; priority: number }
const CHAPTER_DEPTH = 88
const DEPTH = chapters.length * CHAPTER_DEPTH
const clamp = (n: number) => Math.min(1, Math.max(0, n))
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const VERTEX = `
attribute vec3 a_position;
attribute vec2 a_uv;
uniform mat4 u_model;
uniform mat4 u_viewProj;
varying vec2 v_uv;
varying vec3 v_world;
void main() {
  v_uv = a_uv;
  vec4 world = u_model * vec4(a_position, 1.0);
  v_world = world.xyz;
  gl_Position = u_viewProj * world;
}`
const FRAGMENT = `
precision mediump float;
varying vec2 v_uv;
varying vec3 v_world;
uniform sampler2D u_texture;
uniform float u_highlight;
uniform float u_opacity;
uniform float u_cameraZ;
void main() {
  vec3 colour = texture2D(u_texture, v_uv).rgb;
  vec2 edge = min(v_uv, 1.0 - v_uv);
  float border = 1.0 - smoothstep(0.012, 0.019, min(edge.x, edge.y));
  colour = mix(colour, vec3(0.89, 0.84, 0.74), border);
  float outer = 1.0 - smoothstep(0.003, 0.006, min(edge.x, edge.y));
  colour = mix(colour, vec3(0.706, 0.576, 0.322), outer * (0.45 + u_highlight * 0.55));
  float fog = pow(clamp(1.0 - abs(v_world.z - u_cameraZ) / 39.0, 0.0, 1.0), 0.75);
  gl_FragColor = vec4(mix(vec3(0.094, 0.141, 0.212), colour, fog), u_opacity * fog);
}`

function buildFrames(narrow: boolean): Frame[] {
  const order = [...tunnelPhotos]
  let seed = 1977
  for (let i = order.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    const j = seed % (i + 1)
    const value = order[i]; order[i] = order[j]; order[j] = value
  }
  return chapters.flatMap((chapter, c) => chapter.photos.map((placeholder, i) => {
    const side = i % 2 === 0 ? -1 : 1
    return {
      key: `frame-${c}-${i}`, chapter: c,
      x: side * (narrow ? 1.05 : 2.25), y: Math.sin(i * 0.8 + c * 0.3) * (narrow ? 0.14 : 0.24),
      z: -(c * CHAPTER_DEPTH + i * 4.4 + 10), w: narrow ? 1.72 : 2.4, h: narrow ? 2.24 : 3.12,
      angle: -side * (narrow ? 0.1 : 0.17), photo: order.length ? order[(c * chapter.photos.length + i) % order.length] : placeholder,
    }
  }))
}

// 在纸质装裱里完整显示照片，不把横向合照裁成狭窄的人物切片。
function mountedPhoto(image: HTMLImageElement, width: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = Math.round(width * 1.3)
  const context = canvas.getContext('2d')
  if (!context) return canvas
  context.fillStyle = '#e4d7be'; context.fillRect(0, 0, canvas.width, canvas.height)
  const inset = width * 0.035
  const ratio = Math.min((width - inset * 2) / image.naturalWidth, (canvas.height - inset * 3) / image.naturalHeight)
  const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio
  context.drawImage(image, (width - w) / 2, (canvas.height - h) / 2, w, h)
  return canvas
}

export function MemoryTunnel() {
  const frames = useMemo(() => buildFrames(false), [])
  const sectionRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const selectedRef = useRef<Frame | null>(null)
  const currentFrames = useRef(frames)
  const wake = useRef<() => void>(() => {})
  const cameraZ = useRef(8)
  const viewProj = useRef<Mat4 | null>(null)
  const savedScroll = useRef(0)
  const selectedScroll = useRef(0)
  const previousFocus = useRef<HTMLElement | null>(null)
  const [selected, setSelected] = useState<Frame | null>(null)
  const [hovered, setHovered] = useState<Frame | null>(null)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [unsupported, setUnsupported] = useState(false)
  const [failures, setFailures] = useState(0)
  const [attempt, setAttempt] = useState(0)

  const openFrame = useCallback((frame: Frame) => {
    savedScroll.current = window.scrollY
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const current = currentFrames.current.find(item => item.key === frame.key) ?? frame
    const section = sectionRef.current
    const canvas = canvasRef.current
    if (section && canvas) {
      const rect = canvas.getBoundingClientRect()
      if (rect.bottom < window.innerHeight * 0.4 || rect.top > window.innerHeight * 0.6) {
        const top = window.scrollY + section.getBoundingClientRect().top
        const progress = clamp((-current.z - 2) / (DEPTH + 8))
        window.scrollTo({ top: top + progress * Math.max(1, section.offsetHeight - window.innerHeight), behavior: 'instant' })
      }
    }
    selectedScroll.current = window.scrollY
    selectedRef.current = current; setSelected(current); wake.current()
  }, [])
  const closeFrame = useCallback(() => {
    selectedRef.current = null; setSelected(null)
    window.scrollTo({ top: savedScroll.current, behavior: 'instant' })
    previousFocus.current?.focus({ preventScroll: true }); wake.current()
  }, [])
  useEffect(() => {
    if (!selected) return
    closeRef.current?.focus({ preventScroll: true })
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') closeFrame() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [selected, closeFrame])

  useEffect(() => {
    const canvas = canvasRef.current, section = sectionRef.current
    if (!canvas || !section) return
    setUnsupported(false); setFailures(0)
    let gl: WebGLRenderingContext | null = null
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false }) } catch { /* 下面显示说明 */ }
    if (!gl) { setUnsupported(true); return }
    const context = gl
    let program: GlProgram | null = null, quad: Quad | null = null
    const textures = new Map<string, TextureEntry>()
    const waiting = new Map<string, number>()
    const failed = new Set<string>()
    let desired = new Map<string, Wanted>()
    let placeholders: { loading: WebGLTexture; failed: WebGLTexture; missing: WebGLTexture }
    try {
      program = createProgram(context, VERTEX, FRAGMENT); quad = createQuad(context)
      placeholders = {
        loading: createTexture(context, plateCanvas('THE MEMORY ARCHIVE', 'Preparing photograph')),
        failed: createTexture(context, plateCanvas('IMAGE UNAVAILABLE', 'Retry photographs below')),
        missing: createTexture(context, plateCanvas('THE MEMORY ARCHIVE', 'Photograph to be supplied')),
      }
    } catch {
      if (program) context.deleteProgram(program.program)
      if (quad) { context.deleteBuffer(quad.position); context.deleteBuffer(quad.uv) }
      setUnsupported(true); return
    }
    const surface = program, geometry = quad
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let narrow = window.innerWidth <= 760
    let activeFrames = buildFrames(narrow)
    currentFrames.current = activeFrames
    let width = 1, height = 1, disposed = false, visible = false, animation = 0
    let baseZ = 8, hoverKey = '', oldSelection = ''
    let view: View = { eye: [0, 0.12, 8], focus: [0, 0.02, -8] }
    let tween: { from: View; to: View; start: number; duration: number } | null = null
    let restoreSize: { width: number; height: number } | null = null
    const requestDraw = () => { if (!disposed && visible && !document.hidden && !animation) animation = requestAnimationFrame(draw) }
    wake.current = requestDraw
    const urlKey = (photo: Photo) => photo.src ?? photo.id
    const pump = () => {
      if (disposed || !visible || document.hidden) return
      const limit = narrow ? 2 : 3
      const jobs = [...desired.entries()].filter(([key, job]) => !failed.has(key) && !waiting.has(key) && (textures.get(key)?.size ?? 0) < job.size).sort((a, b) => a[1].priority - b[1].priority)
      for (const [key, job] of jobs) {
        if (waiting.size >= limit) break
        if (!job.photo.src) continue
        waiting.set(key, job.size)
        void loadPhoto(job.photo.src).then(image => {
          if (disposed) return
          const stillWanted = desired.get(key)
          if (!stillWanted) return
          if (!image) { failed.add(key); setFailures(failed.size); return }
          try {
            const size = Math.min(job.size, stillWanted.size)
            const texture = createTexture(context, mountedPhoto(image, size))
            const old = textures.get(key)
            if (old) context.deleteTexture(old.texture)
            textures.set(key, { texture, size })
          } catch { failed.add(key); setFailures(failed.size) }
        }).finally(() => { waiting.delete(key); if (!disposed) { requestDraw(); pump() } })
      }
    }
    const syncWindow = (eyeZ: number, selectedFrame: Frame | null) => {
      const next = new Map<string, Wanted>()
      for (const frame of activeFrames) {
        const gap = eyeZ - frame.z
        const isSelected = frame.key === selectedFrame?.key
        if (!isSelected && (gap < -14 || gap > 65)) continue
        if (!frame.photo.src) continue
        const key = urlKey(frame.photo)
        const size = isSelected ? (narrow ? 768 : 1024) : gap < 18 && gap > -3 ? 512 : 256
        const prior = next.get(key)
        const priority = isSelected ? -100 : Math.abs(gap - 9)
        next.set(key, { photo: frame.photo, size: Math.max(size, prior?.size ?? 0), priority: Math.min(priority, prior?.priority ?? Infinity) })
      }
      desired = next
      for (const [key, entry] of textures) if (!desired.has(key)) { context.deleteTexture(entry.texture); textures.delete(key) }
      pump()
    }
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width); height = Math.max(1, rect.height)
      const nextNarrow = width <= 760
      if (nextNarrow !== narrow) {
        narrow = nextNarrow; activeFrames = buildFrames(narrow); currentFrames.current = activeFrames
        const current = selectedRef.current
        if (current) { selectedRef.current = activeFrames.find(frame => frame.key === current.key) ?? current; oldSelection = '' }
      }
      const ratio = Math.min(window.devicePixelRatio || 1, narrow ? 1.25 : 1.5)
      const w = Math.round(width * ratio), h = Math.round(height * ratio)
      if (!restoreSize || restoreSize.width !== w || restoreSize.height !== h) {
        canvas.width = w; canvas.height = h; restoreSize = { width: w, height: h }
      }
      requestDraw()
    }
    function draw(time: number) {
      animation = 0
      if (disposed || !visible || document.hidden) return
      const selectedFrame = selectedRef.current
      const rect = section!.getBoundingClientRect()
      const progress = clamp(-rect.top / Math.max(1, rect.height - window.innerHeight))
      if (!selectedFrame) baseZ = 8 - progress * (DEPTH + 8)
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${progress})`
      const chapter = Math.min(chapters.length - 1, Math.max(0, Math.floor((-baseZ - 10) / CHAPTER_DEPTH)))
      setChapterIndex(current => current === chapter ? current : chapter)
      const base: View = { eye: [0, 0.12, baseZ], focus: [0, 0.02, baseZ - 16] }
      const selectionKey = selectedFrame?.key ?? ''
      if (selectionKey !== oldSelection) {
        oldSelection = selectionKey
        const target: View = selectedFrame
          ? { eye: [selectedFrame.x, selectedFrame.y - 0.45, selectedFrame.z + (narrow ? 4.15 : 5.5)], focus: [selectedFrame.x, selectedFrame.y - 0.45, selectedFrame.z] }
          : base
        tween = { from: { eye: [...view.eye], focus: [...view.focus] }, to: target, start: time, duration: motion.matches ? 0 : selectedFrame ? 850 : 550 }
      }
      if (tween) {
        const fraction = tween.duration ? clamp((time - tween.start) / tween.duration) : 1
        const eased = fraction * fraction * (3 - 2 * fraction)
        view = { eye: mix(tween.from.eye, tween.to.eye, eased), focus: mix(tween.from.focus, tween.to.focus, eased) }
        if (fraction === 1) tween = null
      } else if (!selectedFrame) view = base
      cameraZ.current = view.eye[2]
      syncWindow(view.eye[2], selectedFrame)
      const vp = multiply(perspective(0.95, width / height, 0.12, 100), lookAt(view.eye, view.focus))
      viewProj.current = vp
      context.viewport(0, 0, canvas!.width, canvas!.height)
      context.clearColor(0, 0, 0, 0); context.clear(context.COLOR_BUFFER_BIT)
      context.disable(context.DEPTH_TEST); context.enable(context.BLEND); context.blendFunc(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA)
      surface.use(); bindQuad(context, geometry, surface)
      context.uniformMatrix4fv(surface.u('u_viewProj'), false, vp)
      context.uniform1f(surface.u('u_cameraZ'), view.eye[2]); context.uniform1i(surface.u('u_texture'), 0)
      context.activeTexture(context.TEXTURE0)
      const ordered = activeFrames.filter(frame => view.eye[2] - frame.z > 0.35 && view.eye[2] - frame.z < 39).sort((a, b) => a.z - b.z)
      for (const frame of ordered) {
        const key = urlKey(frame.photo)
        const texture = textures.get(key)?.texture ?? (!frame.photo.src ? placeholders.missing : failed.has(key) ? placeholders.failed : placeholders.loading)
        const isSelected = frame.key === selectedFrame?.key
        const matrix = multiply(translation(frame.x, frame.y, frame.z), multiply(rotationY(isSelected ? frame.angle * 0.2 : frame.angle), scaling(frame.w, frame.h, 1)))
        context.uniformMatrix4fv(surface.u('u_model'), false, matrix)
        context.uniform1f(surface.u('u_highlight'), isSelected || hoverKey === frame.key ? 1 : 0)
        context.uniform1f(surface.u('u_opacity'), clamp((view.eye[2] - frame.z) / 2.6))
        context.bindTexture(context.TEXTURE_2D, texture); context.drawArrays(context.TRIANGLE_STRIP, 0, 4)
      }
      if (tween) requestDraw()
    }
    const pick = (x: number, y: number): Frame | null => {
      if (selectedRef.current || !viewProj.current) return null
      const rect = canvas.getBoundingClientRect()
      let best: Frame | null = null, nearest = Infinity
      for (const frame of activeFrames) {
        const gap = cameraZ.current - frame.z
        if (gap < 0.4 || gap > 31) continue
        const point = projectToScreen(viewProj.current, [frame.x, frame.y, frame.z], width, height)
        if (!point) continue
        const halfH = frame.h * height / (4 * gap * Math.tan(0.475)), halfW = halfH * frame.w / frame.h
        if (Math.abs(x - rect.left - point.x) <= halfW && Math.abs(y - rect.top - point.y) <= halfH && gap < nearest) { best = frame; nearest = gap }
      }
      return best
    }
    const move = (event: PointerEvent) => {
      const frame = pick(event.clientX, event.clientY)
      const next = frame?.key ?? ''
      if (next !== hoverKey) { hoverKey = next; setHovered(frame); requestDraw() }
      canvas.style.cursor = frame ? 'pointer' : 'default'
    }
    const leave = () => { hoverKey = ''; setHovered(null); canvas.style.cursor = 'default'; requestDraw() }
    let down: { x: number; y: number } | null = null
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY } }
    const click = (event: MouseEvent) => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12) return
      const frame = pick(event.clientX, event.clientY)
      if (frame) openFrame(frame)
    }
    const scroll = () => {
      // 继续滚动就退出阅读，不锁定滚轮，不把访客拖回选中照片。
      if (selectedRef.current && Math.abs(window.scrollY - selectedScroll.current) > 60) { selectedRef.current = null; setSelected(null); tween = null; oldSelection = '' }
      requestDraw()
    }
    const visibility = () => { if (!document.hidden) requestDraw() }
    const loss = (event: Event) => { event.preventDefault(); visible = false; cancelAnimationFrame(animation); animation = 0; setUnsupported(true) }
    const restored = () => setAttempt(value => value + 1)
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) { resize(); requestDraw() } else { cancelAnimationFrame(animation); animation = 0 } }, { rootMargin: '250px' })
    observer.observe(section)
    const resizer = new ResizeObserver(resize); resizer.observe(canvas)
    resize()
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerleave', leave); canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('click', click)
    canvas.addEventListener('webglcontextlost', loss); canvas.addEventListener('webglcontextrestored', restored)
    window.addEventListener('scroll', scroll, { passive: true }); document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', requestDraw)
    return () => {
      disposed = true; wake.current = () => {}; cancelAnimationFrame(animation)
      observer.disconnect(); resizer.disconnect()
      canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('click', click)
      canvas.removeEventListener('webglcontextlost', loss); canvas.removeEventListener('webglcontextrestored', restored)
      window.removeEventListener('scroll', scroll); document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', requestDraw)
      textures.forEach(entry => context.deleteTexture(entry.texture)); Object.values(placeholders).forEach(texture => context.deleteTexture(texture))
      context.deleteBuffer(geometry.position); context.deleteBuffer(geometry.uv); context.deleteProgram(surface.program)
    }
  }, [openFrame, attempt])

  const chapter = chapters[chapterIndex]
  const accessibleFrames = [...new Map(frames.map(frame => [frame.photo.id, frame])).values()]
  return <section id="memories" className="memory-tunnel" aria-labelledby="memories-title">
    <div className="page-width tunnel-heading"><ChapterLabel number="04">Memories / Beyond the frame</ChapterLabel><div className="tunnel-heading-row"><h2 id="memories-title" className="section-title">Walk through<br /><em>what we remember.</em></h2><div className="tunnel-heading-copy"><p className="section-intro">{copy.memories}</p><p className="tunnel-hint"><ArrowDown size={14} aria-hidden="true" />Scroll to walk the archive. Your pace. Your direction.</p></div></div></div>
    <div ref={sectionRef} className="tunnel-scroll" style={unsupported ? { height: '100svh' } : undefined}>
      <div className="tunnel-sticky"><MilkyWay /><canvas ref={canvasRef} className="tunnel-canvas" aria-hidden="true" />
        <div className="tunnel-hud"><div className="tunnel-hud-top"><div className="tunnel-chapter"><span className="eyebrow">{chapter.title} / Memory</span><strong>{chapterThemes[chapterIndex]}</strong></div><p className="tunnel-theme-note">Four chapters. Real archive photographs. A camera guided by your scroll.</p></div><div className="tunnel-status"><p className="tunnel-caption">{hovered ? <><strong>{hovered.photo.label}</strong> — select to look closer.</> : 'Select a photograph to look closer. Scroll to keep exploring.'}</p><span className="tunnel-counter">{unsupported ? 'WebGL unavailable' : `${frames.length} spatial frames`}</span></div><div className="tunnel-progress"><div className="tunnel-track"><span className="tunnel-fill" ref={fillRef} /></div><div className="tunnel-ticks">{chapters.map((item, i) => <span key={item.id} className={i === chapterIndex ? 'active' : ''}>{chapterThemes[i]}</span>)}</div></div></div>
        {selected && !unsupported && <aside className="tunnel-photo-note" role="dialog" aria-modal="false" aria-labelledby="memory-note-title"><button ref={closeRef} type="button" className="tunnel-close" onClick={closeFrame} aria-label="Close photograph and return to browsing"><X size={18} /></button><span className="eyebrow">Archive note / {chapters[selected.chapter].title}</span><h3 id="memory-note-title">{selected.photo.label}</h3><p>{selected.photo.caption || 'Caption not yet provided.'}</p><p>{selected.photo.event || 'Event not yet provided'} · {selected.photo.date || 'Date not yet provided'}</p></aside>}
        {unsupported && <div className="tunnel-unsupported" role="status"><div><h3>This device could not start the 3D archive.</h3><p>The Memory Tunnel needs WebGL. The original 3D scene has not been replaced with a flat gallery.</p><p>You can keep using the main navigation. A simplified alternative needs your approval first.</p><button type="button" className="stage-button" onClick={() => setAttempt(value => value + 1)}>Retry 3D archive</button></div></div>}
      </div>
    </div>
    <details className="tunnel-access"><summary>Browse photograph titles · keyboard access</summary><div className="tunnel-access-list">{accessibleFrames.map(frame => <button type="button" key={frame.key} onClick={() => openFrame(frame)}>{frame.photo.label}</button>)}</div></details>
    {failures > 0 && <div className="tunnel-access" role="status">Some photographs could not be loaded. <button type="button" className="experience-outline" onClick={() => setAttempt(value => value + 1)}>Retry photographs</button></div>}
    <div className="page-width tunnel-outro"><span className="eyebrow">The next scene</span><span className="font-display text-2xl italic text-gold">From memory to the stage.</span><ArrowDown size={17} className="text-gold" aria-hidden="true" /></div>
  </section>
}
