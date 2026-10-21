// 原生 WebGL 的最小工具层：着色器、单位四边形、纹理、画布纹理。
export type GlProgram = {
  program: WebGLProgram
  use(): void
  u(name: string): WebGLUniformLocation | null
  a(name: string): number
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Shader allocation failed')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown shader error'
    gl.deleteShader(shader)
    throw new Error(log)
  }
  return shader
}

export function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): GlProgram {
  const program = gl.createProgram()
  if (!program) throw new Error('Program allocation failed')
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSource)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown link error'
    gl.deleteProgram(program)
    throw new Error(log)
  }
  const uniforms = new Map<string, WebGLUniformLocation | null>()
  const attributes = new Map<string, number>()
  return {
    program,
    use: () => gl.useProgram(program),
    u: (name: string) => {
      if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name))
      return uniforms.get(name) ?? null
    },
    a: (name: string) => {
      const cached = attributes.get(name)
      if (cached !== undefined) return cached
      const location = gl.getAttribLocation(program, name)
      if (location >= 0) gl.enableVertexAttribArray(location)
      attributes.set(name, location)
      return location
    },
  }
}

export type Quad = { position: WebGLBuffer; uv: WebGLBuffer }

export function createQuad(gl: WebGLRenderingContext): Quad {
  const position = gl.createBuffer()
  const uv = gl.createBuffer()
  if (!position || !uv) throw new Error('Buffer allocation failed')
  gl.bindBuffer(gl.ARRAY_BUFFER, position)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), gl.STATIC_DRAW)
  gl.bindBuffer(gl.ARRAY_BUFFER, uv)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
  return { position, uv }
}

export function bindQuad(gl: WebGLRenderingContext, quad: Quad, program: GlProgram): void {
  const position = program.a('a_position')
  gl.bindBuffer(gl.ARRAY_BUFFER, quad.position)
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0)
  const uv = program.a('a_uv')
  if (uv >= 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad.uv)
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0)
  }
}

export function createTexture(gl: WebGLRenderingContext, source: TexImageSource): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Texture allocation failed')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return texture
}

/** 生成“待补照片”版面：深色板面、金色细框、项目文字。与真实照片共用同一版式。 */
export function plateCanvas(title: string, subtitle: string, aspect = 0.78): HTMLCanvasElement {
  const width = 512
  const height = Math.round(width / aspect)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#1b2734')
  gradient.addColorStop(0.55, '#141d27')
  gradient.addColorStop(1, '#0f1720')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(198,168,117,0.55)'
  ctx.lineWidth = 2
  ctx.strokeRect(18, 18, width - 36, height - 36)
  ctx.strokeStyle = 'rgba(185,200,213,0.14)'
  ctx.lineWidth = 1
  ctx.strokeRect(32, 32, width - 64, height - 64)

  ctx.strokeStyle = 'rgba(198,168,117,0.75)'
  ctx.lineWidth = 3
  const corner = 34
  const marks: [number, number, number, number][] = [
    [14, 14, 1, 1], [width - 14, 14, -1, 1], [14, height - 14, 1, -1], [width - 14, height - 14, -1, -1],
  ]
  for (const [x, y, dx, dy] of marks) {
    ctx.beginPath()
    ctx.moveTo(x + dx * corner, y)
    ctx.lineTo(x, y)
    ctx.lineTo(x, y + dy * corner)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(198,168,117,0.9)'
  ctx.font = '600 17px Inter, Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(title.toUpperCase(), width / 2, height / 2 - 6)

  ctx.fillStyle = 'rgba(185,200,213,0.62)'
  ctx.font = '400 14px Inter, Helvetica, Arial, sans-serif'
  ctx.fillText(subtitle, width / 2, height / 2 + 26)

  ctx.strokeStyle = 'rgba(198,168,117,0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(width / 2 - 46, height / 2 + 44)
  ctx.lineTo(width / 2 + 46, height / 2 + 44)
  ctx.stroke()
  return canvas
}

/** 载入远程照片；失败时返回 null，由调用方改用版面纹理。 */
export function loadPhoto(url: string, timeout = 12000): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    if (typeof window === 'undefined') return resolve(null)
    const image = new Image()
    image.crossOrigin = 'anonymous'
    let settled = false
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = window.setTimeout(() => finish(null), timeout)
    image.onload = () => {
      window.clearTimeout(timer)
      finish(image)
    }
    image.onerror = () => {
      window.clearTimeout(timer)
      finish(null)
    }
    image.src = url
  })
}

/** 把图片按 cover 方式绘制进固定尺寸画布，保证所有画框比例一致。 */
export function coverCanvas(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const scale = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
  return canvas
}
