import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import type { Instrument } from '@/content/archive'
import { MATERIALS, instrumentModel } from './gl/instruments3d'
import type { InstrumentModel } from './gl/instruments3d'
import { loadGlbModel } from './gl/glb'
import { SAXOPHONE_MODEL } from '@/content/saxophone-model'
import { lookAt, multiply, perspective } from './gl/matrix'
import type { Vec3 } from './gl/matrix'

// 展台只用原生 WebGL 显示本站自制的乐器模型：先按整体包围盒居中并缩放，
// 因此无论模型原始尺寸多大，都会完整落在镜头里。旋转、缩放与部件选择都可用。
const VERTEX = `
attribute vec3 a_position;
attribute vec3 a_normal;
uniform mat4 u_model;
uniform mat4 u_viewProj;
varying vec3 v_normal;
varying vec3 v_world;
void main() {
  vec4 world = u_model * vec4(a_position, 1.0);
  v_world = world.xyz;
  v_normal = (u_model * vec4(a_normal, 0.0)).xyz;
  gl_Position = u_viewProj * world;
}`

const FRAGMENT = `
precision highp float;
varying vec3 v_normal;
varying vec3 v_world;
uniform vec3 u_eye;
uniform vec3 u_color;
uniform float u_metal;
uniform float u_rough;
uniform float u_focus;
void main() {
  vec3 n = normalize(v_normal);
  vec3 v = normalize(u_eye - v_world);
  if (dot(n, v) < 0.0) { n = -n; }
  vec3 keyDir = normalize(vec3(0.42, 0.84, 0.52));
  vec3 fillDir = normalize(vec3(-0.76, 0.22, 0.32));
  float key = max(dot(n, keyDir), 0.0);
  float fill = max(dot(n, fillDir), 0.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.4);
  vec3 halfVec = normalize(keyDir + v);
  float spec = pow(max(dot(n, halfVec), 0.0), mix(64.0, 9.0, u_rough)) * mix(0.35, 1.0, u_metal);
  vec3 color = u_color * (0.14 + key * 1.05);
  color += u_color * fill * 0.3 + vec3(1.0, 0.93, 0.82) * spec;
  color += vec3(0.42, 0.56, 0.72) * rim * (0.26 + u_metal * 0.36);
  color = color / (1.0 + color * 0.32);
  // 选中部件：保持亮度并加一层金色光；未选中的部件退到背景里。
  float dim = min(u_focus, 1.0);
  float glow = max(u_focus - 1.0, 0.0);
  color = color * dim + vec3(0.24, 0.19, 0.1) * glow;
  gl_FragColor = vec4(color, 1.0);
}`

type Camera = { yaw: number; pitch: number; dist: number; intro: number }
type Program = { program: WebGLProgram; use(): void; u(name: string): WebGLUniformLocation | null; a(name: string): number }
type DrawPart = { position: WebGLBuffer; normal: WebGLBuffer; index: WebGLBuffer; count: number; color: [number, number, number]; metal: number; rough: number; part: string | null; type: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const START: Camera = { yaw: -0.6, pitch: 0.04, dist: 3.05, intro: 0 }

function shader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shaderObject = gl.createShader(type)
  if (!shaderObject) return null
  gl.shaderSource(shaderObject, source)
  gl.compileShader(shaderObject)
  if (!gl.getShaderParameter(shaderObject, gl.COMPILE_STATUS)) { gl.deleteShader(shaderObject); return null }
  return shaderObject
}

function program(gl: WebGLRenderingContext): Program | null {
  const result = gl.createProgram()
  if (!result) return null
  const vertex = shader(gl, gl.VERTEX_SHADER, VERTEX)
  const fragment = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  if (!vertex || !fragment) return null
  gl.attachShader(result, vertex); gl.attachShader(result, fragment); gl.linkProgram(result)
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) { gl.deleteProgram(result); return null }
  return {
    program: result,
    use: () => gl.useProgram(result),
    u: (name: string) => gl.getUniformLocation(result, name),
    a: (name: string) => gl.getAttribLocation(result, name),
  }
}

// 把模型空间里的锚点投到画布像素坐标，用来摆放部件标记。
function projectPoint(matrix: Float32Array, point: Vec3): { x: number; y: number; w: number } {
  const [px, py, pz] = point
  const x = matrix[0] * px + matrix[4] * py + matrix[8] * pz + matrix[12]
  const y = matrix[1] * px + matrix[5] * py + matrix[9] * pz + matrix[13]
  const w = matrix[3] * px + matrix[7] * py + matrix[11] * pz + matrix[15]
  return { x, y, w }
}

