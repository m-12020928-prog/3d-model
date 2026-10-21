// 简易 GLB（glTF 2.0 二进制）加载器：读取网格与节点变换，按配置给每个网格涂上真实乐器的质感。
// 不支持 Draco/Meshopt 压缩、骨骼动画与贴图；遇到时抛出明确错误，由调用方改用内置模型。
// 贴图不在本站解析，所以颜色来自 src/content/instrument-models.ts 的漆面、镀银与木料配置，
// 按节点名与网格名匹配到对应部件；模型自带的白色/灰色材质因子不再使用。
import type { Vec3 } from './matrix'
import type { InstrumentModel, MaterialId, PartMesh } from './instruments3d'
import type { FinishRule, ModelFinish } from '@/content/instrument-models'

type Node = { name?: string; children?: number[]; mesh?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }
type Primitive = { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }

type Json = {
  scene?: number
  scenes?: { nodes?: number[] }[]
  nodes?: Node[]
  meshes?: { name?: string; primitives: Primitive[] }[]
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; normalized?: boolean; count: number; type: string }[]
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[]
  extensionsRequired?: string[]
}

const TYPE_SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }

type Mat = number[]
const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** 默认质感：没有配置时按黄铜漆面处理。 */
const FALLBACK: ModelFinish = { color: [0.8, 0.62, 0.3], metal: 1, rough: 0.18 }

export type ModelPaint = {
  body: ModelFinish
  finishes?: FinishRule[]
}

function mul(a: Mat, b: Mat): Mat {
  const out = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let sum = 0
    for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]
    out[c * 4 + r] = sum
  }
  return out
}

function compose(t: number[], q: number[], s: number[]): Mat {
  const [x, y, z, w] = q
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z
  return [
    (1 - 2 * (yy + zz)) * s[0], (2 * (xy + wz)) * s[0], (2 * (xz - wy)) * s[0], 0,
    (2 * (xy - wz)) * s[1], (1 - 2 * (xx + zz)) * s[1], (2 * (yz + wx)) * s[1], 0,
    (2 * (xz + wy)) * s[2], (2 * (yz - wx)) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]
}

function parse(buffer: ArrayBuffer): { json: Json; bin: DataView } {
  const view = new DataView(buffer)
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file')
  if (view.getUint32(4, true) !== 2) throw new Error('Only glTF 2.0 is supported')
  let json: Json | null = null
  let bin: DataView | null = null
  let offset = 12
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length))) as Json
    else if (type === 0x004e4942 && !bin) bin = new DataView(buffer, start, length)
    offset = start + length + ((4 - (length % 4)) % 4)
  }
  if (!json || !bin) throw new Error('GLB has no JSON or binary data')
  const blocked = (json.extensionsRequired ?? []).filter(name => /draco|meshopt/i.test(name))
  if (blocked.length) throw new Error(`Compressed GLB is not supported (${blocked.join(', ')})`)
  return { json, bin }
}

function readAccessor(json: Json, bin: DataView, index: number): Float32Array {
  const accessor = json.accessors?.[index]
  if (!accessor || accessor.bufferView === undefined) throw new Error('Unsupported accessor')
  const bufferView = json.bufferViews?.[accessor.bufferView]
  if (!bufferView) throw new Error('Missing buffer view')
  const components = TYPE_SIZE[accessor.type]
  const size = COMPONENT_BYTES[accessor.componentType]
  if (!components || !size) throw new Error('Unsupported accessor type')
  const stride = bufferView.byteStride || size * components
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const out = new Float32Array(accessor.count * components)
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < components; c++) {
      const at = base + i * stride + c * size
      let value: number
      switch (accessor.componentType) {
        case 5120: value = bin.getInt8(at); if (accessor.normalized) value = Math.max(value / 127, -1); break
        case 5121: value = bin.getUint8(at); if (accessor.normalized) value /= 255; break
        case 5122: value = bin.getInt16(at, true); if (accessor.normalized) value = Math.max(value / 32767, -1); break
        case 5123: value = bin.getUint16(at, true); if (accessor.normalized) value /= 65535; break
        case 5125: value = bin.getUint32(at, true); break
        default: value = bin.getFloat32(at, true)
      }
      out[i * components + c] = value
    }
  }
  return out
}

function smoothNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length)
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const at of [a, b, c]) { normals[at] += nx; normals[at + 1] += ny; normals[at + 2] += nz }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length
  }
  return normals
}

