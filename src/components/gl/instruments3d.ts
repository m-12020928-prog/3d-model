// 自制乐器三维模型：全部由本站自己的参数化几何生成，不使用任何第三方模型文件或引擎。
// 每件乐器由真实部件构成（管身、按键、活塞、喇叭口、簧片等），部件标记贴在对应几何上。
import type { Mat4, Vec3 } from './matrix'
import { identity, multiply, rotationX, translation } from './matrix'

export type Mesh = { positions: Float32Array; normals: Float32Array; indices: Uint16Array | Uint32Array }

export type MaterialId =
  | 'brass'
  | 'brassDark'
  | 'steel'
  | 'steelDark'
  | 'wood'
  | 'ebony'
  | 'cane'
  | 'pad'
  | 'pearl'
  | 'cork'

export type MaterialSpec = { color: Vec3; metal: number; rough: number; grain: number }

/** 香槟金铜管、深色木纹、哑光衬垫、珠光按键，均取自 Midnight Philharmonic 配色。 */
export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  brass: { color: [0.82, 0.68, 0.44], metal: 1, rough: 0.17, grain: 0.22 },
  brassDark: { color: [0.52, 0.42, 0.29], metal: 1, rough: 0.3, grain: 0.28 },
  steel: { color: [0.74, 0.78, 0.84], metal: 1, rough: 0.13, grain: 0 },
  steelDark: { color: [0.33, 0.37, 0.43], metal: 1, rough: 0.3, grain: 0 },
  wood: { color: [0.27, 0.16, 0.1], metal: 0.04, rough: 0.44, grain: 1 },
  ebony: { color: [0.12, 0.095, 0.088], metal: 0.04, rough: 0.36, grain: 0.5 },
  cane: { color: [0.76, 0.63, 0.41], metal: 0, rough: 0.76, grain: 1 },
  pad: { color: [0.09, 0.08, 0.08], metal: 0, rough: 0.88, grain: 0 },
  pearl: { color: [0.9, 0.88, 0.82], metal: 0.22, rough: 0.18, grain: 0 },
  cork: { color: [0.52, 0.38, 0.26], metal: 0, rough: 0.9, grain: 1 },
}

export type PartMesh = { mesh: Mesh; material: MaterialId; part?: string; look?: { color: Vec3; metal: number; rough: number } }
export type InstrumentModel = { meshes: PartMesh[]; anchors: Record<string, Vec3[]>; partsKnown?: boolean }
export type Frame = { p: Vec3; dir: Vec3; out: Vec3; side: Vec3; r: number }

type Item = { mesh: Mesh; material: MaterialId; part?: string }

// ——— 向量 ———

function vadd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function vsub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function vmul(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s]
}

function vneg(a: Vec3): Vec3 {
  return [-a[0], -a[1], -a[2]]
}

function dotV(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function crossV(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function unit(a: Vec3): Vec3 {
  const length = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / length, a[1] / length, a[2] / length]
}

/** 与给定轴垂直的一组基向量。 */
function frameOf(axis: Vec3): { u: Vec3; v: Vec3 } {
  const reference: Vec3 = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = unit(crossV(reference, axis))
  return { u, v: unit(crossV(axis, u)) }
}

// ——— 矩阵 ———

function rotZ(angle: number): Mat4 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
}

function axisAngle(axis: Vec3, angle: number): Mat4 {
  const [x, y, z] = unit(axis)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const t = 1 - c
  return new Float32Array([
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ])
}

/** 把 +Y 轴对齐到任意方向，用于摆放喇叭口、吹口等旋转体。 */
function alignTo(dir: Vec3): Mat4 {
  const target = unit(dir)
  const along: Vec3 = [0, 1, 0]
  const d = dotV(along, target)
  if (d > 0.99995) return identity()
  if (d < -0.99995) return rotationX(Math.PI)
  return axisAngle(crossV(along, target), Math.acos(Math.max(-1, Math.min(1, d))))
}

function applyMatrix(mesh: Mesh, matrix: Mat4): Mesh {
  const positions = new Float32Array(mesh.positions.length)
  const normals = new Float32Array(mesh.normals.length)
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i]
    const y = mesh.positions[i + 1]
    const z = mesh.positions[i + 2]
    positions[i] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]
    positions[i + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]
    positions[i + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
    const nx = mesh.normals[i]
    const ny = mesh.normals[i + 1]
    const nz = mesh.normals[i + 2]
    const tx = matrix[0] * nx + matrix[4] * ny + matrix[8] * nz
    const ty = matrix[1] * nx + matrix[5] * ny + matrix[9] * nz
    const tz = matrix[2] * nx + matrix[6] * ny + matrix[10] * nz
    const length = Math.hypot(tx, ty, tz) || 1
    normals[i] = tx / length
    normals[i + 1] = ty / length
    normals[i + 2] = tz / length
  }
  return { positions, normals, indices: mesh.indices }
}

/** 把沿 +Y 构建的几何体放到 origin，并让其轴指向 dir。 */
function place(mesh: Mesh, origin: Vec3, dir: Vec3): Mesh {
  return applyMatrix(mesh, multiply(translation(origin[0], origin[1], origin[2]), alignTo(dir)))
}