type StageProps = { instrument: Instrument; firstReveal?: boolean; onIntroDone?: () => void; selectedPart?: string | null; onSelectPart?: (id: string) => void }

export function InstrumentStage({ instrument, firstReveal = true, onIntroDone, selectedPart = null, onSelectPart }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camera = useRef<Camera>({ ...START })
  const introCallback = useRef(onIntroDone)
  const focusRef = useRef<string | null>(selectedPart)
  const markerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [failed, setFailed] = useState(false)
  const [custom, setCustom] = useState<InstrumentModel | null>(null)
  const [customError, setCustomError] = useState(false)
  const [customLoading, setCustomLoading] = useState(false)

  useEffect(() => {
    setCustom(null)
    setCustomError(false)
    setCustomLoading(false)
    if (instrument.id !== 'saxophone' || !SAXOPHONE_MODEL.url) return
    let cancelled = false
    setCustomLoading(true)
    loadGlbModel(SAXOPHONE_MODEL.url, SAXOPHONE_MODEL.anchors)
      .then(loaded => { if (!cancelled) setCustom(loaded) })
      .catch(() => { if (!cancelled) setCustomError(true) })
      .finally(() => { if (!cancelled) setCustomLoading(false) })
    return () => { cancelled = true }
  }, [instrument.id])

  useEffect(() => { introCallback.current = onIntroDone }, [onIntroDone])
  useEffect(() => { focusRef.current = selectedPart }, [selectedPart])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setFailed(false)
    let gl: WebGLRenderingContext | null = null
    try {
      gl = (canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    } catch { gl = null }
    if (!gl) { setFailed(true); return }
    const context = gl

    const surface = program(context)
    if (!surface) { setFailed(true); return }

    const model = custom ?? instrumentModel(instrument.id)
    const uintExt = context.getExtension('OES_element_index_uint')
    if (!model || model.meshes.length === 0) { setFailed(true); return }

    // 整体包围盒：把模型居中并缩放到统一的展示尺寸。
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const item of model.meshes) {
      const positions = item.mesh.positions
      for (let i = 0; i < positions.length; i += 3) {
        if (positions[i] < minX) minX = positions[i]
        if (positions[i] > maxX) maxX = positions[i]
        if (positions[i + 1] < minY) minY = positions[i + 1]
        if (positions[i + 1] > maxY) maxY = positions[i + 1]
        if (positions[i + 2] < minZ) minZ = positions[i + 2]
        if (positions[i + 2] > maxZ) maxZ = positions[i + 2]
      }
    }
    const largest = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
    const scale = Number.isFinite(largest) && largest > 0.0001 ? 1.75 / largest : 1
    const centreX = (minX + maxX) / 2
    const centreY = (minY + maxY) / 2
    const centreZ = (minZ + maxZ) / 2

    const parts: DrawPart[] = []
    try {
      for (const item of model.meshes) {
        const source = item.mesh.positions
        const positions = new Float32Array(source.length)
        for (let i = 0; i < source.length; i += 3) {
          positions[i] = (source[i] - centreX) * scale
          positions[i + 1] = (source[i + 1] - centreY) * scale
          positions[i + 2] = (source[i + 2] - centreZ) * scale
        }
        const positionBuffer = context.createBuffer()
        const normalBuffer = context.createBuffer()
        const indexBuffer = context.createBuffer()
        if (!positionBuffer || !normalBuffer || !indexBuffer) throw new Error('buffer')
        context.bindBuffer(context.ARRAY_BUFFER, positionBuffer)
        context.bufferData(context.ARRAY_BUFFER, positions, context.STATIC_DRAW)
        context.bindBuffer(context.ARRAY_BUFFER, normalBuffer)
        context.bufferData(context.ARRAY_BUFFER, item.mesh.normals, context.STATIC_DRAW)
        context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, indexBuffer)
        const wide = item.mesh.indices instanceof Uint32Array
        if (wide && !uintExt) throw new Error('uint indices')
        context.bufferData(context.ELEMENT_ARRAY_BUFFER, item.mesh.indices, context.STATIC_DRAW)
        const material = item.look ?? MATERIALS[item.material]
        parts.push({ position: positionBuffer, normal: normalBuffer, index: indexBuffer, count: item.mesh.indices.length, color: material.color, metal: material.metal, rough: material.rough, part: item.part ?? null, type: wide ? context.UNSIGNED_INT : context.UNSIGNED_SHORT })
      }
    } catch { setFailed(true); return }

    // 每个部件取一个锚点，标记跟着模型一起转动。
    const anchors: { id: string; point: Vec3 }[] = []
    for (const item of instrument.parts) {
      const raw = model.anchors[item.id]?.[0]
      if (!raw) continue
      anchors.push({ id: item.id, point: [(raw[0] - centreX) * scale, (raw[1] - centreY) * scale, (raw[2] - centreZ) * scale] })
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const view = camera.current
    view.yaw = START.yaw
    view.pitch = START.pitch
    view.dist = START.dist
    view.intro = reduced || !firstReveal ? 1 : 0
    if (view.intro >= 1) introCallback.current?.()

    context.enable(context.DEPTH_TEST)
    context.depthFunc(context.LEQUAL)
    context.disable(context.CULL_FACE)
    context.clearColor(0, 0, 0, 0)
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

    let frame = 0
    let previous = performance.now()
    let drawnFrames = 0
    let pointer: { x: number; y: number } | null = null

    const onPointerDown = (event: PointerEvent) => { pointer = { x: event.clientX, y: event.clientY }; view.intro = 1; canvas.setPointerCapture(event.pointerId) }
    const onPointerMove = (event: PointerEvent) => {
      if (!pointer) return
      view.yaw -= (event.clientX - pointer.x) * 0.0085
      view.pitch = clamp(view.pitch + (event.clientY - pointer.y) * 0.004, -0.5, 0.5)
      pointer = { x: event.clientX, y: event.clientY }
    }
    const onPointerUp = () => { pointer = null }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') view.yaw += 0.14
      else if (event.key === 'ArrowRight') view.yaw -= 0.14
      else if (event.key === 'ArrowUp') view.dist = clamp(view.dist - 0.28, 1.85, 4.6)
      else if (event.key === 'ArrowDown') view.dist = clamp(view.dist + 0.28, 1.85, 4.6)
      else return
      event.preventDefault()
      view.intro = 1
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('keydown', onKeyDown)

    const render = (now: number) => {
      frame = requestAnimationFrame(render)
      const delta = Math.min((now - previous) / 1000, 0.05)
      previous = now
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (!width || !height) return
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const pixelWidth = Math.round(width * ratio)
      const pixelHeight = Math.round(height * ratio)
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight }
      if (view.intro < 1) {
        view.intro = Math.min(1, view.intro + delta / 2.4)
        if (view.intro >= 1) introCallback.current?.()
      }
      const eased = view.intro * view.intro * (3 - 2 * view.intro)
      const distance = 4.7 + (view.dist - 4.7) * eased
      const yaw = -1.35 + (view.yaw + 1.35) * eased

      context.viewport(0, 0, canvas.width, canvas.height)
      context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT)
      const projection = perspective(0.72, width / height, 0.1, 40)
      const eye: Vec3 = [Math.sin(yaw) * distance, 0.34 + view.pitch * 1.5, Math.cos(yaw) * distance]
      const viewProjection = multiply(projection, lookAt(eye, [0, 0, 0]))

      const focus = focusRef.current
      surface.use()
      context.uniformMatrix4fv(surface.u('u_model'), false, identity)
      context.uniformMatrix4fv(surface.u('u_viewProj'), false, viewProjection)
      context.uniform3fv(surface.u('u_eye'), new Float32Array(eye))
      for (const part of parts) {
        const positionLocation = surface.a('a_position')
        context.bindBuffer(context.ARRAY_BUFFER, part.position)
        context.vertexAttribPointer(positionLocation, 3, context.FLOAT, false, 0, 0)
        context.enableVertexAttribArray(positionLocation)
        const normalLocation = surface.a('a_normal')
        context.bindBuffer(context.ARRAY_BUFFER, part.normal)
        context.vertexAttribPointer(normalLocation, 3, context.FLOAT, false, 0, 0)
        context.enableVertexAttribArray(normalLocation)
        context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, part.index)
        context.uniform3fv(surface.u('u_color'), new Float32Array(part.color))
        context.uniform1f(surface.u('u_metal'), part.metal)
        context.uniform1f(surface.u('u_rough'), part.rough)
        context.uniform1f(surface.u('u_focus'), !focus ? 1 : part.part === focus ? 1.3 : model.partsKnown === false ? 1 : 0.3)
        context.drawElements(context.TRIANGLES, part.count, part.type, 0)
      }

      // 部件标记跟随模型：投影到画布坐标，转到画面外的就藏起来。
      for (const anchor of anchors) {
        const element = markerRefs.current[anchor.id]
        if (!element) continue
        const clip = projectPoint(viewProjection, anchor.point)
        if (clip.w <= 0.001) { element.style.opacity = '0'; element.style.pointerEvents = 'none'; continue }
        const sx = (clip.x / clip.w * 0.5 + 0.5) * width
        const sy = (0.5 - clip.y / clip.w * 0.5) * height
        const inside = sx > 10 && sx < width - 10 && sy > 10 && sy < height - 10
        element.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`
        element.style.opacity = inside ? '1' : '0'
        element.style.pointerEvents = inside ? 'auto' : 'none'
      }
      drawnFrames += 1
    }
    frame = requestAnimationFrame(render)

    // 若一秒内一帧都没画出来（着色器或几何异常），如实显示不可用说明。
    const watchdog = window.setTimeout(() => { if (drawnFrames === 0) setFailed(true) }, 1200)

    return () => {
      window.clearTimeout(watchdog)
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('keydown', onKeyDown)
      context.deleteProgram(surface.program)
      parts.forEach(part => { context.deleteBuffer(part.position); context.deleteBuffer(part.normal); context.deleteBuffer(part.index) })
    }
  }, [instrument.id, instrument.parts, firstReveal, custom])

  const zoom = (step: number) => { camera.current.dist = clamp(camera.current.dist + step, 1.85, 4.6); camera.current.intro = 1 }
  const reset = () => { camera.current.yaw = START.yaw; camera.current.pitch = START.pitch; camera.current.dist = START.dist; camera.current.intro = 1 }

  return (
    <div className={`instrument-stage stage-${instrument.id}`}>
      <div className="stage-orbit orbit-one" aria-hidden="true" />
      <div className="stage-orbit orbit-two" aria-hidden="true" />
      <div className="stage-floor" aria-hidden="true" />
      <span className="stage-coordinate eyebrow">Exhibit 0{['saxophone', 'french-horn', 'trumpet', 'clarinet'].indexOf(instrument.id) + 1} / {instrument.character}</span>
      <span className="stage-word" aria-hidden="true">{instrument.character}</span>
      <div className="instrument-canvas-wrap">
        <span className="stage-badge">{custom ? 'Imported 3D model' : 'Illustrative 3D model · built for this archive'}</span>
        <canvas ref={canvasRef} className="instrument-canvas" tabIndex={0} role="img" aria-label={`Three-dimensional model of a ${instrument.name}. Drag to turn it, and use the buttons to move closer or further away.`} />
        {!failed && instrument.parts.map((item, index) => (
          <button
            key={item.id}
            type="button"
            ref={element => { markerRefs.current[item.id] = element }}
            onClick={() => onSelectPart?.(item.id)}
            aria-pressed={selectedPart === item.id}
            aria-label={`Highlight the ${item.name}`}
            className={`absolute left-0 top-0 grid h-7 w-7 place-items-center rounded-full border text-[10px] tracking-[.04em] transition-colors ${selectedPart === item.id ? 'border-[#C6A875] bg-[#C6A875] text-[#10151D]' : 'border-[#C6A87580] bg-[#10151Dcc] text-[#C6A875] hover:border-[#C6A875]'}`}
            style={{ opacity: 0, pointerEvents: 'none', zIndex: 3 }}
          >{String(index + 1).padStart(2, '0')}</button>
        ))}
        {instrument.id === 'saxophone' && !custom && (
          <span className="stage-hint eyebrow absolute left-3 right-3 top-10 z-[3]" role="status" aria-live="polite">
            {customLoading
              ? 'Loading replacement model — built-in illustration shown temporarily.'
              : customError
                ? 'Replacement model could not be loaded — showing the built-in illustration.'
                : 'Replacement model not connected — showing the built-in illustration.'}
          </span>
        )}
        {failed ? (
          <div className="model-placeholder" role="status">
            <span className="eyebrow text-gold">3D view unavailable</span>
            <p>This browser could not start the 3D display.</p>
            <small>The instrument notes on the left still work. A recent desktop browser will show the model.</small>
          </div>
        ) : (
          <div className="stage-controls">
            <span className="stage-hint eyebrow">Drag to turn the model · Arrow keys also work</span>
            <div className="stage-buttons">
              <button type="button" onClick={() => zoom(-0.42)} className="stage-button" aria-label="Move closer"><ChevronUp size={14} aria-hidden="true" /></button>
              <button type="button" onClick={() => zoom(0.42)} className="stage-button" aria-label="Move further away"><ChevronDown size={14} aria-hidden="true" /></button>
              <button type="button" onClick={reset} className="stage-button" aria-label="Reset the view"><RefreshCw size={13} aria-hidden="true" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default InstrumentStage