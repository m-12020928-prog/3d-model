import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import type { Instrument } from '@/content/archive'
import { MATERIALS, instrumentModel } from './gl/instruments3d'
import type { InstrumentModel } from './gl/instruments3d'
import { loadInstrumentModel } from './gl/glb'
import { INSTRUMENT_MODELS } from '@/content/instrument-models'
import { lookAt, multiply, perspective } from './gl/matrix'
import type { Vec3 } from './gl/matrix'

const VERTEX = `
attribute vec3 a_position;
attribute vec3 a_normal;
uniform mat4 u_viewProj;
varying vec3 v_normal;
varying vec3 v_world;
void main() {
  v_world = a_position;
  v_normal = a_normal;
  gl_Position = u_viewProj * vec4(a_position, 1.0);
}`
// 不用霓虹或泛光；解析式柔光箱营造棚灯反射，保留铜、银与哑光木管的差异。
const FRAGMENT = `
precision highp float;
varying vec3 v_normal;
varying vec3 v_world;
uniform vec3 u_eye;
uniform vec3 u_color;
uniform float u_metal;
uniform float u_rough;
void main() {
  vec3 n = normalize(v_normal);
  vec3 v = normalize(u_eye - v_world);
  if (dot(n, v) < 0.0) n = -n;
  vec3 keyDir = normalize(vec3(0.5, 0.85, 0.65));
  vec3 fillDir = normalize(vec3(-0.8, 0.3, 0.45));
  vec3 rimDir = normalize(vec3(0.2, 0.3, -0.9));
  vec3 base = pow(u_color, vec3(2.2));
  float rough = clamp(u_rough, 0.12, 1.0);
  float key = max(dot(n, keyDir), 0.0);
  float fill = max(dot(n, fillDir), 0.0);
  vec3 r = reflect(-v, n);
  float sky = clamp(r.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 env = mix(vec3(0.055, 0.07, 0.095), vec3(0.3, 0.34, 0.4), sky);
  float softbox = pow(max(dot(r, keyDir), 0.0), mix(42.0, 4.0, rough));
  float strip = pow(max(dot(r, fillDir), 0.0), mix(90.0, 7.0, rough));
  env += vec3(0.94, 0.79, 0.57) * softbox * 1.65;
  env += vec3(0.52, 0.65, 0.8) * strip * 0.8;
  env += vec3(0.27, 0.07, 0.065) * pow(max(dot(r, rimDir), 0.0), 4.0) * 0.2;
  vec3 f0 = mix(vec3(0.04), base, u_metal);
  vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 diffuse = base * (vec3(0.22, 0.25, 0.3) + key * vec3(1.1, 0.92, 0.7) + fill * vec3(0.15, 0.2, 0.28));
  vec3 color = diffuse * (1.0 - u_metal) + env * fresnel;
  float spec = pow(max(dot(n, normalize(keyDir + v)), 0.0), mix(100.0, 8.0, rough));
  color += f0 * spec * (1.0 - rough) * 0.7;
  color = color / (1.0 + color * 0.45);
  gl_FragColor = vec4(pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
}`

type Camera = { yaw: number; pitch: number; dist: number; intro: number }
type DrawPart = { position: WebGLBuffer; normal: WebGLBuffer; index: WebGLBuffer; count: number; color: Float32Array; metal: number; rough: number; type: number }
type Props = { instrument: Instrument; firstReveal?: boolean; onIntroDone?: () => void }
const START: Camera = { yaw: -0.6, pitch: 0.04, dist: 3.05, intro: 1 }
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function createSurface(gl: WebGLRenderingContext) {
  const shaders: WebGLShader[] = []
  const program = gl.createProgram()
  if (!program) throw new Error('Display unavailable')
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Display unavailable')
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Display unavailable')
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Display unavailable')
    return program
  } catch (error) { gl.deleteProgram(program); throw error }
  finally { shaders.forEach(shader => gl.deleteShader(shader)) }
}

