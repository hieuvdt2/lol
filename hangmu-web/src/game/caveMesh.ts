import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { addVenue } from './venue.ts'
import { addTeamBanners } from './teamBanners.ts'
import { PALETTE, arenaFloorTexture, domeTexture } from './arenaTextures.ts'
import type { Venue } from './venue.ts'
import { BENCH, HALL_BENCHES } from '../../shared/world.mjs'
import { addStands } from './stands.ts'
import { addPodium } from './podium.ts'
import { addLounge } from './lounge.ts'
import { addGates } from './gates.ts'
import { PODIUM_RADIUS } from './layout.ts'

const RADIUS = 58
const HEIGHT = 30
/**
 * Bảng màu nhà thi đấu esport: không gian xanh than đậm, đèn LED xanh lục lam làm điểm nhấn, trắng lạnh của đèn rọi; đỏ chỉ ở đồ của phe Tê Đỏ
 * (biểu ngữ, màn LED, bàn thi đấu), xanh dương ở phe đối thủ.
 * Bố cục: bục thi đấu ở giữa, sàn phẳng cho người chơi, khán đài ở rìa (xem layout.ts); vật lý dùng chung ở shared/world.mjs.
 */
const STONE = { base: '#3a4666', shade: '#2d3856', dark: '#1c2540', warm: '#3f4670' }
const NEON = PALETTE.red // chỉ cho biểu ngữ và huy hiệu của phe Tê Đỏ
const ACCENT = PALETTE.cyan // đèn LED của đấu trường
const LED = PALETTE.warm

type Trash = Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>

export function addCaveScenery(scene: THREE.Scene, trash: Trash): Venue {
  scene.background = new THREE.Color('#0b1224')
  scene.fog = new THREE.Fog('#0b1224', 70, 190)
  scene.add(new THREE.HemisphereLight('#dde6fa', '#2c3560', 2.9))
  const ambient = new THREE.AmbientLight('#b4c2f0', 0.7)
  scene.add(ambient)
  const key = new THREE.DirectionalLight('#e4ecff', 1.5)
  key.position.set(18, 46, 24)
  scene.add(key)

  const either = stoneMaterial(THREE.DoubleSide)
  trash.push(either)

  // vòm trần: mặt xanh than liền, gân vòm toả ra từ đỉnh
  const panelMap = domeTexture(14, 3)
  // Chế độ nhẹ (localStorage `hangmu.lite` = '1'): vòm và sàn không tính ánh sáng — hai mặt này phủ gần hết màn hình nên tốn nhất trên WebGL phần mềm.
  const lite = (() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem('hangmu.lite') === '1'
    } catch {
      return false
    }
  })()
  const inside = lite ? new THREE.MeshBasicMaterial({ map: panelMap, side: THREE.BackSide, color: '#ffffff' }) : new THREE.MeshLambertMaterial({ map: panelMap, side: THREE.BackSide })
  trash.push(inside, panelMap)
  const dome = buildDome()
  scene.add(new THREE.Mesh(dome, inside))
  trash.push(dome)
  addDomeRibs(scene, trash)

  const apron = buildApron()
  const floorMap = arenaFloorTexture(RADIUS + 3, PODIUM_RADIUS)
  const floorMaterial = lite ? new THREE.MeshBasicMaterial({ map: floorMap, color: '#ffffff' }) : new THREE.MeshLambertMaterial({ map: floorMap })
  scene.add(new THREE.Mesh(apron, floorMaterial))
  trash.push(apron, floorMaterial, floorMap)

  addStands(scene, trash, lite)
  addPodium(scene, trash, lite)
  addLounge(scene, trash, lite)
  addGates(scene, trash, lite)
  addLightRigs(scene, trash)
  addEntrance(scene, trash, either)
  addTeamBanners(scene, trash)
  addBenches(scene, trash)
  return addVenue(scene, trash)
}

