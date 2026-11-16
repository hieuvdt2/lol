// Phụ kiện nhân vật (tự dựng bằng hình khối, không dùng mô hình ngoài): kính cận, kính râm kiểu meme, tai nghe gaming,
// bình oxi đeo lưng có dây thở nối lên mặt nạ thở, gậy cổ vũ phát sáng, xe lăn (bánh lăn theo quãng đường đi).
// Toạ độ theo khung nhân vật trong person.ts: mặt quay về +z, gốc ở bàn chân; nhóm đầu đặt ở cổ (tâm đầu cao hơn cổ đúng bán kính đầu).
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * Bố cục xe lăn (m, khung nhân vật: mặt về +z, +x là bên trái nhân vật).
 * Nhân vật chibi tay ngắn (vai cao hơn hông 0,75 m, tay với 0,46 m) nên ngồi thấp như xe lăn thể thao: cả người hạ `drop`,
 * bánh lớn đường kính 0,7 m; nhờ vậy tay chạm được vành đẩy (xem wheelchair.ts).
 */
export const RIDE = {
  drop: 0.25,
  wheelR: 0.35,
  rimR: 0.31,
  wheelX: 0.37,
  /** vành đẩy nằm ngoài bánh ngần này */
  rimOut: 0.035,
  axleZ: 0.03,
  seatTop: 0.21,
  casterR: 0.06,
  casterX: 0.24,
  casterZ: 0.5,
  /** trục xoay bánh trước (ở độ cao này) */
  casterPivotY: 0.15,
  /** bánh trước nằm sau trục xoay ngần này (để tự xoay theo hướng đi) */
  casterTrail: 0.04,
} as const
export const WHEEL_RADIUS = RIDE.wheelR

interface Parts {
  glasses: THREE.BufferGeometry
  shades: THREE.BufferGeometry
  headset: THREE.BufferGeometry
  tank: THREE.BufferGeometry
  valve: THREE.BufferGeometry
  hose: THREE.BufferGeometry
  mask: THREE.BufferGeometry
  maskRim: THREE.BufferGeometry
  stickHandle: THREE.BufferGeometry
  stickGlow: THREE.BufferGeometry
  chairFrame: THREE.BufferGeometry
  chairSeat: THREE.BufferGeometry
  wheel: THREE.BufferGeometry
  tire: THREE.BufferGeometry
  casterWheel: THREE.BufferGeometry
  casterFork: THREE.BufferGeometry
  black: THREE.Material
  glossy: THREE.Material
  green: THREE.Material
  metal: THREE.Material
  tube: THREE.Material
  fabric: THREE.Material
  rubber: THREE.Material
  clear: THREE.Material
  glows: Map<string, THREE.Material>
}

let parts: Parts | null = null

const merge = (list: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const flat = list.map((g) => {
    const out = g.index ? g.toNonIndexed() : g
    if (out !== g) g.dispose()
    out.deleteAttribute('uv')
    return out
  })
  const merged = mergeGeometries(flat)
  for (const g of flat) g.dispose()
  return merged ?? new THREE.BufferGeometry()
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z)