// ——— 几何图元 ———

function meshOf(positions: number[], normals: number[], indices: number[]): Mesh {
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  }
}

/** 圆柱／圆台，可带端盖。 */
function cylinder(from: Vec3, to: Vec3, r0: number, r1: number, radial = 16, caps = true): Mesh {
  const axis = unit(vsub(to, from))
  const { u, v } = frameOf(axis)
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const rings: { centre: Vec3; radius: number }[] = [{ centre: from, radius: r0 }, { centre: to, radius: r1 }]
  for (const ring of rings) {
    for (let j = 0; j <= radial; j++) {
      const angle = (j / radial) * Math.PI * 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const dir = vadd(vmul(u, cos), vmul(v, sin))
      positions.push(ring.centre[0] + dir[0] * ring.radius, ring.centre[1] + dir[1] * ring.radius, ring.centre[2] + dir[2] * ring.radius)
      normals.push(dir[0], dir[1], dir[2])
    }
  }
  const ringSize = radial + 1
  for (let j = 0; j < radial; j++) {
    const a = j
    const b = j + 1
    const c = j + ringSize
    const d = c + 1
    indices.push(a, c, b, b, c, d)
  }
  if (caps) {
    for (const [ring, sign] of [[rings[0], -1], [rings[1], 1]] as [{ centre: Vec3; radius: number }, number][]) {
      if (ring.radius <= 0) continue
      const base = positions.length / 3
      positions.push(ring.centre[0], ring.centre[1], ring.centre[2])
      normals.push(axis[0] * sign, axis[1] * sign, axis[2] * sign)
      for (let j = 0; j <= radial; j++) {
        const angle = (j / radial) * Math.PI * 2
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const dx = u[0] * cos + v[0] * sin
        const dy = u[1] * cos + v[1] * sin
        const dz = u[2] * cos + v[2] * sin
        positions.push(ring.centre[0] + dx * ring.radius, ring.centre[1] + dy * ring.radius, ring.centre[2] + dz * ring.radius)
        normals.push(axis[0] * sign, axis[1] * sign, axis[2] * sign)
      }
      for (let j = 0; j < radial; j++) indices.push(base, base + 1 + j, base + 2 + j)
    }
  }
  return meshOf(positions, normals, indices)
}

