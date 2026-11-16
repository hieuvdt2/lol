// Pháo giấy khi ăn mừng: một phát "bắn" lên từ hai bên người lúc bắt đầu, rồi mưa giấy rơi lả tả quanh người suốt lúc ăn mừng,
// thỉnh thoảng thêm một phát nhỏ. Mảnh giấy là hình chữ nhật hai mặt nhiều màu, lật vòng, chao qua lại khi rơi (cản không khí),
// rơi xuống sàn thì nằm lại một lúc rồi biến mất. Tự dựng bằng hình khối, một InstancedMesh cho mọi mảnh (1 lần vẽ).
import * as THREE from 'three'

export const CONFETTI_COLORS = ['#ff3b5c', '#ffd23f', '#3fc8ff', '#7cff6b', '#ff8a3d', '#c77dff', '#ffffff'] as const

/** Một mảnh giấy (dữ liệu thuần để kiểm thử). */
export interface Piece {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** góc lật quanh hai trục và tốc độ lật */
  rx: number
  ry: number
  sx: number
  sy: number
  /** pha + tần số chao */
  sway: number
  swayRate: number
  floor: number
  age: number
  life: number
  color: number
}

/** Rơi tối đa ngần này (m/s): giấy nhẹ, cản không khí lớn. */
export const FALL_SPEED = 1.3
const GRAVITY = 9
const DRAG = 2.4

/** Một bước mô phỏng cho mảnh giấy; trả về false khi hết đời. */
export function stepPiece(p: Piece, dt: number): boolean {
  p.age += dt
  if (p.age >= p.life) return false
  if (p.y <= p.floor) {
    // nằm trên sàn
    p.y = p.floor
    p.vx = p.vy = p.vz = 0
    return true
  }
  const drag = Math.exp(-DRAG * dt)
  p.vx *= drag
  p.vz *= drag
  p.vy -= GRAVITY * dt
  if (p.vy < -FALL_SPEED) p.vy = -FALL_SPEED // tốc độ rơi giới hạn (giấy nhẹ)
  p.sway += p.swayRate * dt
  const swayX = Math.cos(p.sway) * 0.7 * Math.min(1, -p.vy / FALL_SPEED + 0.2)
  const swayZ = Math.sin(p.sway * 0.8) * 0.7 * Math.min(1, -p.vy / FALL_SPEED + 0.2)
  p.x += (p.vx + swayX) * dt
  p.y += p.vy * dt
  p.z += (p.vz + swayZ) * dt
  p.rx += p.sx * dt
  p.ry += p.sy * dt
  if (p.y <= p.floor) p.y = p.floor
  return true
}

export interface ConfettiFx {
  /** Bắt đầu ăn mừng tại (x, y, z): phát bắn lớn. `colors` thêm màu đội. */
  burst(x: number, y: number, z: number, colors?: readonly string[]): void
  /** Mưa giấy quanh người `id` đang ăn mừng (gọi mỗi khung): `t` giây kể từ lúc bắt đầu. */
  shower(id: number, x: number, y: number, z: number, t: number, dt: number, colors?: readonly string[]): void
  update(dt: number): void
  readonly count: number
  dispose(): void
}

