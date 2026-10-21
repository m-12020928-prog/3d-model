import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import type { Instrument } from '@/content/archive'
import { MATERIALS, instrumentModel } from './gl/instruments3d'
import type { InstrumentModel } from './gl/instruments3d'
import { loadInstrumentModel } from './gl/glb'
import { INSTRUMENT_MODELS } from '@/content/instrument-models'
import { lookAt, multiply, perspective } from './gl/matrix'
import type { Vec3 } from './gl/matrix'

// 展台只用原生 WebGL 显示乐器模型：先按整体包围盒居中并缩放，
// 因此无论模型原始尺寸多大，都会完整落在镜头里。可拖动旋转、用按钮或方向键缩放。
// 不再标注"部件"：模型只负责真实呈现乐器外观。
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

// 金属靠环境反射才像金属：这里用三段渐变的天光、一盏金色反射和清漆高光模拟展台布光。
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
  if (dot(n, v) < 0.0) { n = -n; }
  vec3 keyDir = normalize(vec3(0.34, 0.92, 0.46));
  vec3 fillDir = normalize(vec3(-0.82, 0.16, 0.34));
  vec3 backDir = normalize(vec3(-0.12, 0.42, -0.94));
  float key = max(dot(n, keyDir), 0.0);
  float fill = max(dot(n, fillDir), 0.0);
  float back = max(dot(n, backDir), 0.0);
  vec3 r = reflect(-v, n);
  float sky = clamp(r.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 env = mix(vec3(0.035, 0.042, 0.055), mix(vec3(0.13, 0.16, 0.21), vec3(0.48, 0.54, 0.62), pow(sky, 2.0)), sky);
  float sheen = pow(max(dot(r, keyDir), 0.0), mix(4.0, 42.0, 1.0 - u_rough));
  env += vec3(0.78, 0.64, 0.42) * sheen * 0.6;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 diffuse = u_color * (0.15 + key * 1.02 + fill * 0.26 + back * 0.34);
  vec3 spec = vec3(1.0, 0.95, 0.86) * pow(max(dot(n, normalize(keyDir + v)), 0.0), mix(64.0, 8.0, u_rough));
  vec3 lacquer = env * (0.45 + u_color) + u_color * key * 0.4 + spec * 0.95;
  vec3 color = mix(diffuse + spec * 0.28, lacquer, u_metal);
  color += vec3(0.44, 0.57, 0.72) * fres * (0.1 + u_metal * 0.32);
  color = color / (1.0 + color * 0.42);
  gl_FragColor = vec4(color, 1.0);
}`

type Camera = { yaw: number; pitch: number; dist: number; intro: number }
type Program = { program: WebGLProgram; use(): void; u(name: string): WebGLUniformLocation | null; a(name: string): number }
type DrawPart = { position: WebGLBuffer; normal: WebGLBuffer; index: WebGLBuffer; count: number; color: [number, number, number]; metal: number; rough: number; type: number }

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

type StageProps = { instrument: Instrument; firstReveal?: boolean; onIntroDone?: () => void }

export function InstrumentStage({ instrument, firstReveal = true, onIntroDone }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camera = useRef<Camera>({ ...START })
  const introCallback = useRef(onIntroDone)
  const [failed, setFailed] = useState(false)
  const [custom, setCustom] = useState<InstrumentModel | null>(null)
  const [customError, setCustomError] = useState(false)

  const modelConfig = INSTRUMENT_MODELS[instrument.id]
  useEffect(() => {
    setCustom(null)
    setCustomError(false)
    const config = INSTRUMENT_MODELS[instrument.id]
    if (!config) return
    let cancelled = false
    loadInstrumentModel(config.url, { body: config.body, finishes: config.finishes })
      .then(loaded => { if (!cancelled) setCustom(loaded) })
      .catch(() => { if (!cancelled) setCustomError(true) })
    return () => { cancelled = true }
  }, [instrument.id])

  useEffect(() => { introCallback.current = onIntroDone }, [onIntroDone])

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
        parts.push({ position: positionBuffer, normal: normalBuffer, index: indexBuffer, count: item.mesh.indices.length, color: material.color, metal: material.metal, rough: material.rough, type: wide ? context.UNSIGNED_INT : context.UNSIGNED_SHORT })
      }
    } catch { setFailed(true); return }

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
        context.drawElements(context.TRIANGLES, part.count, part.type, 0)
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
  }, [instrument.id, firstReveal, custom])

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
        {!custom && <span className="stage-badge">Illustrative 3D model · built for this archive</span>}
        <canvas ref={canvasRef} className="instrument-canvas" tabIndex={0} role="img" aria-label={`Three-dimensional model of a ${instrument.name}. Drag to turn it, and use the buttons to move closer or further away.`} />
        {modelConfig && !custom && (
          <span className="stage-hint eyebrow absolute left-3 right-3 top-10 z-[3]" role="status" aria-live="polite">
            {customError
              ? 'The instrument model could not be read — showing the built-in illustration.'
              : 'Loading the instrument model — the built-in illustration is shown meanwhile.'}
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