/** 环面，环绕 Y 轴生成（半径在 XZ 平面内）。 */
function torusY(radius: number, tube: number, radialSeg = 40, tubeSeg = 12): Mesh {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= radialSeg; i++) {
    const a = (i / radialSeg) * Math.PI * 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    for (let j = 0; j <= tubeSeg; j++) {
      const b = (j / tubeSeg) * Math.PI * 2
      const cb = Math.cos(b)
      const sb = Math.sin(b)
      const nx = ca * cb
      const ny = sb
      const nz = sa * cb
      positions.push(ca * radius + nx * tube, ny * tube, sa * radius + nz * tube)
      normals.push(nx, ny, nz)
    }
  }
  const row = tubeSeg + 1
  for (let i = 0; i < radialSeg; i++) {
    for (let j = 0; j < tubeSeg; j++) {
      const a = i * row + j
      const b = a + 1
      const c = a + row
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  return meshOf(positions, normals, indices)
}

/** 旋转体：给定 [半径, 高度] 剖面，绕 Y 轴扫成（吹口、喇叭口、阀壳等）。 */
function lathe(profile: [number, number][], radial = 40): Mesh {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const profileNormals: [number, number][] = profile.map((_, i) => {
    const previous = profile[Math.max(0, i - 1)]
    const next = profile[Math.min(profile.length - 1, i + 1)]
    const dr = next[0] - previous[0]
    const dy = next[1] - previous[1]
    const length = Math.hypot(dr, dy) || 1
    return [dy / length, -dr / length]
  })
  for (let i = 0; i < profile.length; i++) {
    const [radius, height] = profile[i]
    const [nr, ny] = profileNormals[i]
    for (let j = 0; j <= radial; j++) {
      const angle = (j / radial) * Math.PI * 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      positions.push(cos * radius, height, sin * radius)
      normals.push(cos * nr, ny, sin * nr)
    }
  }
  const ringSize = radial + 1
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ringSize + j
      const b = a + 1
      const c = a + ringSize
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  return meshOf(positions, normals, indices)
}

/** 长方体，用于键片、杠杆、拇指托等平面部件。 */
function box(centre: Vec3, size: Vec3): Mesh {
  const [x, y, z] = centre
  const [w, h, d] = [size[0] / 2, size[1] / 2, size[2] / 2]
  const corners: Vec3[] = [
    [x - w, y - h, z - d], [x + w, y - h, z - d], [x + w, y + h, z - d], [x - w, y + h, z - d],
    [x - w, y - h, z + d], [x + w, y - h, z + d], [x + w, y + h, z + d], [x - w, y + h, z + d],
  ]
  const faces: { indices: [number, number, number, number]; normal: Vec3 }[] = [
    { indices: [4, 5, 6, 7], normal: [0, 0, 1] },
    { indices: [1, 0, 3, 2], normal: [0, 0, -1] },
    { indices: [5, 1, 2, 6], normal: [1, 0, 0] },
    { indices: [0, 4, 7, 3], normal: [-1, 0, 0] },
    { indices: [7, 6, 2, 3], normal: [0, 1, 0] },
    { indices: [0, 1, 5, 4], normal: [0, -1, 0] },
  ]
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (const face of faces) {
    const base = positions.length / 3
    for (const index of face.indices) {
      const point = corners[index]
      positions.push(point[0], point[1], point[2])
      normals.push(face.normal[0], face.normal[1], face.normal[2])
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return meshOf(positions, normals, indices)
}

/** Catmull-Rom 平滑，让控制点成为自然弯曲的管身。 */
function smooth(points: Vec3[], radii: number[], steps: number): { path: Vec3[]; radii: number[] } {
  const path: Vec3[] = []
  const outRadii: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      path.push([
        f(p0[0], p1[0], p2[0], p3[0]),
        f(p0[1], p1[1], p2[1], p3[1]),
        f(p0[2], p1[2], p2[2], p3[2]),
      ])
      outRadii.push(radii[i] + (radii[i + 1] - radii[i]) * t)
    }
  }
  path.push(points[points.length - 1])
  outRadii.push(radii[radii.length - 1])
  return { path, radii: outRadii }
}

/** 沿路径扫掠，并返回每一圈的切向与法向，供按键等部件贴合管身。 */
function sweep(points: Vec3[], radii: number[], radial = 18, steps = 8): { mesh: Mesh; frames: Frame[] } {
  const { path, radii: pathRadii } = smooth(points, radii, steps)
  const frames: Frame[] = []
  let carried: Vec3 | null = null
  for (let i = 0; i < path.length; i++) {
    const previous = path[Math.max(0, i - 1)]
    const next = path[Math.min(path.length - 1, i + 1)]
    const dir = unit(vsub(next, previous))
    let out: Vec3
    if (!carried) {
      out = frameOf(dir).u
    } else {
      const projected = vsub(carried, vmul(dir, dotV(carried, dir)))
      out = Math.hypot(projected[0], projected[1], projected[2]) < 0.0001 ? frameOf(dir).u : unit(projected)
    }
    carried = out
    frames.push({ p: path[i], dir, out, side: unit(crossV(dir, out)), r: pathRadii[i] })
  }
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (const frame of frames) {
    for (let j = 0; j <= radial; j++) {
      const angle = (j / radial) * Math.PI * 2
      const normal = vadd(vmul(frame.out, Math.cos(angle)), vmul(frame.side, Math.sin(angle)))
      positions.push(frame.p[0] + normal[0] * frame.r, frame.p[1] + normal[1] * frame.r, frame.p[2] + normal[2] * frame.r)
      normals.push(normal[0], normal[1], normal[2])
    }
  }
  const ringSize = radial + 1
  for (let i = 0; i < frames.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ringSize + j
      const b = a + 1
      const c = a + ringSize
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  return { mesh: meshOf(positions, normals, indices), frames }
}

function tube(points: Vec3[], radii: number[], radial = 16, steps = 6): Mesh {
  return sweep(points, radii, radial, steps).mesh
}

function frameAt(frames: Frame[], u: number): Frame {
  const index = Math.max(0, Math.min(frames.length - 1, Math.round(u * (frames.length - 1))))
  return frames[index]
}

/** 朝向观看者的向外方向，保证按键总在同一面。 */
function faceOut(frame: Frame): Vec3 {
  return dotV(frame.side, [0, 0, 1]) >= 0 ? frame.side : vneg(frame.side)
}

function merge(meshes: Mesh[]): Mesh {
  let vertexCount = 0
  let indexCount = 0
  for (const mesh of meshes) {
    vertexCount += mesh.positions.length / 3
    indexCount += mesh.indices.length
  }
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const indices = new Uint16Array(indexCount)
  let vertexOffset = 0
  let indexOffset = 0
  for (const mesh of meshes) {
    positions.set(mesh.positions, vertexOffset * 3)
    normals.set(mesh.normals, vertexOffset * 3)
    for (let i = 0; i < mesh.indices.length; i++) indices[indexOffset + i] = mesh.indices[i] + vertexOffset
    vertexOffset += mesh.positions.length / 3
    indexOffset += mesh.indices.length
  }
  return { positions, normals, indices }
}

/** 按材质与部件合并，减少绘制次数，同时保留部件高亮能力。 */
function assemble(items: Item[]): PartMesh[] {
  const groups = new Map<string, { material: MaterialId; part?: string; meshes: Mesh[] }>()
  for (const item of items) {
    const key = `${item.material}|${item.part ?? ''}`
    const group = groups.get(key)
    if (group) group.meshes.push(item.mesh)
    else groups.set(key, { material: item.material, part: item.part, meshes: [item.mesh] })
  }
  return [...groups.values()].map(group => ({ mesh: merge(group.meshes), material: group.material, part: group.part }))
}

/** 喇叭口剖面：指数扩张，接近真实铜管的膨胀曲线。 */
function bellProfile(startRadius: number, endRadius: number, length: number, steps = 12): [number, number][] {
  const profile: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    profile.push([startRadius + (endRadius - startRadius) * Math.pow(t, 2.4), t * length])
  }
  return profile
}

// ——— 萨克斯 ———

// 萨克斯：按中音萨克斯的正面轮廓重制。轮廓比例优先——管身弯曲、U 形弯管与喇叭口弧度对齐，
// 按键与连杆按需简化。整根管身从弯脖到喇叭口是一条连续路径，半径沿气流方向逐渐变大。
function saxophoneModel(): InstrumentModel {
  const items: Item[] = []

  const bodyPath: Vec3[] = [
    [-0.62, 1.96, 0.10],
    [-0.56, 1.86, 0.07],
    [-0.44, 1.74, 0.03],
    [-0.34, 1.60, 0.0],
    [-0.32, 1.30, 0.0],
    [-0.30, 0.85, 0.0],
    [-0.28, 0.35, 0.0],
    [-0.27, -0.15, 0.0],
    [-0.26, -0.62, 0.0],
    [-0.24, -1.02, 0.0],
    [-0.2, -1.28, 0.0],
    [0.0, -1.42, 0.0],
    [0.2, -1.3, 0.0],
    [0.26, -1.04, 0.0],
    [0.29, -0.64, 0.0],
    [0.31, -0.16, 0.0],
    [0.33, 0.34, 0.0],
    [0.35, 0.76, 0.01],
    [0.37, 1.06, 0.02],
  ]
  // 弯脖细、主管渐粗、弯管最深处最宽，上行管再把气流送进喇叭口。
  const bodyRadii = [
    0.048, 0.05, 0.052, 0.056, 0.07, 0.084, 0.094, 0.104, 0.112, 0.118,
    0.126, 0.132, 0.14, 0.148, 0.156, 0.162, 0.168, 0.172, 0.176,
  ]
  const body = sweep(bodyPath, bodyRadii, 24, 8)
  items.push({ mesh: body.mesh, material: 'brass' })

  // 喇叭口：从上行管顶端继续外扩，开口朝上前方，露出加厚边缘。
  const bellPath: Vec3[] = [
    [0.37, 1.06, 0.02],
    [0.385, 1.26, 0.06],
    [0.39, 1.44, 0.13],
    [0.385, 1.62, 0.22],
    [0.375, 1.78, 0.33],
  ]
  const bellRadii = [0.176, 0.205, 0.265, 0.365, 0.5]
  const bell = sweep(bellPath, bellRadii, 30, 8)
  items.push({ mesh: bell.mesh, material: 'brass', part: 'bell' })
  const bellTip = bellPath[bellPath.length - 1]
  const bellDir = unit(vsub(bellTip, bellPath[bellPath.length - 2]))
  items.push({ mesh: place(torusY(0.5, 0.024, 48, 12), bellTip, bellDir), material: 'brassDark', part: 'bell' })
  items.push({ mesh: place(torusY(0.29, 0.012, 40, 10), [0.39, 1.5, 0.155], bellDir), material: 'brassDark', part: 'bell' })

  // 吹嘴：软木接口、黑檀吹嘴、簧片与束圈
  const mouthDir = unit(vsub(bodyPath[0], bodyPath[1]))
  const mouthOrigin = vadd(bodyPath[0], vmul(mouthDir, -0.015))
  const mouthpieceProfile: [number, number][] = [
    [0.05, 0], [0.056, 0.035], [0.062, 0.085], [0.061, 0.135], [0.056, 0.175],
    [0.046, 0.215], [0.032, 0.265], [0.025, 0.3],
  ]
  items.push({ mesh: place(lathe(mouthpieceProfile, 30), mouthOrigin, mouthDir), material: 'ebony', part: 'mouthpiece' })
  items.push({ mesh: place(torusY(0.054, 0.008, 26, 10), vadd(mouthOrigin, vmul(mouthDir, 0.022)), mouthDir), material: 'cork', part: 'mouthpiece' })
  items.push({ mesh: place(box([0, 0.2, 0.055], [0.048, 0.19, 0.012]), mouthOrigin, mouthDir), material: 'cane', part: 'mouthpiece' })
  items.push({ mesh: place(torusY(0.058, 0.01, 26, 10), vadd(mouthOrigin, vmul(mouthDir, 0.155)), mouthDir), material: 'steelDark', part: 'mouthpiece' })

  // 弯脖与主管的接环
  items.push({ mesh: place(torusY(0.066, 0.012, 28, 10), bodyPath[3], unit(vsub(bodyPath[3], bodyPath[4]))), material: 'brassDark' })

  // 音孔按键：贴合管身外表面，两列错开，像真的连杆分组
  const keyAnchors: Vec3[] = []
  const toneKey = (u: number, lateral: number, size: number) => {
    const frame = frameAt(body.frames, u)
    const out = faceOut(frame)
    const lateralDir = unit(crossV(frame.dir, out))
    const surface = vadd(vadd(frame.p, vmul(out, frame.r * 0.96)), vmul(lateralDir, lateral))
    items.push({ mesh: cylinder(vadd(surface, vmul(out, -0.03)), vadd(surface, vmul(out, 0.035)), 0.011, 0.014, 10, false), material: 'steel', part: 'keys' })
    items.push({ mesh: cylinder(vadd(surface, vmul(out, 0.028)), vadd(surface, vmul(out, 0.062)), 0.034 * size, 0.044 * size, 18, true), material: 'brass', part: 'keys' })
    items.push({ mesh: cylinder(vadd(surface, vmul(out, 0.06)), vadd(surface, vmul(out, 0.078)), 0.028 * size, 0.028 * size, 16, true), material: 'pearl', part: 'keys' })
    keyAnchors.push(vadd(surface, vmul(out, 0.086)))
  }
  for (const u of [0.29, 0.325, 0.36, 0.395, 0.43, 0.465, 0.5, 0.535, 0.57]) toneKey(u, -0.035, 1)
  for (const u of [0.315, 0.355, 0.395, 0.435, 0.475, 0.515]) toneKey(u, 0.075, 0.84)

  // 左侧上排键：从主管侧面伸出的三片键
  for (const [u, lift] of [[0.25, 0.02], [0.275, 0.04], [0.3, 0.06]] as [number, number][]) {
    const frame = frameAt(body.frames, u)
    const out = faceOut(frame)
    const side = unit(crossV(frame.dir, out))
    const base = vadd(frame.p, vmul(side, -frame.r * 0.4 + lift))
    items.push({ mesh: cylinder(vadd(base, vmul(side, 0.02)), vadd(base, vmul(side, -0.12)), 0.018, 0.03, 12, true), material: 'steel', part: 'keys' })
  }

  // 按键连杆：两根长杆沿管身外侧走线
  const rod = (offset: number, from: number, to: number): Mesh => {
    const points: Vec3[] = []
    const radii: number[] = []
    for (let i = 0; i <= 12; i++) {
      const frame = frameAt(body.frames, from + (to - from) * (i / 12))
      points.push(vadd(frame.p, vmul(faceOut(frame), frame.r + offset)))
      radii.push(0.01)
    }
    return tube(points, radii, 8, 4)
  }
  items.push({ mesh: rod(0.062, 0.28, 0.58), material: 'steel', part: 'keys' })
  items.push({ mesh: rod(0.112, 0.3, 0.6), material: 'steel', part: 'keys' })

  // 弯管与上行管上的低音键
  items.push({ mesh: cylinder([0.02, -1.4, 0.06], [0.02, -1.4, 0.16], 0.052, 0.062, 18, true), material: 'brass', part: 'keys' })
  items.push({ mesh: cylinder([0.02, -1.4, 0.155], [0.02, -1.4, 0.175], 0.032, 0.032, 16, true), material: 'pearl', part: 'keys' })
  items.push({ mesh: cylinder([0.3, -0.05, 0.16], [0.3, -0.05, 0.245], 0.046, 0.055, 18, true), material: 'brass', part: 'keys' })

  // 八度键：弯脖上的键片与主管顶部的连杆
  items.push({ mesh: cylinder([-0.46, 1.72, 0.03], [-0.46, 1.72, 0.12], 0.024, 0.03, 12, true), material: 'steel', part: 'keys' })
  items.push({ mesh: tube([[-0.3, 1.44, 0.1], [-0.22, 1.5, 0.06], [-0.14, 1.52, 0.0]], [0.012, 0.012, 0.012], 8, 4), material: 'steel', part: 'keys' })

  // 拇指托、挂带环与两根支撑杆
  items.push({ mesh: box([-0.34, 0.62, -0.14], [0.075, 0.12, 0.045]), material: 'steelDark' })
  items.push({ mesh: place(torusY(0.05, 0.013, 24, 10), [-0.3, 1.12, -0.1], [0, 0, 1]), material: 'steelDark' })
  items.push({ mesh: cylinder([-0.26, 0.55, -0.03], [0.3, 0.55, -0.03], 0.014, 0.014, 10, true), material: 'brass' })
  items.push({ mesh: cylinder([-0.24, -0.75, -0.03], [0.28, -0.75, -0.03], 0.013, 0.013, 10, true), material: 'brass' })

  return {
    meshes: assemble(items),
    anchors: {
      mouthpiece: [vadd(mouthOrigin, vmul(mouthDir, 0.17))],
      keys: keyAnchors.slice(0, 3),
      bell: [vadd(bellTip, vmul(bellDir, 0.05))],
    },
  }
}

// ——— 法国号 ———

function frenchHornModel(): InstrumentModel {
  const items: Item[] = []
  const coilPoints: Vec3[] = []
  const coilRadii: number[] = []
  const samples = 92
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const angle = 0.5 + t * Math.PI * 4
    const radius = 0.7 + t * 0.015
    coilPoints.push([Math.cos(angle) * radius, Math.sin(angle) * radius, -0.3 + t * 0.36])
    coilRadii.push(0.086 - t * 0.014)
  }
  items.push({ mesh: tube(coilPoints, coilRadii, 16, 3), material: 'brass' })

  // 吹口管与吹口
  const pipeEnd: Vec3 = [-1.2, 0.16, -0.16]
  items.push({ mesh: tube([[-0.66, 0.04, -0.2], [-0.9, 0.1, -0.19], [-1.08, 0.14, -0.17], pipeEnd], [0.084, 0.074, 0.064, 0.058], 16, 6), material: 'brass' })
  const mouthDir = unit([-1, 0.08, 0.06])
  const mouthProfile: [number, number][] = [[0.052, 0], [0.056, 0.06], [0.062, 0.13], [0.052, 0.2], [0.038, 0.25], [0.03, 0.28]]
  items.push({ mesh: place(lathe(mouthProfile, 26), pipeEnd, mouthDir), material: 'brassDark', part: 'mouthpiece' })
  items.push({ mesh: place(torusY(0.032, 0.007, 22, 8), vadd(pipeEnd, vmul(mouthDir, 0.28)), mouthDir), material: 'brass', part: 'mouthpiece' })

  // 喇叭口
  const bellOrigin: Vec3 = [0.66, 0.4, 0.1]
  const bellDir = unit([0.86, 0.28, 0.3])
  items.push({ mesh: place(lathe(bellProfile(0.095, 0.56, 0.72), 44), bellOrigin, bellDir), material: 'brass', part: 'bell' })
  const bellMouth = vadd(bellOrigin, vmul(bellDir, 0.72))
  items.push({ mesh: place(torusY(0.558, 0.024, 48, 12), bellMouth, bellDir), material: 'brassDark', part: 'bell' })
  items.push({ mesh: place(torusY(0.5, 0.014, 44, 10), vadd(bellOrigin, vmul(bellDir, 0.62)), bellDir), material: 'brassDark', part: 'bell' })

  // 回旋阀：外壳、端盖、按键片与连杆
  const valvePositions: Vec3[] = [[-0.28, 0.6, 0], [0, 0.64, 0], [0.28, 0.6, 0]]
  for (const [x, y] of valvePositions) {
    items.push({ mesh: cylinder([x, y, -0.12], [x, y, 0.14], 0.075, 0.075, 18, false), material: 'brass', part: 'valves' })
    items.push({ mesh: cylinder([x, y, 0.14], [x, y, 0.19], 0.084, 0.084, 18, true), material: 'steelDark', part: 'valves' })
    items.push({ mesh: cylinder([x, y, -0.17], [x, y, -0.12], 0.084, 0.084, 18, true), material: 'steelDark', part: 'valves' })
    items.push({
      mesh: applyMatrix(box([0, 0, 0], [0.024, 0.15, 0.032]), multiply(translation(x, y + 0.1, 0.08), rotZ(-0.32))),
      material: 'brassDark',
      part: 'valves',
    })
    items.push({ mesh: cylinder([x + 0.03, y + 0.17, 0.08], [x + 0.12, y + 0.02, 0.14], 0.011, 0.011, 8, false), material: 'steel', part: 'valves' })
  }

  // 支杆
  items.push({ mesh: cylinder([-0.44, 0.28, 0.16], [0.44, 0.28, 0.16], 0.016, 0.016, 10, true), material: 'brass' })
  items.push({ mesh: cylinder([-0.4, -0.32, -0.1], [0.4, -0.32, -0.1], 0.016, 0.016, 10, true), material: 'brass' })
  // 水阀
  items.push({ mesh: cylinder([-0.34, -0.68, -0.06], [-0.34, -0.68, 0.02], 0.03, 0.03, 10, true), material: 'steel', })

  return {
    meshes: assemble(items),
    anchors: {
      mouthpiece: [vadd(pipeEnd, vmul(mouthDir, 0.2))],
      valves: [[0, 0.64, 0.2], [-0.28, 0.6, 0.2], [0.28, 0.6, 0.2]],
      bell: [vadd(bellOrigin, vmul(bellDir, 0.5))],
    },
  }
}