/** Ghế hội trường: đúng 50 hộp mà vật lý dùng để chặn đường. Băng ghế khán đài do stands.ts vẽ; vẽ chồng hai lớp ở cùng chỗ gây nhấp nháy (z-fighting). */
function addBenches(scene: THREE.Scene, trash: Trash): void {
  const geometry = new THREE.BoxGeometry(BENCH.length, BENCH.height, BENCH.depth)
  const material = new THREE.MeshLambertMaterial({ color: '#ffffff' })
  const mesh = new THREE.InstancedMesh(geometry, material, HALL_BENCHES.length)
  const hall = new THREE.Color('#5a6a94') // ghế hội trường xanh xám
  const matrix = new THREE.Matrix4()
  const turn = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  HALL_BENCHES.forEach((b, i) => {
    turn.setFromAxisAngle(up, 0) // ghế hội trường không xoay (xem HALL_BENCHES trong shared/world.mjs)
    matrix.compose(new THREE.Vector3(b.x, BENCH.height / 2, b.z), turn, new THREE.Vector3(1, 1, 1))
    mesh.setMatrixAt(i, matrix)
    mesh.setColorAt(i, hall)
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  scene.add(mesh)
  trash.push(geometry, material)
}

function stoneMaterial(side: THREE.Side): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, side })
}

function buildDome(): THREE.BufferGeometry {
  const sphere = new THREE.SphereGeometry(RADIUS, 56, 36, 0, Math.PI * 2, 0, Math.PI / 2 + 0.1)
  const source = sphere.toNonIndexed()
  sphere.dispose()
  const position = source.getAttribute('position')
  const scaleY = HEIGHT / RADIUS
  const kept: number[] = []
  for (let index = 0; index < position.count; index += 3) {
    const x = (position.getX(index) + position.getX(index + 1) + position.getX(index + 2)) / 3
    const y = (position.getY(index) + position.getY(index + 1) + position.getY(index + 2)) / 3
    const z = (position.getZ(index) + position.getZ(index + 1) + position.getZ(index + 2)) / 3
    const scaledY = y * scaleY
    const entrance = z > 0 && (x / 7.5) ** 2 + (scaledY / 7.6) ** 2 < 1
    if (entrance) continue
    for (let corner = 0; corner < 3; corner += 1) {
      kept.push(position.getX(index + corner), position.getY(index + corner), position.getZ(index + corner))
    }
  }
  source.dispose()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3))
  // UV theo góc quanh trục và độ cao, để lát texture không méo
  const pos = geometry.getAttribute('position')
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    uv[i * 2] = (Math.atan2(x, z) / (Math.PI * 2)) % 1
    uv[i * 2 + 1] = Math.acos(THREE.MathUtils.clamp(y / RADIUS, -1, 1)) / (Math.PI / 2)
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.scale(1, scaleY, 1)
  geometry.computeVertexNormals()
  return geometry
}

function buildApron(): THREE.BufferGeometry {
  const geometry = new THREE.RingGeometry(PODIUM_RADIUS - 0.5, RADIUS + 3, 120, 8)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

/** Vòng đèn LED đỏ chạy dọc mép từng bậc khán đài và quanh sàn. */
/** Gân vòm: 24 đường gân toả ra từ đỉnh trần, và hai vòng bao đèn lớn (quầng sáng) phía trên sân giữa. */
function addDomeRibs(scene: THREE.Scene, trash: Trash): void {
  const metal = new THREE.MeshStandardMaterial({ color: '#5f6d92', roughness: 0.45, metalness: 0.6 })
  const halo = new THREE.MeshBasicMaterial({ color: LED })
  trash.push(metal, halo)
  const ribs: THREE.BufferGeometry[] = []
  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2
    if (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < 0.3) continue // chừa cửa vào
    const points: THREE.Vector3[] = []
    for (let k = 0; k <= 24; k += 1) {
      const phi = (k / 24) * (Math.PI / 2 - 0.03)
      const d = Math.sin(phi) * (RADIUS - 0.4)
      points.push(new THREE.Vector3(Math.sin(angle) * d, Math.cos(phi) * HEIGHT - 0.35, Math.cos(angle) * d))
    }
    ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.22, 5, false))
  }
  const merged = mergeGeometries(ribs)
  for (const rib of ribs) rib.dispose()
  if (merged) {
    scene.add(new THREE.Mesh(merged, metal))
    trash.push(merged)
  }
  // quầng sáng lớn phía trên sân giữa: hai vòng đồng tâm
  const rings: THREE.BufferGeometry[] = []
  for (const radius of [9, 12.5]) {
    const ring = new THREE.TorusGeometry(radius, 0.28, 8, 96)
    ring.rotateX(Math.PI / 2)
    ring.translate(0, caveCeiling(radius) - 0.9, 0)
    rings.push(ring)
  }
  const haloMerged = mergeGeometries(rings)
  for (const ring of rings) ring.dispose()
  if (haloMerged) {
    scene.add(new THREE.Mesh(haloMerged, halo))
    trash.push(haloMerged)
  }
}