function build(headCentre: number, headR: number): Parts {
  // --- kính cận: hai vòng tròn mảnh + sống mũi + hai gọng ra tới tai
  const eyeY = headCentre + 0.01
  const eyeZ = headR + 0.008
  const ring = (side: number) => at(new THREE.TorusGeometry(0.058, 0.009, 6, 20), side * 0.1, eyeY, eyeZ)
  const temple = (side: number) => at(new THREE.BoxGeometry(0.012, 0.012, 0.24), side * 0.165, eyeY, eyeZ - 0.12)
  const glasses = merge([ring(-1), ring(1), at(new THREE.BoxGeometry(0.05, 0.01, 0.01), 0, eyeY + 0.01, eyeZ + 0.004), temple(-1), temple(1)])
  // --- kính râm "deal with it": hai mắt kính vuông đen + thanh ngang trên
  const lens = (side: number) => at(new THREE.BoxGeometry(0.13, 0.075, 0.02), side * 0.085, eyeY - 0.005, eyeZ + 0.01)
  const shades = merge([lens(-1), lens(1), at(new THREE.BoxGeometry(0.34, 0.025, 0.02), 0, eyeY + 0.03, eyeZ + 0.01), temple(-1), temple(1)])
  // --- tai nghe gaming: quai cong qua đỉnh đầu, hai chụp tai, cần mic
  const band = new THREE.TorusGeometry(headR + 0.03, 0.022, 6, 24, Math.PI)
  band.translate(0, headCentre, 0)
  const cup = (side: number) => {
    const g = new THREE.CylinderGeometry(0.09, 0.09, 0.07, 14)
    g.rotateZ(Math.PI / 2)
    return at(g, side * (headR + 0.025), headCentre - 0.01, 0)
  }
  const mic = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6)
  mic.rotateX(Math.PI / 2 - 0.35)
  at(mic, -(headR - 0.02), headCentre - 0.09, 0.1)
  const headset = merge([band, cup(-1), cup(1), mic])
  // --- bình oxi đeo sau lưng + dây thở vòng qua vai lên mặt nạ thở
  const tank = merge([
    at(new THREE.CylinderGeometry(0.075, 0.075, 0.48, 16), 0.12, 1.02, -0.37),
    at(new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.12, 1.26, -0.37),
  ])
  const valve = merge([at(new THREE.CylinderGeometry(0.025, 0.03, 0.07, 10), 0.12, 1.35, -0.37), at(new THREE.BoxGeometry(0.08, 0.02, 0.02), 0.12, 1.38, -0.37)])
  const hosePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.12, 1.39, -0.37),
    new THREE.Vector3(0.22, 1.47, -0.2),
    new THREE.Vector3(0.26, 1.42, 0.05),
    new THREE.Vector3(0.15, 1.4, 0.22),
    new THREE.Vector3(0.02, 1.45, 0.28), // vào đầu nối dưới đáy mặt nạ
  ])
  const hose = new THREE.TubeGeometry(hosePath, 28, 0.011, 6, false)
  // mặt nạ thở trùm mũi + miệng (miệng vẽ ở ~0,15 m dưới tâm đầu): vỏ nhựa trong, viền, đầu nối, dây đeo vòng qua đầu
  const maskY = headCentre - 0.1
  const maskZ = Math.sqrt(headR * headR - 0.1 * 0.1) - 0.012
  const mask = new THREE.SphereGeometry(0.105, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)
  mask.rotateX(Math.PI / 2)
  mask.scale(1, 1.05, 0.75)
  at(mask, 0, maskY, maskZ)
  const rim = new THREE.TorusGeometry(0.105, 0.009, 6, 28)
  rim.scale(1, 1.05, 1)
  at(rim, 0, maskY, maskZ)
  const port = new THREE.CylinderGeometry(0.022, 0.018, 0.05, 10)
  port.rotateX(-0.5)
  at(port, 0, maskY - 0.085, maskZ + 0.05)
  const strap = new THREE.TorusGeometry(headR + 0.006, 0.007, 4, 40)
  strap.rotateX(Math.PI / 2 + 0.4) // phía trước thấp ngang mặt nạ (dưới mắt), cao dần ra sau gáy
  at(strap, 0, headCentre, 0)
  const maskRim = merge([rim, port, strap])
  // --- gậy cổ vũ cầm tay phải (gắn vào khuỷu tay: cẳng tay chĩa xuống −y), chĩa ra phía trước
  const stickHandle = new THREE.CylinderGeometry(0.02, 0.022, 0.16, 8)
  stickHandle.rotateX(Math.PI / 2)
  at(stickHandle, 0, -0.25, 0.06)
  const stickGlow = new THREE.CapsuleGeometry(0.035, 0.22, 4, 10)
  stickGlow.rotateX(Math.PI / 2)
  at(stickGlow, 0, -0.25, 0.27)
  // --- xe lăn (ghế thấp kiểu thể thao, xem RIDE): khung, đệm ngồi, lưng tựa, chỗ để chân, tay đẩy; bánh lớn hai bên, bánh nhỏ xoay phía trước
  const R = RIDE
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => at(new THREE.BoxGeometry(w, h, d), x, y, z)
  /** thanh nối hai điểm (a → b) trong mặt phẳng y–z, ở hoành độ x */
  const strut = (x: number, ay: number, az: number, by: number, bz: number, t = 0.03) => {
    const g = new THREE.BoxGeometry(t, Math.hypot(by - ay, bz - az), t)
    g.rotateX(Math.atan2(bz - az, by - ay))
    return at(g, x, (ay + by) / 2, (az + bz) / 2)
  }
  const railY = R.seatTop - 0.04
  const chairFrame = merge([
    ...[-1, 1].flatMap((s) => [
      box(0.03, 0.03, 0.56, s * 0.25, railY, -0.02), // thanh dọc dưới đệm
      strut(s * 0.25, railY, -0.3, 0.7, -0.36), // trụ lưng tựa (hơi ngả sau)
      box(0.03, 0.03, 0.12, s * 0.25, 0.7, -0.42), // tay đẩy phía sau
      box(0.03, R.wheelR - railY + 0.02, 0.05, s * 0.25, (railY + R.wheelR) / 2, R.axleZ), // bản nối trục bánh
      box(R.wheelX - 0.25, 0.025, 0.025, s * (0.25 + R.wheelX) / 2, R.wheelR, R.axleZ), // trục bánh lớn
      strut(s * 0.2, railY, 0.25, 0.035, 0.4), // ống trước xuống chỗ để chân
      box(0.03, 0.03, R.casterZ - 0.26, s * R.casterX, railY + 0.02, (R.casterZ + 0.26) / 2), // thanh ra cổ bánh trước
      box(0.04, 0.05, 0.04, s * R.casterX, R.casterPivotY + 0.05, R.casterZ), // cổ bánh trước
    ]),
    box(0.42, 0.02, 0.14, 0, 0.022, 0.4), // chỗ để chân (sát sàn: ghế thấp, chân duỗi ra trước)
  ])
  const chairSeat = merge([
    box(0.5, 0.04, 0.48, 0, R.seatTop - 0.02, -0.02),
    (() => {
      const back = new THREE.BoxGeometry(0.5, 0.4, 0.03)
      back.rotateX(-0.1)
      return at(back, 0, 0.47, -0.345)
    })(),
  ])
  const wheelParts: THREE.BufferGeometry[] = []
  const handRim = new THREE.TorusGeometry(R.rimR, 0.011, 6, 32)
  handRim.rotateY(Math.PI / 2)
  at(handRim, R.rimOut, 0, 0)
  wheelParts.push(handRim)
  for (let i = 0; i < 4; i += 1) {
    const peg = new THREE.BoxGeometry(R.rimOut, 0.012, 0.012) // chốt nối vành đẩy vào bánh
    peg.translate(R.rimOut / 2, R.rimR, 0)
    peg.rotateX((i / 4) * Math.PI * 2)
    wheelParts.push(peg)
  }
  for (let i = 0; i < 12; i += 1) {
    const spoke = new THREE.BoxGeometry(0.006, R.wheelR * 2 - 0.05, 0.006)
    spoke.rotateX((i / 12) * Math.PI)
    wheelParts.push(spoke)
  }
  wheelParts.push(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 12).rotateZ(Math.PI / 2))
  const wheel = merge(wheelParts)
  const tire = new THREE.TorusGeometry(R.wheelR - 0.022, 0.022, 8, 40)
  tire.rotateY(Math.PI / 2)
  const casterWheel = merge([
    new THREE.TorusGeometry(R.casterR - 0.016, 0.016, 6, 16).rotateY(Math.PI / 2),
    new THREE.CylinderGeometry(R.casterR - 0.02, R.casterR - 0.02, 0.025, 10).rotateZ(Math.PI / 2),
  ])
  // càng bánh trước (gốc ở trục xoay; bánh nằm thấp hơn và lùi sau `casterTrail`)
  const casterFork = merge([
    box(0.02, 0.06, 0.02, 0, 0.03, 0),
    box(0.07, 0.015, 0.02, 0, 0, -R.casterTrail / 2),
    ...[-1, 1].map((s) => box(0.01, R.casterPivotY - R.casterR + 0.01, 0.015, s * 0.03, -(R.casterPivotY - R.casterR) / 2, -R.casterTrail)),
  ])
  return {
    glasses, shades, headset, tank, valve, hose, mask, maskRim, stickHandle, stickGlow, chairFrame, chairSeat, wheel, tire, casterWheel, casterFork,
    black: new THREE.MeshStandardMaterial({ color: '#16161c', roughness: 0.4, metalness: 0.3 }),
    glossy: new THREE.MeshStandardMaterial({ color: '#050507', roughness: 0.15, metalness: 0.6 }),
    green: new THREE.MeshStandardMaterial({ color: '#2f9e5b', roughness: 0.45, metalness: 0.35 }),
    metal: new THREE.MeshStandardMaterial({ color: '#b9c2d3', roughness: 0.3, metalness: 0.8 }),
    tube: new THREE.MeshStandardMaterial({ color: '#e6f2ff', roughness: 0.3, transparent: true, opacity: 0.85 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#1f2a4f', roughness: 0.85 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#111114', roughness: 0.9 }),
    clear: new THREE.MeshStandardMaterial({ color: '#dff4ff', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false }),
    glows: new Map(),
  }
}

function get(headCentre: number, headR: number): Parts {
  parts ??= build(headCentre, headR)
  return parts
}

function glow(p: Parts, color: string): THREE.Material {
  let m = p.glows.get(color)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, toneMapped: false })
    p.glows.set(color, m)
  }
  return m
}