// ——— 小号 ———

function trumpetModel(): InstrumentModel {
  const items: Item[] = []
  const leadpipe: Vec3[] = [
    [-1.24, 0.3, 0.02], [-1.05, 0.28, 0.02], [-0.78, 0.26, 0.02], [-0.45, 0.24, 0.01],
    [-0.12, 0.22, 0], [0.22, 0.2, 0], [0.44, 0.18, 0],
  ]
  items.push({ mesh: tube(leadpipe, [0.055, 0.06, 0.065, 0.068, 0.07, 0.072, 0.076], 18, 8), material: 'brass' })

  // 吹口
  const mouthDir = unit([-1, 0.02, 0])
  const mouthOrigin: Vec3 = [-1.24, 0.3, 0.02]
  const cup: [number, number][] = [[0.052, 0], [0.05, 0.06], [0.045, 0.12], [0.048, 0.17], [0.044, 0.2]]
  items.push({ mesh: place(lathe(cup, 26), mouthOrigin, mouthDir), material: 'brass' })
  items.push({ mesh: place(torusY(0.045, 0.008, 22, 8), vadd(mouthOrigin, vmul(mouthDir, 0.2)), mouthDir), material: 'brassDark' })

  // 喇叭口
  const bellOrigin: Vec3 = [0.44, 0.18, 0]
  const bellDir = unit([1, -0.05, 0])
  items.push({ mesh: place(lathe(bellProfile(0.078, 0.52, 0.82), 46), bellOrigin, bellDir), material: 'brass', part: 'bell' })
  const bellMouth = vadd(bellOrigin, vmul(bellDir, 0.82))
  items.push({ mesh: place(torusY(0.518, 0.022, 50, 12), bellMouth, bellDir), material: 'brassDark', part: 'bell' })
  items.push({ mesh: place(torusY(0.46, 0.013, 44, 10), vadd(bellOrigin, vmul(bellDir, 0.72)), bellDir), material: 'brassDark', part: 'bell' })

  // 三个活塞外壳、顶盖、活塞杆与按键
  const valveX = [-0.34, -0.12, 0.1]
  for (const x of valveX) {
    items.push({ mesh: cylinder([x, -0.3, 0], [x, 0.26, 0], 0.082, 0.082, 20, false), material: 'brass', part: 'valves' })
    items.push({ mesh: cylinder([x, 0.26, 0], [x, 0.3, 0], 0.092, 0.092, 20, true), material: 'steelDark', part: 'valves' })
    items.push({ mesh: cylinder([x, 0.3, 0], [x, 0.4, 0], 0.018, 0.018, 10, false), material: 'steel', part: 'valves' })
    items.push({ mesh: cylinder([x, 0.4, 0], [x, 0.435, 0], 0.05, 0.05, 18, true), material: 'pearl', part: 'valves' })
    items.push({ mesh: cylinder([x, 0.435, 0], [x, 0.445, 0], 0.044, 0.044, 18, true), material: 'steelDark', part: 'valves' })
  }

  // 三个活塞滑管（向前的 U 形管）
  const slide = (x: number, depth: number): Mesh =>
    tube([
      [x, -0.26, -0.03], [x, -depth, -0.03], [x, -depth - 0.08, 0.1], [x, -depth, 0.23], [x, -0.26, 0.23],
    ], [0.05, 0.05, 0.05, 0.05, 0.05], 14, 6)
  items.push({ mesh: slide(-0.34, 0.58), material: 'brass', part: 'slide' })
  items.push({ mesh: slide(-0.12, 0.46), material: 'brass', part: 'slide' })
  const thirdSlide = tube([
    [-0.1, -0.26, -0.03], [0.22, -0.3, -0.03], [0.4, -0.44, 0.04], [0.42, -0.6, 0.1], [0.28, -0.68, 0.16], [0.06, -0.64, 0.2],
  ], [0.05, 0.05, 0.05, 0.05, 0.05, 0.05], 14, 6)
  items.push({ mesh: thirdSlide, material: 'brass', part: 'slide' })
  items.push({ mesh: cylinder([0.42, -0.62, 0.06], [0.42, -0.62, 0.14], 0.035, 0.035, 12, true), material: 'steel', part: 'slide' })

  // 手指钩、无名指环与支杆
  items.push({ mesh: place(torusY(0.055, 0.013, 24, 10), [-0.56, 0.06, 0.12], [0, 0, 1]), material: 'brass' })
  items.push({ mesh: applyMatrix(box([0, 0, 0], [0.03, 0.18, 0.05]), multiply(translation(-0.6, 0.14, 0.08), rotZ(0.5))), material: 'brass' })
  items.push({ mesh: cylinder([-0.2, -0.02, 0.06], [-0.2, -0.24, 0.06], 0.014, 0.014, 8, true), material: 'brass' })
  items.push({ mesh: cylinder([0.2, 0.04, 0.05], [0.34, 0.02, 0.05], 0.014, 0.014, 8, true), material: 'brass' })

  return {
    meshes: assemble(items),
    anchors: {
      valves: [[-0.34, 0.47, 0], [-0.12, 0.47, 0], [0.1, 0.47, 0]],
      slide: [[0.42, -0.66, 0.1], [-0.34, -0.6, 0.2]],
      bell: [vadd(bellOrigin, vmul(bellDir, 0.6))],
    },
  }
}