/** Giàn đèn trên trần: vòng giàn thép, đèn rọi đỏ/trắng treo đều, cột LED dựng dọc vách. Thay cho thạch nhũ của hang. */
function addLightRigs(scene: THREE.Scene, trash: Trash): void {
  const metal = new THREE.MeshStandardMaterial({ color: '#59607a', roughness: 0.45, metalness: 0.6 })
  const glow = new THREE.MeshBasicMaterial({ color: LED })
  trash.push(metal, glow)
  const trusses: THREE.BufferGeometry[] = []
  const strips: THREE.BufferGeometry[] = []
  for (const radius of [14, 28, 42]) {
    const y = caveCeiling(radius) - 1.3
    const truss = new THREE.TorusGeometry(radius, 0.2, 6, 96)
    truss.rotateX(Math.PI / 2)
    truss.translate(0, y, 0)
    const strip = new THREE.TorusGeometry(radius, 0.07, 6, 96)
    strip.rotateX(Math.PI / 2)
    strip.translate(0, y - 0.22, 0)
    trusses.push(truss)
    strips.push(strip)
  }
  const trussMerged = mergeGeometries(trusses)
  const stripMerged = mergeGeometries(strips)
  for (const g of [...trusses, ...strips]) g.dispose()
  if (trussMerged && stripMerged) {
    scene.add(new THREE.Mesh(trussMerged, metal), new THREE.Mesh(stripMerged, glow))
    trash.push(trussMerged, stripMerged)
  }
  // đèn rọi: hộp nhỏ treo dưới giàn, mặt kính xen kẽ đỏ/trắng
  const can = new THREE.BoxGeometry(0.55, 0.9, 0.55)
  const lens = new THREE.BoxGeometry(0.4, 0.08, 0.4)
  trash.push(can, lens)
  const lights: Array<[number, number, number]> = []
  for (const [radius, count] of [[14, 12], [28, 24], [42, 32]] as const) {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2
      lights.push([Math.sin(angle) * radius, caveCeiling(radius) - 2, Math.cos(angle) * radius])
    }
  }
  const cans = new THREE.InstancedMesh(can, metal, lights.length)
  const lenses = new THREE.InstancedMesh(lens, new THREE.MeshBasicMaterial({ color: '#ffffff' }), lights.length)
  trash.push(lenses.material as THREE.Material)
  const matrix = new THREE.Matrix4()
  const colour = new THREE.Color()
  lights.forEach(([x, y, z], i) => {
    cans.setMatrixAt(i, matrix.makeTranslation(x, y, z))
    lenses.setMatrixAt(i, matrix.makeTranslation(x, y - 0.5, z))
    lenses.setColorAt(i, colour.set(i % 2 === 0 ? ACCENT : '#ffffff'))
  })
  cans.instanceMatrix.needsUpdate = true
  lenses.instanceMatrix.needsUpdate = true
  if (lenses.instanceColor) lenses.instanceColor.needsUpdate = true
  scene.add(cans, lenses)
  // cột LED dọc vách (chừa cửa vào)
  const pillar = new THREE.BoxGeometry(0.3, 11, 0.3)
  trash.push(pillar)
  const posts: THREE.Matrix4[] = []
  for (let i = 0; i < 40; i += 1) {
    const angle = (i / 40) * Math.PI * 2
    const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle))
    if (Math.abs(wrapped) < 0.27) continue
    const distance = RADIUS - 2.2
    posts.push(new THREE.Matrix4().makeTranslation(Math.sin(angle) * distance, 5.4, Math.cos(angle) * distance))
  }
  const led = new THREE.InstancedMesh(pillar, glow, posts.length)
  posts.forEach((m, i) => led.setMatrixAt(i, m))
  led.instanceMatrix.needsUpdate = true
  scene.add(led)
}