/**
 * paint：模型的真实质感配置。节点名或网格名里带某个关键词的部件用对应质感，
 * 其余网格用 body，因此同一件乐器上的漆面、镀银键和木料能分开显示。
 */
export function buildGlbModel(buffer: ArrayBuffer, paint?: ModelPaint): InstrumentModel {
  const { json, bin } = parse(buffer)
  const meshes: PartMesh[] = []
  const rules = (paint?.finishes ?? []).map(rule => ({ words: rule.match.map(word => word.toLowerCase()), finish: rule.finish }))
  const body = paint?.body ?? FALLBACK

  const finishFor = (hint: string): ModelFinish => {
    for (const rule of rules) {
      if (rule.words.some(word => hint.includes(word))) return rule.finish
    }
    return body
  }

  const visit = (nodeIndex: number, parent: Mat, depth: number) => {
    const node = json.nodes?.[nodeIndex]
    if (!node || depth > 64) return
    const local = node.matrix && node.matrix.length === 16
      ? node.matrix
      : compose(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1])
    const world = mul(parent, local)
    const nodeName = (node.name ?? '').toLowerCase()
    if (node.mesh !== undefined) {
      const definition = json.meshes?.[node.mesh]
      const meshName = (definition?.name ?? '').toLowerCase()
      const finish = finishFor(`${nodeName} ${meshName}`)
      for (const primitive of definition?.primitives ?? []) {
        if (primitive.mode !== undefined && primitive.mode !== 4) continue
        const positionIndex = primitive.attributes.POSITION
        if (positionIndex === undefined) continue
        const source = readAccessor(json, bin, positionIndex)
        const count = source.length / 3
        let indices: Uint32Array
        if (primitive.indices !== undefined) indices = Uint32Array.from(readAccessor(json, bin, primitive.indices))
        else indices = Uint32Array.from({ length: count }, (_, i) => i)
        const rawNormals = primitive.attributes.NORMAL !== undefined ? readAccessor(json, bin, primitive.attributes.NORMAL) : smoothNormals(source, indices)
        const positions = new Float32Array(source.length)
        const normals = new Float32Array(source.length)
        for (let i = 0; i < source.length; i += 3) {
          const x = source[i], y = source[i + 1], z = source[i + 2]
          positions[i] = world[0] * x + world[4] * y + world[8] * z + world[12]
          positions[i + 1] = world[1] * x + world[5] * y + world[9] * z + world[13]
          positions[i + 2] = world[2] * x + world[6] * y + world[10] * z + world[14]
          const nx = rawNormals[i], ny = rawNormals[i + 1], nz = rawNormals[i + 2]
          const tx = world[0] * nx + world[4] * ny + world[8] * nz
          const ty = world[1] * nx + world[5] * ny + world[9] * nz
          const tz = world[2] * nx + world[6] * ny + world[10] * nz
          const length = Math.hypot(tx, ty, tz) || 1
          normals[i] = tx / length; normals[i + 1] = ty / length; normals[i + 2] = tz / length
        }
        const material: MaterialId = finish.metal > 0.6 ? 'brass' : finish.rough > 0.6 ? 'pad' : 'wood'
        meshes.push({ mesh: { positions, normals, indices }, material, look: { color: finish.color as Vec3, metal: finish.metal, rough: finish.rough } })
      }
    }
    for (const child of node.children ?? []) visit(child, world, depth + 1)
  }

  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? (json.nodes ?? []).map((_, i) => i)
  for (const root of roots) visit(root, IDENTITY, 0)
  if (meshes.length === 0) throw new Error('GLB contains no triangle meshes')

  // 展台不再标注部件，这里不计算锚点。
  return { meshes, anchors: {} }
}

const cache = new Map<string, Promise<InstrumentModel>>()

/** 同一个模型只下载一次；切换乐器再切回来不会重新请求。 */
export function loadInstrumentModel(url: string, paint?: ModelPaint, timeoutMs = 60000): Promise<InstrumentModel> {
  const cached = cache.get(url)
  if (cached) return cached
  const request = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`Model request failed (${response.status})`)
      return buildGlbModel(await response.arrayBuffer(), paint)
    } finally {
      clearTimeout(timer)
    }
  })()
  cache.set(url, request)
  request.catch(() => cache.delete(url))
  return request
}