// ——— 单簧管 ———

function clarinetModel(): InstrumentModel {
  const items: Item[] = []
  // 吹口（黑檀）
  const mouthDir: Vec3 = [0, -1, 0]
  const mouthProfile: [number, number][] = [[0.03, 0], [0.038, 0.05], [0.05, 0.12], [0.062, 0.2], [0.072, 0.27]]
  items.push({ mesh: place(lathe(mouthProfile, 28), [0, 1.5, 0], mouthDir), material: 'ebony', part: 'reed' })
  // 簧片与束圈
  items.push({ mesh: box([0, 1.4, 0.055], [0.048, 0.22, 0.012]), material: 'cane', part: 'reed' })
  items.push({ mesh: place(torusY(0.063, 0.009, 26, 10), [0, 1.46, 0], [0, 1, 0]), material: 'steelDark', part: 'reed' })
  items.push({ mesh: place(torusY(0.063, 0.009, 26, 10), [0, 1.37, 0], [0, 1, 0]), material: 'steelDark', part: 'reed' })
  items.push({ mesh: cylinder([0.055, 1.415, 0], [0.085, 1.415, 0], 0.012, 0.012, 10, true), material: 'steel', part: 'reed' })

  // 木制管身：调音筒、上节、下节
  items.push({ mesh: cylinder([0, 1.28, 0], [0, 1.16, 0], 0.088, 0.088, 26, false), material: 'wood' })
  items.push({ mesh: cylinder([0, 1.16, 0], [0, 0.14, 0], 0.1, 0.099, 26, false), material: 'wood' })
  items.push({ mesh: cylinder([0, 0.14, 0], [0, -0.72, 0], 0.1, 0.102, 26, false), material: 'wood' })

  // 喇叭口
  items.push({ mesh: place(lathe([[0.1, 0], [0.106, 0.06], [0.12, 0.14], [0.15, 0.24], [0.19, 0.33], [0.23, 0.4], [0.26, 0.46]], 34), [0, -0.72, 0], mouthDir), material: 'wood', part: 'bell' })
  items.push({ mesh: place(torusY(0.258, 0.013, 40, 10), [0, -1.18, 0], [0, 1, 0]), material: 'steel', part: 'bell' })

  // 接口环
  for (const [y, radius] of [[1.29, 0.094], [1.17, 0.104], [0.16, 0.106], [-0.7, 0.108]] as [number, number][]) {
    items.push({ mesh: place(torusY(radius, 0.009, 30, 8), [0, y, 0], [0, 1, 0]), material: 'steel' })
  }

  // 音孔按键：正面一排，圆形衬垫与珠光按钮
  const keyAnchors: Vec3[] = []
  const toneKey = (y: number, x: number, size: number) => {
    items.push({ mesh: cylinder([x, y, 0.088], [x, y, 0.142], 0.033 * size, 0.041 * size, 16, true), material: 'steel', part: 'keys' })
    items.push({ mesh: cylinder([x, y, 0.139], [x, y, 0.155], 0.025 * size, 0.025 * size, 14, true), material: 'pearl', part: 'keys' })
    keyAnchors.push([x, y, 0.17])
  }
  const toneYs = [0.8, 0.66, 0.52, 0.38, 0.24, 0.1, -0.04, -0.18, -0.32, -0.46, -0.6]
  toneYs.forEach((y, i) => toneKey(y, i % 2 === 0 ? 0.028 : -0.028, i % 3 === 0 ? 1.12 : 1))

  // 侧键（左侧）
  for (const y of [0.86, 0.74, 0.62, 0.5]) {
    items.push({ mesh: cylinder([-0.1, y, 0.02], [-0.17, y, 0.03], 0.024, 0.028, 12, true), material: 'steel', part: 'keys' })
  }

  // 连杆
  items.push({ mesh: cylinder([0.096, 0.95, 0.03], [0.096, -0.62, 0.03], 0.009, 0.009, 8, false), material: 'steel', part: 'keys' })
  items.push({ mesh: cylinder([-0.096, 0.95, 0.05], [-0.096, -0.62, 0.05], 0.009, 0.009, 8, false), material: 'steel', part: 'keys' })
  items.push({ mesh: cylinder([0.02, 1.02, -0.04], [0.02, -0.6, -0.04], 0.008, 0.008, 8, false), material: 'steel', part: 'keys' })

  // 泛音键（背面）
  items.push({ mesh: cylinder([0.01, 1.0, -0.075], [0.01, 1.0, -0.155], 0.024, 0.03, 12, true), material: 'steel', part: 'register' })
  items.push({ mesh: cylinder([0.05, 1.0, -0.1], [0.05, 1.09, -0.06], 0.009, 0.009, 8, true), material: 'steel', part: 'register' })

  // 拇指托
  items.push({ mesh: box([0, -0.05, -0.12], [0.06, 0.1, 0.035]), material: 'steelDark' })

  return {
    meshes: assemble(items),
    anchors: {
      reed: [[0, 1.43, 0.07]],
      register: [[0.01, 1.0, -0.16]],
      keys: [keyAnchors[2], keyAnchors[6], keyAnchors[9]],
      bell: [[0, -1.14, 0.12]],
    },
  }
}

const cache = new Map<string, InstrumentModel>()

export function instrumentModel(id: string): InstrumentModel {
  const cached = cache.get(id)
  if (cached) return cached
  const built =
    id === 'saxophone'
      ? saxophoneModel()
      : id === 'french-horn'
        ? frenchHornModel()
        : id === 'trumpet'
          ? trumpetModel()
          : clarinetModel()
  cache.set(id, built)
  return built
}