function addEntrance(scene: THREE.Scene, trash: Trash, material: THREE.Material): void {
  const arch = new THREE.TorusGeometry(6.2, 2.4, 10, 24, Math.PI)
  displace(arch, { amp: 0.25, freq: 0.35, seed: 61, strata: 0.4, streaks: 0.3, ...STONE })
  const tunnel = new THREE.CylinderGeometry(5.6, 4.6, 18, 18, 6, true)
  tunnel.rotateX(Math.PI / 2)
  displace(tunnel, { amp: 0.2, freq: 0.4, seed: 63, streaks: 0.3, ...STONE })
  trash.push(arch, tunnel)
  const group = new THREE.Group()
  group.position.z = RADIUS - 2.5
  const archMesh = new THREE.Mesh(arch, material)
  archMesh.scale.set(1.1, 1.05, 1.2)
  group.add(archMesh)
  const neon = new THREE.Mesh(new THREE.TorusGeometry(6.8, 0.14, 8, 48, Math.PI), new THREE.MeshBasicMaterial({ color: ACCENT }))
  neon.position.z = -2.95
  group.add(neon)
  trash.push(neon.geometry, neon.material)
  const tunnelMesh = new THREE.Mesh(tunnel, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }))
  tunnelMesh.position.set(0, 2.6, 9)
  group.add(tunnelMesh)
  trash.push(tunnelMesh.material)
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshBasicMaterial({ color: '#cfe8ff', side: THREE.DoubleSide, fog: false }),
  )
  mouth.position.set(0, 3, 17.5)
  group.add(mouth)
  trash.push(mouth.geometry, mouth.material)
  scene.add(group)
}

/** Biểu tượng riêng (lục giác đỏ + tia chớp trắng): tự thiết kế, không phải logo của đội nào. */
function drawEmblem(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  g.beginPath()
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  g.closePath()
  g.fillStyle = NEON
  g.fill()
  g.lineWidth = r * 0.1
  g.strokeStyle = '#ffffff'
  g.stroke()
  g.beginPath()
  g.moveTo(cx + r * 0.16, cy - r * 0.68)
  g.lineTo(cx - r * 0.42, cy + r * 0.08)
  g.lineTo(cx - r * 0.02, cy + r * 0.08)
  g.lineTo(cx - r * 0.2, cy + r * 0.7)
  g.lineTo(cx + r * 0.46, cy - r * 0.14)
  g.lineTo(cx + r * 0.06, cy - r * 0.14)
  g.closePath()
  g.fillStyle = '#ffffff'
  g.fill()
}

export function bannerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 220
  canvas.height = 520
  const g = canvas.getContext('2d')
  if (!g) return new THREE.CanvasTexture(canvas)
  g.fillStyle = '#0d0d12'
  g.fillRect(0, 0, 220, 520)
  g.fillStyle = '#d4102c'
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(220, 0)
  g.lineTo(220, 120)
  g.lineTo(0, 200)
  g.closePath()
  g.fill()
  g.fillStyle = '#ffffff'
  g.fillRect(0, 205, 220, 6)
  drawEmblem(g, 110, 300, 62)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '800 58px "Be Vietnam Pro", system-ui, sans-serif'
  g.fillText('TÊ', 110, 405)
  g.fillStyle = NEON
  g.fillText('ĐỎ', 110, 465)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function caveCeiling(distance: number): number {
  return HEIGHT * Math.sqrt(Math.max(0, 1 - (distance / RADIUS) ** 2))
}