export interface AccessoryTargets {
  /** Nhóm đầu (đặt ở cổ). */
  head: THREE.Object3D
  /** Nhóm thân (nghiêng theo dáng). */
  detail: THREE.Object3D
  /** Khuỷu tay phải (cầm gậy). */
  rightElbow: THREE.Object3D
  /** Gốc nhân vật (xe lăn đặt ở đây để không nghiêng theo thân). */
  root: THREE.Object3D
}

export interface Caster {
  /** xoay quanh trục đứng (theo hướng đi) */
  swivel: THREE.Object3D
  /** lăn quanh trục ngang */
  wheel: THREE.Object3D
}

export interface Ride {
  /** nhóm mang cả người (detail) lẫn xe: nghiêng/nhấc khi bốc đầu, nhảy */
  carrier: THREE.Group
  group: THREE.Group
  /** bánh lớn: [0] bên phải nhân vật (−x), [1] bên trái (+x) */
  wheels: [THREE.Object3D, THREE.Object3D]
  /** bánh trước: [0] phải, [1] trái */
  casters: [Caster, Caster]
}

/**
 * Gắn phụ kiện theo ngoại hình: `face` 1 kính cận, 2 kính râm, 3 tai nghe; `carry` 1 bình oxi, 2 gậy cổ vũ (màu `stickColor`);
 * `ride` 1 xe lăn. Trả về xe lăn (để quay bánh) hoặc null. Geometry/vật liệu dùng chung, giải phóng bằng disposeAccessories.
 */