/** `max`: số mảnh tối đa cùng lúc (chế độ nhẹ dùng ít hơn). */
export function createConfetti(scene: THREE.Scene, max = 1500, random: () => number = Math.random): ConfettiFx {
  const geometry = new THREE.PlaneGeometry(0.1, 0.15)
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false })
  const mesh = new THREE.InstancedMesh(geometry, material, max)
  mesh.frustumCulled = false // mảnh bay khắp nơi: không tính lại khối bao
  mesh.count = 0
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3)
  scene.add(mesh)
  const palette = new Map<string, THREE.Color>()
  const colorOf = (hex: string) => {
    let c = palette.get(hex)
    if (!c) {
      c = new THREE.Color(hex)
      palette.set(hex, c)
    }
    return c
  }
  const pieces: Piece[] = []
  const colorHex: string[] = []
  const lastPuff = new Map<number, number>()
  const pick = (extra?: readonly string[]) => {
    const all = extra && extra.length > 0 && random() < 0.35 ? extra : CONFETTI_COLORS
    return all[Math.floor(random() * all.length)] ?? CONFETTI_COLORS[0]
  }
  const add = (p: Omit<Piece, 'rx' | 'ry' | 'sx' | 'sy' | 'sway' | 'swayRate' | 'age' | 'color'>, hex: string) => {
    if (pieces.length >= max) return
    pieces.push({ ...p, rx: random() * Math.PI * 2, ry: random() * Math.PI * 2, sx: (random() - 0.5) * 18, sy: (random() - 0.5) * 14, sway: random() * Math.PI * 2, swayRate: 2 + random() * 3, age: 0, color: 0 })
    colorHex.push(hex)
  }
  const spray = (x: number, y: number, z: number, n: number, up: number, out: number, colors?: readonly string[]) => {
    for (let i = 0; i < n; i += 1) {
      const a = random() * Math.PI * 2
      const h = out * (0.4 + random() * 0.8)
      add({ x: x + Math.cos(a) * 0.3, y: y + 1.6 + random() * 0.4, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * h, vy: up * (0.7 + random() * 0.5), vz: Math.sin(a) * h, floor: y + 0.005, life: 4 + random() * 2 }, pick(colors))
    }
  }
  const matrix = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  return {
    burst(x, y, z, colors) {
      spray(x, y, z, Math.round(max * 0.16), 7, 3.2, colors)
    },
    shower(id, x, y, z, t, dt, colors) {
      // mưa giấy từ một vòng trên đầu, rộng ~1,6 m quanh người
      const rate = Math.min(max / 12, 100) // mảnh/giây
      const n = Math.floor(rate * dt + random())
      for (let i = 0; i < n; i += 1) {
        const a = random() * Math.PI * 2
        const r = 0.4 + random() * 1.4
        add({ x: x + Math.cos(a) * r, y: y + 2.9 + random() * 0.9, z: z + Math.sin(a) * r, vx: (random() - 0.5) * 0.6, vy: -0.4 - random() * 0.6, vz: (random() - 0.5) * 0.6, floor: y + 0.005, life: 3.5 + random() * 2 }, pick(colors))
      }
      // phát bắn nhỏ mỗi ~1,4 s
      const lastAt = lastPuff.get(id) ?? 0
      if (t - lastAt > 1.4 || t < lastAt) {
        lastPuff.set(id, t)
        if (t > 0.5) spray(x, y, z, Math.round(max * 0.03), 5.5, 2.4, colors)
      }
    },
    update(dt) {
      if (pieces.length === 0 && mesh.count === 0) return // không có mảnh nào: khỏi tải lại bộ đệm lên GPU
      const step = Math.max(0, Math.min(0.1, dt))
      let w = 0
      for (let i = 0; i < pieces.length; i += 1) {
        const p = pieces[i]!
        if (!stepPiece(p, step)) continue
        pieces[w] = p
        colorHex[w] = colorHex[i]!
        w += 1
      }
      pieces.length = w
      colorHex.length = w
      for (let i = 0; i < w; i += 1) {
        const p = pieces[i]!
        const left = p.life - p.age
        const s = left < 0.5 ? left / 0.5 : 1 // co lại rồi biến mất
        const onFloor = p.y <= p.floor
        e.set(onFloor ? -Math.PI / 2 : p.rx, onFloor ? 0 : p.ry, onFloor ? p.rx : 0) // nằm phẳng trên sàn
        q.setFromEuler(e)
        matrix.compose(pos.set(p.x, p.y, p.z), q, scl.set(s, s, s))
        mesh.setMatrixAt(i, matrix)
        mesh.setColorAt(i, colorOf(colorHex[i]!))
      }
      mesh.count = w
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    },
    get count() {
      return pieces.length
    },
    dispose() {
      scene.remove(mesh)
      geometry.dispose()
      material.dispose()
      mesh.dispose()
    },
  }
}