interface DisplaceOptions {
  amp: number
  freq: number
  seed: number
  strata?: number
  streaks: number
  base: string
  shade: string
  dark: string
  warm: string
}

function displace(geometry: THREE.BufferGeometry, options: DisplaceOptions): void {
  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  const base = new THREE.Color(options.base)
  const shade = new THREE.Color(options.shade)
  const dark = new THREE.Color(options.dark)
  const warm = new THREE.Color(options.warm)
  const mixed = new THREE.Color()
  const offset = new THREE.Vector3()
  const outward = new THREE.Vector3()
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    const frequency = options.freq
    offset.set(
      fbm(x * frequency, y * frequency, z * frequency, options.seed),
      fbm(x * frequency, y * frequency, z * frequency, options.seed + 7),
      fbm(x * frequency, y * frequency, z * frequency, options.seed + 13),
    )
    offset.multiplyScalar(options.amp)
    outward.set(x, y, z)
    if (outward.lengthSq() > 1e-6) outward.normalize()
    if ((options.strata ?? 0) > 0) {
      const band = Math.sin(y * (options.strata ?? 0) + valueNoise(x * frequency, y * frequency * 0.3, z * frequency, options.seed + 17) * 1.5)
      offset.addScaledVector(outward, Math.sign(band) * Math.abs(band) ** 3 * options.amp * 0.35)
    }
    position.setXYZ(index, x + offset.x, y + offset.y, z + offset.z)
    const mix = (fbm(x * frequency * 1.7, y * frequency * 1.7, z * frequency * 1.7, options.seed + 29) + 1) / 2
    mixed.copy(base).lerp(shade, mix * 0.9)
    const warmMix = Math.max(0, valueNoise(x * frequency * 0.8, y * frequency * 0.8, z * frequency * 0.8, options.seed + 31))
    mixed.lerp(warm, warmMix * 0.45)
    const cavity = THREE.MathUtils.clamp(-offset.dot(outward) / (options.amp || 1), 0, 1)
    mixed.lerp(dark, cavity * 0.55)
    const streak = valueNoise(x * frequency * 3.2, y * frequency * 0.35, z * frequency * 3.2, options.seed + 37)
    if (streak > 0.25) mixed.lerp(dark, Math.min(1, (streak - 0.25) * 2.2) * options.streaks)
    colors.set([mixed.r, mixed.g, mixed.b], index * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
}

function fbm(x: number, y: number, z: number, seed: number): number {
  return (
    valueNoise(x, y, z, seed) * 0.6 +
    valueNoise(x * 2.1, y * 2.1, z * 2.1, seed + 3) * 0.28 +
    valueNoise(x * 4.3, y * 4.3, z * 4.3, seed + 5) * 0.12
  )
}

function valueNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const tx = fade(x - ix)
  const ty = fade(y - iy)
  const tz = fade(z - iz)
  const sample = (ox: number, oy: number, oz: number) => hash(ix + ox, iy + oy, iz + oz, seed)
  const x0 = lerp(sample(0, 0, 0), sample(1, 0, 0), tx)
  const x1 = lerp(sample(0, 1, 0), sample(1, 1, 0), tx)
  const x2 = lerp(sample(0, 0, 1), sample(1, 0, 1), tx)
  const x3 = lerp(sample(0, 1, 1), sample(1, 1, 1), tx)
  return lerp(lerp(x0, x1, ty), lerp(x2, x3, tz), tz) * 2 - 1
}

function hash(x: number, y: number, z: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453
  return value - Math.floor(value)
}

function fade(value: number): number {
  return value * value * (3 - 2 * value)
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

