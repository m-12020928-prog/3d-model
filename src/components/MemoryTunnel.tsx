import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, X } from 'lucide-react'
import MilkyWay from './MilkyWay'
import { chapterThemes, chapters, copy, tunnelPhotos } from '@/content/archive'
import type { Photo } from '@/content/archive'
import { ChapterLabel } from './ArchiveUI'
import { lookAt, multiply, perspective, projectToScreen, rotationX, rotationY, scaling, translation } from './gl/matrix'
import type { Mat4, Vec3 } from './gl/matrix'
import { bindQuad, coverCanvas, createProgram, createQuad, createTexture, loadPhoto } from './gl/webgl'
import type { GlProgram } from './gl/webgl'
import './tunnel.css'

// 记忆隧道：原生 WebGL 空间（无额外三维库）。
// 相机只跟随滚动位置，可逆、不吸附、不自动前进；照片与画框位置都不代表已核实的活动事实。

type Frame = {
  key: string
  chapter: number
  index: number
  x: number
  y: number
  z: number
  w: number
  h: number
  rotX: number
  rotY: number
  photo: Photo
  real: boolean
}

type TunnelVariant = 'wide' | 'narrow'

// 每章沿纵深铺开 18 张照片：左右交替、尺寸一致，前后距离拉开但仍可连续浏览。
const CHAPTER_DEPTH = 88
const FRAME_GAP = 4.4
const TUNNEL_DEPTH = chapters.length * CHAPTER_DEPTH

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
uniform vec3 u_fog;
void main() {
  vec3 colour = texture2D(u_texture, v_uv).rgb;
  vec2 edge = min(v_uv, 1.0 - v_uv);
  float border = step(min(edge.x, edge.y), 0.03);
  colour = mix(colour, vec3(0.78, 0.66, 0.46), border * (0.6 + u_highlight * 0.4));
  colour = mix(colour, vec3(0.78, 0.66, 0.46), u_highlight * 0.12);
  float distanceToCamera = abs(v_world.z - u_cameraZ);
  float fog = clamp(1.0 - distanceToCamera / 30.0, 0.0, 1.0);
  fog = pow(fog, 0.85);
  vec3 faded = mix(u_fog, colour, fog);
  gl_FragColor = vec4(faded, u_opacity * fog);
}`

function buildFrames(variant: TunnelVariant): Frame[] {
  const narrow = variant === 'narrow'
  const frames: Frame[] = []
  const seedPhoto: Photo = tunnelPhotos[0] ?? { id: 'archive-photo', label: 'Archive photograph', theme: 'memory' }
  chapters.forEach((chapter, chapterIndex) => {
    const count = chapter.photos.length
    for (let index = 0; index < count; index += 1) {
      // 每张照片左右交替：偶数靠左、奇数靠右，尺寸基本一致，只做轻微上下错开与向内倾斜。
      // 两侧明显向中轴收拢，中央仍留出足以穿行的通道。
      const side = index % 2 === 0 ? -1 : 1
      frames.push({
        key: `frame-${chapterIndex}-${index}`,
        chapter: chapterIndex,
        index,
        x: side * (narrow ? 1.05 : 2.25),
        y: Math.sin(index * 0.8) * (narrow ? 0.14 : 0.24),
        z: -(chapterIndex * CHAPTER_DEPTH + index * FRAME_GAP + 10),
        w: narrow ? 1.72 : 2.4,
        h: narrow ? 2.24 : 3.12,
        rotX: 0,
        rotY: -side * (narrow ? 0.1 : 0.17),
        photo: seedPhoto,
        real: true,
      })
    }
  })
  // 每个画框都用真实照片：档案顺序固定打散一次，重复出现前会先走完整个档案，不出现空框。
  const order = archiveOrder()
  if (order.length) frames.forEach((frame, i) => {
    const photo = order[i % order.length]
    if (photo) frame.photo = photo
  })
  return frames
}

// 固定种子打散照片顺序：服务端与浏览器得到同一顺序，不会出现水合不一致。
function archiveOrder(): Photo[] {
  const list = [...tunnelPhotos]
  let seed = 1977
  for (let i = list.length - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    const j = seed % (i + 1)
    const a = list[i]
    const b = list[j]
    if (a && b) {
      list[i] = b
      list[j] = a
    }
  }
  return list
}

export function MemoryTunnel() {
  const frames = useMemo(() => buildFrames('wide'), [])
  const sectionRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)
  const hoveredRef = useRef<Frame | null>(null)
  const viewProjRef = useRef<Mat4 | null>(null)
  const cameraZRef = useRef(0)
  const activeRef = useRef<Frame[]>([])
  const savedScroll = useRef(0)
  const [hovered, setHovered] = useState<Frame | null>(null)
  const [selected, setSelected] = useState<Frame | null>(null)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [unsupported, setUnsupported] = useState(false)

  const openFrame = useCallback((frame: Frame) => {
    if (typeof window !== 'undefined') savedScroll.current = window.scrollY
    setSelected(frame)
  }, [])

  const closeFrame = useCallback(() => {
    setSelected(null)
    if (typeof window !== 'undefined') window.scrollTo({ top: savedScroll.current, behavior: 'auto' })
  }, [])

  useEffect(() => {
    if (!selected) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFrame()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, closeFrame])

  useEffect(() => {
    const canvas = canvasRef.current
    const section = sectionRef.current
    if (!canvas || !section) return
    let context: WebGLRenderingContext | null = null
    try {
      context = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false }) as WebGLRenderingContext | null
    } catch {
      context = null
    }
    if (!context) {
      setUnsupported(true)
      return
    }
    const gl = context
    let program: GlProgram
    let quad: ReturnType<typeof createQuad>
    try {
      program = createProgram(gl, VERTEX, FRAGMENT)
      quad = createQuad(gl)
    } catch {
      setUnsupported(true)
      return
    }

    const textures = new Map<string, WebGLTexture>()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const narrow = window.matchMedia('(max-width: 760px)').matches
    // 手机使用窄屏错位排列：更小的两侧位移与画面尺寸，所有照片都保留，纵深不变。
    // 桌面与手机都贴近中轴，中央的穿行通道始终保留。
    const activeFrames = narrow ? buildFrames('narrow') : frames
    activeRef.current = activeFrames
    let disposed = false
    let needsDraw = true
    let inView = true

    const sources = new Map<string, string>()
    activeFrames.forEach(frame => {
      if (frame.photo.src) sources.set(frame.photo.id, frame.photo.src)
    })
    sources.forEach((url, id) => {
      void loadPhoto(url).then(image => {
        if (!image || disposed) return
        try {
          textures.set(`photo-${id}`, createTexture(gl, coverCanvas(image, 512, 682)))
          needsDraw = true
        } catch {
          // 跨源图片无法上传为纹理时保留待补版面，不出现空白画框。
        }
      })
    })

    const textureFor = (frame: Frame): WebGLTexture | null => textures.get(`photo-${frame.photo.id}`) ?? null

    let cssWidth = 1
    let cssHeight = 1
    const resize = () => {
      needsDraw = true
      const rect = canvas.getBoundingClientRect()
      cssWidth = Math.max(1, rect.width)
      cssHeight = Math.max(1, rect.height)
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75)
      canvas.width = Math.round(cssWidth * ratio)
      canvas.height = Math.round(cssHeight * ratio)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      // 尺寸变化后需要重画一帧。
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(canvas)
    } else {
      window.addEventListener('resize', resize)
    }

    let progress = 0
    const viewObserver = new IntersectionObserver(entries => {
      inView = entries[0]?.isIntersecting ?? true
    }, { rootMargin: '200px' })
    viewObserver.observe(section)

    const pick = (clientX: number, clientY: number): Frame | null => {
      const viewProj = viewProjRef.current
      if (!viewProj) return null
      const rect = canvas.getBoundingClientRect()
      const pointerX = clientX - rect.left
      const pointerY = clientY - rect.top
      let best: Frame | null = null
      let bestScore = Number.POSITIVE_INFINITY
      for (const frame of activeRef.current) {
        // 用画面在屏幕上的实际大小判断命中，远近的画框都在自己的范围内可点。
        const gap = cameraZRef.current - frame.z
        if (gap < 0.4 || gap > 26) continue
        const screen = projectToScreen(viewProj, [frame.x, frame.y, frame.z], cssWidth, cssHeight)
        if (!screen) continue
        const halfHeight = ((frame.h / 2) / (gap * Math.tan(0.475))) * (cssHeight / 2)
        const halfWidth = halfHeight * (frame.w / frame.h)
        const dx = (screen.x - pointerX) / Math.max(30, halfWidth)
        const dy = (screen.y - pointerY) / Math.max(30, halfHeight)
        const score = dx * dx + dy * dy
        if (score <= 1 && score < bestScore) {
          bestScore = score
          best = frame
        }
      }
      return best
    }

    const onMove = (event: PointerEvent) => {
      const frame = pick(event.clientX, event.clientY)
      if (frame?.key !== hoveredRef.current?.key) {
        hoveredRef.current = frame
        setHovered(frame)
      }
      canvas.style.cursor = frame ? 'pointer' : 'default'
    }
    const onLeave = () => {
      hoveredRef.current = null
      setHovered(null)
      canvas.style.cursor = 'default'
    }
    const onClick = (event: MouseEvent) => {
      const frame = pick(event.clientX, event.clientY)
      if (frame) openFrame(frame)
    }
    const onScroll = () => {
      /* 滚动位置每帧读取，监听只用于让移动端提前唤醒渲染。 */
    }

    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('click', onClick)
    window.addEventListener('scroll', onScroll, { passive: true })

    let animation = 0
    let last = 0
    const render = (time: number) => {
      animation = window.requestAnimationFrame(render)
      if (!inView && time - last < 120) return
      last = time
      const rect = section.getBoundingClientRect()
      const distance = Math.max(1, rect.height - window.innerHeight)
      const target = Math.min(1, Math.max(0, -rect.top / distance))
      const settled = Math.abs(target - progress) < 0.0006
      progress = reduced || settled ? target : progress + (target - progress) * 0.1
      // 静止时不重画：没有滚动、没有新纹理，画面就完全不动。
      if (settled && !needsDraw) { progress = target; return }
      needsDraw = false
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${progress.toFixed(4)})`
      // 相机走到最后一张照片之后：整条隧道都被走完，结尾留出干净的空白。
      const cameraZ = 8 - progress * (TUNNEL_DEPTH + 8)
      cameraZRef.current = cameraZ
      // 章节名跟随相机所处的纵深区间，与画框所属章节对齐。
      const chapter = Math.min(chapters.length - 1, Math.max(0, Math.floor((-cameraZ - 10) / CHAPTER_DEPTH)))
      setChapterIndex(current => (current === chapter ? current : chapter))
      const eye: Vec3 = [0, 0.12, cameraZ]
      const focus: Vec3 = [0, 0.02, cameraZ - 16]
      const projection = perspective(0.95, cssWidth / cssHeight, 0.1, 120)
      const view = lookAt(eye, focus, [0, 1, 0])
      const viewProj = multiply(projection, view)
      viewProjRef.current = viewProj

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.disable(gl.DEPTH_TEST)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      program.use()
      bindQuad(gl, quad, program)
      gl.uniformMatrix4fv(program.u('u_viewProj'), false, viewProj)
      gl.uniform1f(program.u('u_cameraZ'), cameraZ)
      gl.uniform3f(program.u('u_fog'), 0.063, 0.082, 0.114)
      gl.uniform1i(program.u('u_texture'), 0)
      gl.activeTexture(gl.TEXTURE0)

      const ordered = activeFrames.filter(frame => frame.z < cameraZ - 0.4).sort((a, b) => a.z - b.z)
      for (const frame of ordered) {
        const gap = Math.abs(frame.z - cameraZ)
        if (gap > 31) continue
        const texture = textureFor(frame)
        if (!texture) continue
        const model = multiply(
          translation(frame.x, frame.y, frame.z),
          multiply(rotationY(frame.rotY), multiply(rotationX(frame.rotX), scaling(frame.w, frame.h, 1))),
        )
        gl.uniformMatrix4fv(program.u('u_model'), false, model)
        gl.uniform1f(program.u('u_highlight'), hoveredRef.current?.key === frame.key ? 1 : 0)
        gl.uniform1f(program.u('u_opacity'), Math.min(1, gap / 2.6))
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
    }
    animation = window.requestAnimationFrame(render)

    return () => {
      disposed = true
      window.cancelAnimationFrame(animation)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('click', onClick)
      window.removeEventListener('scroll', onScroll)
      viewObserver.disconnect()
      if (resizeObserver) resizeObserver.disconnect()
      else window.removeEventListener('resize', resize)
      textures.forEach(texture => gl.deleteTexture(texture))
      gl.deleteBuffer(quad.position)
      gl.deleteBuffer(quad.uv)
      gl.deleteProgram(program.program)
    }
  }, [frames, openFrame])

  const chapter = chapters[Math.min(chapterIndex, chapters.length - 1)]
  const theme = chapterThemes[Math.min(chapterIndex, chapterThemes.length - 1)]
  const realFrames = frames

  return (
    <section id="memories" className="memory-tunnel" aria-labelledby="memories-title">
      <div className="page-width tunnel-heading">
        <ChapterLabel number="04">Memories / Beyond the frame</ChapterLabel>
        <div className="tunnel-heading-row">
          <h2 id="memories-title" className="section-title">Walk through<br /><em>what we remember.</em></h2>
          <div className="tunnel-heading-copy">
            <p className="section-intro">{copy.memories}</p>
            <p className="tunnel-hint"><ArrowDown size={14} aria-hidden="true" /> Scroll to walk the archive. Nothing moves on its own.</p>
          </div>
        </div>
      </div>

      <div className="tunnel-scroll" ref={sectionRef}>
        <div className="tunnel-sticky">
          <MilkyWay />
          <canvas ref={canvasRef} className="tunnel-canvas" aria-hidden="true" />
          <div className="tunnel-hud">
            <div className="tunnel-hud-top">
              <div className="tunnel-chapter">
                <span className="eyebrow">{chapter.title} / Memory</span>
                <strong>{theme}</strong>
              </div>
              <p className="tunnel-theme-note">Four chapters of real archive photographs. The camera follows your scroll only — nothing plays on its own.</p>
            </div>
            <div className="tunnel-status">
              <p className="tunnel-caption" aria-live="polite">
                {hovered
                  ? <><strong>{hovered.photo.label}</strong> — click to open this photograph.</>
                  : 'Move across a frame to read it. Click to open it.'}
              </p>
              <span className="tunnel-counter">{activeFramesLabel(frames.length, unsupported)}</span>
            </div>
            <div className="tunnel-progress">
              <div className="tunnel-track"><span className="tunnel-fill" ref={fillRef} /></div>
              <div className="tunnel-ticks">
                {chapters.map((item, i) => <span key={item.id} className={i === chapterIndex ? 'active' : ''}>{chapterThemes[i]}</span>)}
              </div>
            </div>
          </div>
          {unsupported && (
            <div className="tunnel-unsupported" role="status">
              <div>
                <h3>This device could not start the 3D archive.</h3>
                <p>The Memory Tunnel needs WebGL. Your browser did not provide it, so nothing is being drawn here instead.</p>
                <p>A simplified alternative would change a centrepiece of the design, so it needs your approval before it is built.</p>
                <ul>{chapters.map((item, i) => <li key={item.id}>{item.title} — {chapterThemes[i]}</li>)}</ul>
              </div>
            </div>
          )}
          <ul className="tunnel-sr">
            {realFrames.map(frame => <li key={frame.key}><button type="button" onClick={() => openFrame(frame)}>{frame.photo.label}</button></li>)}
          </ul>
        </div>
      </div>

      <div className="page-width tunnel-outro">
        <span className="eyebrow">The next scene</span>
        <span className="font-display text-2xl italic text-gold">From memory to the stage.</span>
        <ArrowDown size={17} className="text-gold" aria-hidden="true" />
      </div>

      {selected && (
        <div className="tunnel-overlay" role="dialog" aria-modal="true" aria-label={selected.photo.label}>
          <button type="button" className="tunnel-close" onClick={closeFrame} aria-label="Close photograph"><X size={18} /></button>
          <figure>
            {selected.photo.src
              ? <img src={selected.photo.src} alt={selected.photo.alt ?? selected.photo.label} />
              : <div className="tunnel-overlay-empty">This photograph is being prepared for the archive.</div>}
            <figcaption>
              <strong>{selected.photo.label}</strong>
              {selected.photo.caption ?? 'Archive photograph.'}
              {selected.photo.event ? <> · {selected.photo.event}{selected.photo.date ? `, ${selected.photo.date}` : ''}</> : null}
            </figcaption>
          </figure>
        </div>
      )}
    </section>
  )
}

function activeFramesLabel(total: number, unsupported: boolean): string {
  if (unsupported) return 'WebGL unavailable'
  return `${total} archive photographs`
}