export function InstrumentStage({ instrument, firstReveal = true, onIntroDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camera = useRef<Camera>({ ...START })
  const callback = useRef(onIntroDone)
  const first = useRef(firstReveal)
  const interacted = useRef(false)
  const command = useRef<(kind: 'closer' | 'further' | 'reset' | 'skip') => void>(() => {})
  const [failed, setFailed] = useState(false)
  const [custom, setCustom] = useState<InstrumentModel | null>(null)
  const [customError, setCustomError] = useState(false)
  const [intro, setIntro] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [contextVersion, setContextVersion] = useState(0)
  const config = INSTRUMENT_MODELS[instrument.id]
  useEffect(() => { callback.current = onIntroDone }, [onIntroDone])
  useEffect(() => {
    let cancelled = false
    setCustom(null); setCustomError(false)
    const model = INSTRUMENT_MODELS[instrument.id]
    if (model) void loadInstrumentModel(model.url, { body: model.body, finishes: model.finishes })
      .then(value => { if (!cancelled) setCustom(value) })
      .catch(() => { if (!cancelled) setCustomError(true) })
    return () => { cancelled = true }
  }, [instrument.id, attempt])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setFailed(false)
    let gl: WebGLRenderingContext | null = null
    try { gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) } catch { /* 状态面板说明 */ }
    if (!gl) { setFailed(true); return }
    const context = gl
    const buffers: WebGLBuffer[] = []
    const parts: DrawPart[] = []
    let surface: WebGLProgram
    try {
      surface = createSurface(context)
    } catch { setFailed(true); return }
    const cleanupGpu = () => { buffers.forEach(buffer => context.deleteBuffer(buffer)); context.deleteProgram(surface) }
    try {
      const model = custom ?? instrumentModel(instrument.id)
      if (!model.meshes.length) throw new Error('No geometry')
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]
      for (const item of model.meshes) for (let i = 0; i < item.mesh.positions.length; i++) {
        const axis = i % 3
        min[axis] = Math.min(min[axis], item.mesh.positions[i]); max[axis] = Math.max(max[axis], item.mesh.positions[i])
      }
      const extent = Math.max(...max.map((value, i) => value - min[i]))
      if (!Number.isFinite(extent) || extent <= 0) throw new Error('No geometry')
      const scale = 1.75 / extent
      const center = max.map((value, i) => (value + min[i]) / 2)
      const wideSupported = context.getExtension('OES_element_index_uint')
      const buffer = (target: number, data: Float32Array | Uint16Array | Uint32Array) => {
        const result = context.createBuffer()
        if (!result) throw new Error('Display memory unavailable')
        buffers.push(result); context.bindBuffer(target, result); context.bufferData(target, data, context.STATIC_DRAW)
        return result
      }
      for (const item of model.meshes) {
        const wide = item.mesh.indices instanceof Uint32Array
        if (wide && !wideSupported) throw new Error('Large meshes unavailable')
        const source = item.mesh.positions
        const positions = new Float32Array(source.length)
        for (let i = 0; i < source.length; i++) positions[i] = (source[i] - center[i % 3]) * scale
        const look = item.look ?? MATERIALS[item.material]
        parts.push({ position: buffer(context.ARRAY_BUFFER, positions), normal: buffer(context.ARRAY_BUFFER, item.mesh.normals), index: buffer(context.ELEMENT_ARRAY_BUFFER, item.mesh.indices), count: item.mesh.indices.length, type: wide ? context.UNSIGNED_INT : context.UNSIGNED_SHORT, color: new Float32Array(look.color), metal: look.metal, rough: look.rough })
      }
    } catch { cleanupGpu(); setFailed(true); return }

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    const view = camera.current
    Object.assign(view, START)
    view.intro = custom && first.current && !interacted.current && !motion.matches ? 0 : 1
    setIntro(view.intro < 1)
    const finish = () => {
      view.intro = 1; setIntro(false)
      if (custom && first.current) { first.current = false; callback.current?.() }
    }
    if (custom && view.intro === 1) finish()
    let frame = 0
    let visible = true
    let disposed = false
    let previous = 0
    let pointer: { x: number; y: number } | null = null
    let targetX = 0, targetY = 0, offsetX = 0, offsetY = 0
    const position = context.getAttribLocation(surface, 'a_position')
    const normal = context.getAttribLocation(surface, 'a_normal')
    const locations = Object.fromEntries(['u_viewProj', 'u_eye', 'u_color', 'u_metal', 'u_rough'].map(name => [name, context.getUniformLocation(surface, name)]))
    context.enable(context.DEPTH_TEST); context.depthFunc(context.LEQUAL); context.disable(context.CULL_FACE)
    context.clearColor(0, 0, 0, 0)
    const requestDraw = () => { if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(draw) }
    function draw(now: number) {
      frame = 0
      if (disposed || !visible || document.hidden) { previous = 0; return }
      const width = canvas!.clientWidth, height = canvas!.clientHeight
      if (!width || !height) return
      const delta = previous ? Math.min((now - previous) / 1000, 0.05) : 0
      previous = now
      const ratio = Math.min(window.devicePixelRatio || 1, width < 600 ? 1.5 : 1.75)
      const w = Math.round(width * ratio), h = Math.round(height * ratio)
      if (canvas!.width !== w || canvas!.height !== h) { canvas!.width = w; canvas!.height = h }
      if (view.intro < 1) {
        view.intro = Math.min(1, view.intro + delta / 4.4)
        if (view.intro === 1) finish()
      }
      if (motion.matches) { offsetX = 0; offsetY = 0 }
      else { offsetX += (targetX - offsetX) * 0.16; offsetY += (targetY - offsetY) * 0.16 }
      const eased = view.intro * view.intro * (3 - 2 * view.intro)
      const distance = 4.2 + (view.dist - 4.2) * eased
      const yaw = -1.15 + (view.yaw + 1.15) * eased + offsetX
      const eye: Vec3 = [Math.sin(yaw) * distance, 0.24 + view.pitch * 1.5 + offsetY, Math.cos(yaw) * distance]
      context.viewport(0, 0, w, h); context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT); context.useProgram(surface)
      context.uniformMatrix4fv(locations.u_viewProj, false, multiply(perspective(0.72, width / height, 0.1, 40), lookAt(eye, [0, 0, 0])))
      context.uniform3fv(locations.u_eye, eye)
      for (const part of parts) {
        context.bindBuffer(context.ARRAY_BUFFER, part.position); context.vertexAttribPointer(position, 3, context.FLOAT, false, 0, 0); context.enableVertexAttribArray(position)
        context.bindBuffer(context.ARRAY_BUFFER, part.normal); context.vertexAttribPointer(normal, 3, context.FLOAT, false, 0, 0); context.enableVertexAttribArray(normal)
        context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, part.index)
        context.uniform3fv(locations.u_color, part.color); context.uniform1f(locations.u_metal, part.metal); context.uniform1f(locations.u_rough, part.rough)
        context.drawElements(context.TRIANGLES, part.count, part.type, 0)
      }
      if (view.intro < 1 || Math.abs(targetX - offsetX) + Math.abs(targetY - offsetY) > 0.0003) requestDraw()
      else previous = 0
    }
    const takeOver = () => { interacted.current = true; finish(); targetX = 0; targetY = 0 }
    command.current = kind => {
      takeOver()
      if (kind === 'closer') view.dist = clamp(view.dist - 0.38, 1.85, 4.6)
      if (kind === 'further') view.dist = clamp(view.dist + 0.38, 1.85, 4.6)
      if (kind === 'reset') Object.assign(view, START)
      requestDraw()
    }
    const onDown = (event: PointerEvent) => { if (event.button !== 0) return; takeOver(); pointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); requestDraw() }
    const onMove = (event: PointerEvent) => {
      if (pointer) {
        view.yaw -= (event.clientX - pointer.x) * 0.0085
        view.pitch = clamp(view.pitch + (event.clientY - pointer.y) * 0.004, -0.5, 0.5)
        pointer = { x: event.clientX, y: event.clientY }
      } else if (fine.matches && !motion.matches && view.intro === 1) {
        const rect = canvas.getBoundingClientRect()
        targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 0.065
        targetY = -((event.clientY - rect.top) / rect.height - 0.5) * 0.04
      }
      requestDraw()
    }
    const onUp = () => { pointer = null }
    const onLeave = () => { targetX = 0; targetY = 0; requestDraw() }
    const onWheel = (event: WheelEvent) => {
      if (document.activeElement !== canvas) return
      event.preventDefault(); takeOver()
      view.dist = clamp(view.dist + event.deltaY * 0.0025, 1.85, 4.6); requestDraw()
    }
    const onKey = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return
      event.preventDefault(); takeOver()
      if (event.key === 'ArrowLeft') view.yaw += 0.14
      if (event.key === 'ArrowRight') view.yaw -= 0.14
      if (event.key === 'ArrowUp') view.dist = clamp(view.dist - 0.28, 1.85, 4.6)
      if (event.key === 'ArrowDown') view.dist = clamp(view.dist + 0.28, 1.85, 4.6)
      if (event.key === 'Home') Object.assign(view, START)
      requestDraw()
    }
    const onVisibility = () => { previous = 0; if (document.hidden) { cancelAnimationFrame(frame); frame = 0 } else requestDraw() }
    const onMotion = () => { if (motion.matches) { finish(); targetX = 0; targetY = 0 }; requestDraw() }
    const onLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); frame = 0; setFailed(true) }
    const onRestored = () => setContextVersion(value => value + 1)
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; previous = 0; if (!visible) { cancelAnimationFrame(frame); frame = 0 } else requestDraw() }, { rootMargin: '60px' })
    observer.observe(canvas)
    const resize = new ResizeObserver(requestDraw); resize.observe(canvas)
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp); canvas.addEventListener('lostpointercapture', onUp); canvas.addEventListener('pointerleave', onLeave); canvas.addEventListener('keydown', onKey)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onRestored)
    document.addEventListener('visibilitychange', onVisibility); motion.addEventListener('change', onMotion)
    requestDraw()
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); command.current = () => {}
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('lostpointercapture', onUp); canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('keydown', onKey)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored)
      document.removeEventListener('visibilitychange', onVisibility); motion.removeEventListener('change', onMotion); cleanupGpu()
    }
  }, [instrument.id, custom, contextVersion])

  return <div className={`instrument-stage stage-${instrument.id}`}>
    <div className="stage-orbit orbit-one" aria-hidden="true" /><div className="stage-orbit orbit-two" aria-hidden="true" /><div className="stage-floor" aria-hidden="true" />
    <span className="stage-coordinate eyebrow">Exhibit 0{['saxophone', 'french-horn', 'trumpet', 'clarinet'].indexOf(instrument.id) + 1} / {instrument.character}</span>
    <span className="stage-word" aria-hidden="true">{instrument.character}</span>
    <div className="instrument-canvas-wrap">
      {!custom && !failed && <span className="stage-badge">Illustrative fallback</span>}
      <canvas ref={canvasRef} className="instrument-canvas" tabIndex={0} role="img" aria-label={`Three-dimensional ${instrument.name}. Drag or use Left and Right to rotate. Up and Down zoom; Home resets the view.`} />
      {config && !custom && !failed && <div className="stage-load-note" role="status">{customError ? <>The model could not be loaded. An illustrative fallback is shown. <button type="button" className="stage-button" onClick={() => setAttempt(value => value + 1)}>Try again</button></> : 'Loading the instrument. An illustrative fallback is shown meanwhile.'}</div>}
      {intro && !failed && <button type="button" className="stage-button stage-intro-skip" onClick={() => command.current('skip')}>Skip intro</button>}
      {failed ? <div className="model-placeholder" role="status"><span className="eyebrow">3D view unavailable</span><p>This browser could not display the instrument.</p><small>The instrument notes remain available.</small><button type="button" className="stage-button" onClick={() => setContextVersion(value => value + 1)}>Try 3D again</button></div> : <div className="stage-controls"><span className="stage-hint eyebrow">Drag to turn · Arrow keys to explore</span><div className="stage-buttons"><button type="button" className="stage-button" aria-label="Move closer" onClick={() => command.current('closer')}><ChevronUp size={14} /></button><button type="button" className="stage-button" aria-label="Move further away" onClick={() => command.current('further')}><ChevronDown size={14} /></button><button type="button" className="stage-button" aria-label="Reset the view" onClick={() => command.current('reset')}><RefreshCw size={14} /></button></div></div>}
    </div>
  </div>
}
export default InstrumentStage