export function addAccessories(t: AccessoryTargets, look: { face: number; carry: number; ride: number }, opts: { headCentre: number; headR: number; stickColor: string }): Ride | null {
  const p = get(opts.headCentre, opts.headR)
  if (look.face === 1) t.head.add(new THREE.Mesh(p.glasses, p.black))
  else if (look.face === 2) t.head.add(new THREE.Mesh(p.shades, p.glossy))
  else if (look.face === 3) t.head.add(new THREE.Mesh(p.headset, p.black))
  if (look.carry === 1) {
    t.detail.add(new THREE.Mesh(p.tank, p.green), new THREE.Mesh(p.valve, p.metal), new THREE.Mesh(p.hose, p.tube))
    t.head.add(new THREE.Mesh(p.maskRim, p.green), new THREE.Mesh(p.mask, p.clear))
  } else if (look.carry === 2) {
    t.rightElbow.add(new THREE.Mesh(p.stickHandle, p.black), new THREE.Mesh(p.stickGlow, glow(p, opts.stickColor)))
  }
  if (look.ride !== 1) return null
  const group = new THREE.Group()
  group.add(new THREE.Mesh(p.chairFrame, p.metal), new THREE.Mesh(p.chairSeat, p.fabric))
  const wheelFor = (side: number) => {
    const w = new THREE.Group()
    w.position.set(side * RIDE.wheelX, RIDE.wheelR, RIDE.axleZ)
    const spokes = new THREE.Mesh(p.wheel, p.metal)
    spokes.scale.x = side // vành đẩy nằm phía ngoài ở cả hai bên
    w.add(spokes, new THREE.Mesh(p.tire, p.rubber))
    group.add(w)
    return w
  }
  const casterFor = (side: number): Caster => {
    const swivel = new THREE.Group()
    swivel.position.set(side * RIDE.casterX, RIDE.casterPivotY, RIDE.casterZ)
    const wheel = new THREE.Group()
    wheel.position.set(0, RIDE.casterR - RIDE.casterPivotY, -RIDE.casterTrail)
    wheel.add(new THREE.Mesh(p.casterWheel, p.rubber))
    swivel.add(new THREE.Mesh(p.casterFork, p.metal), wheel)
    group.add(swivel)
    return { swivel, wheel }
  }
  // người và xe chung một nhóm để bốc đầu / nhảy cùng nhau (nhãn tên, ảnh ở xa vẫn gắn ở gốc)
  const carrier = new THREE.Group()
  t.root.add(carrier)
  carrier.add(t.detail, group)
  return { carrier, group, wheels: [wheelFor(-1), wheelFor(1)], casters: [casterFor(-1), casterFor(1)] }
}

export function disposeAccessories(): void {
  if (!parts) return
  const p = parts
  parts = null
  for (const g of [p.glasses, p.shades, p.headset, p.tank, p.valve, p.hose, p.mask, p.maskRim, p.stickHandle, p.stickGlow, p.chairFrame, p.chairSeat, p.wheel, p.tire, p.casterWheel, p.casterFork]) g.dispose()
  for (const m of [p.black, p.glossy, p.green, p.metal, p.tube, p.fabric, p.rubber, p.clear, ...p.glows.values()]) m.dispose()
}
