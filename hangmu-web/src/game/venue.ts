// Đấu trường chung kết esports: khán giả trên khán đài, màn hình LED cong khổng lồ có hình ảnh động, dải LED chân dung tuyển thủ,
// giàn đèn thanh chạy sáng trên trần, chùm đèn quét, cúp trên bục giữa sân, dải LED chữ chạy quanh vách.
// Mô phỏng bố cục chung của một đêm chung kết (theo ảnh tham khảo người dùng đưa); mọi hình vẽ đều tự tạo, không dùng logo, tên người
// hay tài trợ thật. Chỉ là hình ảnh: vật cản và va chạm vẫn do shared/world.mjs quyết định.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { STAGE, STAND_BENCHES } from '../../shared/world.mjs'
import { PODIUM_HEIGHT, SHOW_FAKE_PEOPLE } from './layout.ts'
import { HALL_PLINTH } from './cameraGuard.ts'

type Trash = Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>

export interface Venue {
  /** Nhóm đối tượng của màn LED trung tâm (để đo vị trí trên màn hình khi kiểm thử). */
  crown: THREE.Group
  /** Gọi mỗi khung hình với đồng hồ (ms): cập nhật đèn, khán giả, màn hình LED. */
  update(nowMs: number): void
}

const RED = '#e5455a' // phe Tê Đỏ (chỉ trên màn LED)
const ACCENT = '#3fc8ff' // đèn LED của đấu trường
const CAVE_RADIUS = 58
const CAVE_HEIGHT = 30

const ceilingAt = (distance: number): number => CAVE_HEIGHT * Math.sqrt(Math.max(0, 1 - (distance / CAVE_RADIUS) ** 2))

function mulberry(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- màn hình LED khổng lồ

const WALL_W = 1664
const WALL_H = 640
/** Canvas thật nhỏ hơn toạ độ vẽ (tỉ lệ 0,75) để tải texture nhẹ hơn trên máy yếu. */
const WALL_SCALE = 0.75
/**
 * "Vương miện" LED treo ngay trên bục thi đấu: bốn mặt màn hình quay ra bốn phía, nhìn thấy từ mọi chỗ trên sàn và khán đài (như màn treo
 * trên sân khấu LCK trong ảnh tham khảo). Lăng trụ vuông thẳng đứng (bốn mặt khít nhau ở góc, không nghiêng) để không bị méo hình khi đổi góc nhìn.
 * Đây là màn hình DUY NHẤT ở trung tâm; bảng xếp hạng LCK nằm ở vách bắc (xem hangingBoard.ts). Màn YouTube ở hội trường (vách phía bắc).
 */
export const CROWN = { centerY: 9.6, width: 18 } as const
/** Cao của bệ sân khấu hội trường (đỡ màn YouTube). */

const roundRect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

const clock = (seconds: number): string => `${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`

const ROLES = ['TOP', 'JUG', 'MID', 'ADC', 'SUP'] as const

/** Vẽ một khung hình của màn hình LED lớn: bản đồ trận (sơ đồ cách điệu), thanh điểm số, thẻ tuyển thủ, bảng bên phải đổi theo chu kỳ. */
export function drawWall(g: CanvasRenderingContext2D, seconds: number): void {
  const t = seconds
  g.fillStyle = '#0b1020'
  g.fillRect(0, 0, WALL_W, WALL_H)

  // --- bản đồ trận (sơ đồ cách điệu, không phải bản đồ của game nào)
  const mx = 40
  const my = 96
  const ms = 440
  const map = g.createLinearGradient(mx, my, mx + ms, my + ms)
  map.addColorStop(0, '#0c2438')
  map.addColorStop(1, '#1b1a44')
  g.fillStyle = map
  roundRect(g, mx, my, ms, ms, 18)
  g.fill()
  g.save()
  roundRect(g, mx, my, ms, ms, 18)
  g.clip()
  // sông chéo
  g.strokeStyle = 'rgba(80,170,220,0.35)'
  g.lineWidth = 46
  g.beginPath()
  g.moveTo(mx, my + ms)
  g.lineTo(mx + ms, my)
  g.stroke()
  // ba đường
  g.strokeStyle = 'rgba(235,235,245,0.55)'
  g.lineWidth = 10
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(mx + 44, my + ms - 44)
  g.lineTo(mx + 44, my + 44)
  g.lineTo(mx + ms - 44, my + 44)
  g.moveTo(mx + 44, my + ms - 44)
  g.lineTo(mx + ms - 44, my + ms - 44)
  g.lineTo(mx + ms - 44, my + 44)
  g.moveTo(mx + 44, my + ms - 44)
  g.lineTo(mx + ms - 44, my + 44)
  g.stroke()
  // căn cứ
  g.fillStyle = RED
  g.beginPath()
  g.arc(mx + 56, my + ms - 56, 34, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#7cc4ff'
  g.beginPath()
  g.arc(mx + ms - 56, my + 56, 34, 0, Math.PI * 2)
  g.fill()
  // quân di chuyển dọc ba đường (mô phỏng giao tranh)
  const lanes: Array<[number, number, number, number]> = [
    [mx + 44, my + ms - 44, mx + 44, my + 44],
    [mx + 44, my + ms - 44, mx + ms - 44, my + ms - 44],
    [mx + 44, my + ms - 44, mx + ms - 44, my + 44],
  ]
  lanes.forEach(([x0, y0, x1, y1], lane) => {
    for (let i = 0; i < 4; i += 1) {
      const k = (Math.sin(t * 0.5 + lane * 1.7 + i * 0.9) + 1) / 2
      g.fillStyle = i % 2 === 0 ? RED : '#7cc4ff'
      g.beginPath()
      g.arc(x0 + (x1 - x0) * (0.18 + k * 0.64), y0 + (y1 - y0) * (0.18 + k * 0.64) + (i % 2 ? 9 : -9), 9, 0, Math.PI * 2)
      g.fill()
    }
  })
  // vụ giao tranh nhấp nháy ở giữa bản đồ
  const flash = Math.max(0, Math.sin(t * 2.2)) ** 6
  g.fillStyle = `rgba(255,255,255,${0.15 + flash * 0.6})`
  g.beginPath()
  g.arc(mx + ms / 2, my + ms / 2, 22 + flash * 26, 0, Math.PI * 2)
  g.fill()
  g.restore()

  // --- vùng hình ảnh giữa: khung "góc quay" tuyển thủ (cách điệu)
  const cx = 520
  const cw = 640
  const sky = g.createLinearGradient(0, my, 0, my + ms)
  sky.addColorStop(0, '#0e1630')
  sky.addColorStop(1, '#1a1e48')
  g.fillStyle = sky
  roundRect(g, cx, my, cw, ms, 18)
  g.fill()
  g.save()
  roundRect(g, cx, my, cw, ms, 18)
  g.clip()
  for (let i = 0; i < 9; i += 1) {
    const phase = t * 0.35 + i * 0.7
    g.fillStyle = `rgba(63,200,255,${0.07 + 0.05 * Math.sin(phase)})`
    g.beginPath()
    g.moveTo(cx + ((i * 97 + t * 14) % (cw + 200)) - 100, my)
    g.lineTo(cx + ((i * 97 + t * 14) % (cw + 200)) + 60, my)
    g.lineTo(cx + ((i * 97 + t * 14) % (cw + 200)) - 140, my + ms)
    g.lineTo(cx + ((i * 97 + t * 14) % (cw + 200)) - 300, my + ms)
    g.closePath()
    g.fill()
  }
  // bóng đồng đội: hai nhóm năm vòng tròn đối diện nhau
  for (let side = 0; side < 2; side += 1) {
    for (let i = 0; i < 5; i += 1) {
      const px = cx + 70 + i * 62
      const py = my + 120 + side * 210 + Math.sin(t * 1.3 + i + side) * 6
      g.fillStyle = side === 0 ? 'rgba(255,31,61,0.85)' : 'rgba(124,196,255,0.85)'
      g.beginPath()
      g.arc(px + (side ? 150 : 0), py, 22, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = 'rgba(255,255,255,0.8)'
      g.font = '800 13px "Be Vietnam Pro", system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText(ROLES[i]!, px + (side ? 150 : 0), py + 40)
    }
  }
  g.restore()

  // --- thanh điểm số trên cùng
  const bar = g.createLinearGradient(0, 0, WALL_W, 0)
  bar.addColorStop(0, '#0b1a3a')
  bar.addColorStop(0.5, '#0a0b14')
  bar.addColorStop(1, '#0a1a2a')
  g.fillStyle = bar
  g.fillRect(0, 0, WALL_W, 78)
  g.fillStyle = RED
  g.fillRect(0, 74, WALL_W / 2, 4)
  g.fillStyle = '#7cc4ff'
  g.fillRect(WALL_W / 2, 74, WALL_W / 2, 4)
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  g.fillStyle = '#ffffff'
  g.font = '800 40px "Be Vietnam Pro", system-ui, sans-serif'
  g.fillText('TÊ ĐỎ', 56, 38)
  g.textAlign = 'right'
  g.fillText('ĐỐI THỦ', WALL_W - 56, 38)
  g.textAlign = 'center'
  g.font = '900 46px "Be Vietnam Pro", system-ui, sans-serif'
  g.fillText('2', WALL_W / 2 - 170, 38)
  g.fillText('1', WALL_W / 2 + 170, 38)
  g.font = '800 34px "Be Vietnam Pro", system-ui, sans-serif'
  g.fillStyle = '#ffd0d8'
  g.fillText(clock(18 * 60 + t), WALL_W / 2, 38)
  g.font = '700 22px "Be Vietnam Pro", system-ui, sans-serif'
  g.fillStyle = '#ff8da0'
  g.textAlign = 'left'
  g.fillText(`${(52.4 + Math.sin(t * 0.2) * 1.3).toFixed(1)}K vàng`, 320, 38)
  g.textAlign = 'right'
  g.fillStyle = '#9fd4ff'
  g.fillText(`${(49.1 + Math.sin(t * 0.17) * 1.3).toFixed(1)}K vàng`, WALL_W - 320, 38)

  // --- bảng bên phải đổi theo chu kỳ 24 s
  const px = 1200
  const pw = 424
  g.fillStyle = '#0a0b14'
  roundRect(g, px, my, pw, ms, 18)
  g.fill()
  g.strokeStyle = 'rgba(255,31,61,0.6)'
  g.lineWidth = 3
  g.stroke()
  const phase = Math.floor(t / 8) % 3
  g.textAlign = 'center'
  g.fillStyle = '#ffffff'
  if (phase === 0) {
    g.font = '800 30px "Be Vietnam Pro", system-ui, sans-serif'
    g.fillStyle = '#ff8da0'
    g.fillText('CHUNG KẾT', px + pw / 2, my + 60)
    g.fillStyle = '#ffffff'
    g.font = '900 52px "Be Vietnam Pro", system-ui, sans-serif'
    g.fillText('THẾ GIỚI', px + pw / 2, my + 118)
    // biểu tượng riêng: lục giác + tia chớp
    g.beginPath()
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2
      g.lineTo(px + pw / 2 + Math.cos(a) * 110, my + 290 + Math.sin(a) * 110)
    }
    g.closePath()
    g.fillStyle = RED
    g.fill()
    g.lineWidth = 8
    g.strokeStyle = '#ffffff'
    g.stroke()
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.moveTo(px + pw / 2 + 18, my + 205)
    g.lineTo(px + pw / 2 - 48, my + 297)
    g.lineTo(px + pw / 2 - 4, my + 297)
    g.lineTo(px + pw / 2 - 24, my + 375)
    g.lineTo(px + pw / 2 + 50, my + 275)
    g.lineTo(px + pw / 2 + 6, my + 275)
    g.closePath()
    g.fill()
    g.font = '700 26px "Be Vietnam Pro", system-ui, sans-serif'
    g.fillStyle = '#d6d8e0'
    g.fillText('Hang Tê Đỏ trực tiếp', px + pw / 2, my + 470)
  } else if (phase === 1) {
    g.font = '800 28px "Be Vietnam Pro", system-ui, sans-serif'
    g.fillStyle = '#ff8da0'
    g.fillText('ĐỘI HÌNH RA SÂN', px + pw / 2, my + 56)
    for (let i = 0; i < 5; i += 1) {
      const y = my + 110 + i * 70
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(255,31,61,0.12)'
      roundRect(g, px + 24, y, pw - 48, 58, 10)
      g.fill()
      g.fillStyle = '#ffffff'
      g.textAlign = 'left'
      g.font = '800 26px "Be Vietnam Pro", system-ui, sans-serif'
      g.fillText(ROLES[i]!, px + 44, y + 30)
      g.textAlign = 'right'
      g.font = '700 24px "Be Vietnam Pro", system-ui, sans-serif'
      g.fillStyle = '#ffd0d8'
      const kills = Math.floor(t / 5 + i * 2) % 9
      g.fillText(`${kills} / ${(i + Math.floor(t / 11)) % 5} / ${(kills + i * 2) % 12}`, px + pw - 44, y + 30)
    }
    g.textAlign = 'center'
  } else {
    g.font = '900 54px "Be Vietnam Pro", system-ui, sans-serif'
    g.fillStyle = '#ffffff'
    g.fillText('TÊ ĐỎ', px + pw / 2, my + 150)
    g.fillStyle = RED
    g.fillText('MUÔN NĂM', px + pw / 2, my + 220)
    const beat = (Math.sin(t * 6) + 1) / 2
    g.fillStyle = `rgba(255,31,61,${0.25 + beat * 0.5})`
    g.beginPath()
    g.arc(px + pw / 2, my + 360, 70 + beat * 14, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    g.font = '800 30px "Be Vietnam Pro", system-ui, sans-serif'
    g.fillText('CỔ VŨ!', px + pw / 2, my + 360)
  }

  // --- thẻ tuyển thủ phía dưới: năm bên đỏ, năm bên xanh, thanh máu động
  for (let side = 0; side < 2; side += 1) {
    for (let i = 0; i < 5; i += 1) {
      const x = 40 + side * 836 + i * 158
      const y = 560
      g.fillStyle = side === 0 ? 'rgba(255,31,61,0.16)' : 'rgba(124,196,255,0.16)'
      roundRect(g, x, y, 146, 66, 8)
      g.fill()
      g.fillStyle = '#ffffff'
      g.font = '800 20px "Be Vietnam Pro", system-ui, sans-serif'
      g.textAlign = 'left'
      g.fillText(ROLES[i]!, x + 10, y + 18)
      const hp = 0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.3 + side * 2)
      g.fillStyle = 'rgba(255,255,255,0.18)'
      g.fillRect(x + 10, y + 40, 126, 10)
      g.fillStyle = side === 0 ? RED : '#7cc4ff'
      g.fillRect(x + 10, y + 40, 126 * Math.max(0.08, hp), 10)
    }
  }
  g.textAlign = 'left'
}

function addWall(scene: THREE.Scene, trash: Trash, lite: boolean): { update: (nowMs: number) => void; group: THREE.Group } {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(WALL_W * WALL_SCALE)
  canvas.height = Math.round(WALL_H * WALL_SCALE)
  const g = canvas.getContext('2d')
  g?.scale(WALL_SCALE, WALL_SCALE)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = lite ? 1 : 8 // nhìn xiên từ dưới lên: lọc dị hướng giữ chữ rõ
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }) // một texture dùng chung cho cả bốn mặt
  const { centerY, width } = CROWN
  const height = (width * WALL_H) / WALL_W
  const panel = new THREE.PlaneGeometry(width, height)
  const frameMaterial = new THREE.MeshBasicMaterial({ color: ACCENT })
  const stripGeometry = new THREE.BoxGeometry(width + 0.3, 0.16, 0.16)
  const dark = new THREE.MeshStandardMaterial({ color: '#1a2036', roughness: 0.4, metalness: 0.5 })
  const capGeometry = new THREE.BoxGeometry(width + 0.4, 0.5, width + 0.4)
  const group = new THREE.Group()
  group.position.y = centerY
  for (let k = 0; k < 4; k += 1) {
    const side = new THREE.Group()
    side.rotation.y = (k * Math.PI) / 2 // mặt quay ra ngoài (trục +z cục bộ → hướng ra)
    const pivot = new THREE.Group()
    pivot.position.z = width / 2
    const face = new THREE.Mesh(panel, material)
    pivot.add(face)
    for (const dy of [-height / 2, height / 2]) {
      const strip = new THREE.Mesh(stripGeometry, frameMaterial)
      strip.position.set(0, dy, 0.02)
      pivot.add(strip)
    }
    side.add(pivot)
    group.add(side)
  }
  const top = new THREE.Mesh(capGeometry, dark)
  top.position.y = height / 2 + 0.3
  const bottom = new THREE.Mesh(capGeometry, dark)
  bottom.position.y = -height / 2 - 0.3
  group.add(top, bottom)
  // bốn dây thép treo vương miện lên đỉnh vòm
  const ceilingY = CAVE_HEIGHT - centerY - 0.3
  const cableMaterial = new THREE.MeshBasicMaterial({ color: '#3b4052' })
  trash.push(cableMaterial)
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    const from = new THREE.Vector3(sx * (width / 2 - 0.3), height / 2 + 0.55, sz * (width / 2 - 0.3))
    const to = new THREE.Vector3(0, ceilingY, 0)
    const cableGeometry = new THREE.CylinderGeometry(0.05, 0.05, from.distanceTo(to), 4)
    const cable = new THREE.Mesh(cableGeometry, cableMaterial)
    cable.position.copy(from).lerp(to, 0.5)
    cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
    group.add(cable)
    trash.push(cableGeometry)
  }
  scene.add(group)
  trash.push(texture, material, panel, frameMaterial, stripGeometry, dark, capGeometry)
  let last = -1
  return {
    group,
    update(nowMs) {
      // 4 khung/giây là đủ cho nội dung chậm, và giữ chi phí tải texture thấp trên điện thoại
      const frame = Math.floor(nowMs / 250)
      if (frame === last || !g || (lite && last >= 0)) return // chế độ nhẹ: chỉ vẽ một khung tĩnh
      last = frame
      drawWall(g, nowMs / 1000)
      texture.needsUpdate = true
    },
  }
}

/** Bệ sân khấu hội trường (đúng hộp chặn của server): nơi đặt màn hình lớn phát YouTube. */
function addHallPlinth(scene: THREE.Scene, trash: Trash): void {
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(STAGE.halfW * 2 + 2, HALL_PLINTH, STAGE.halfD * 2),
    new THREE.MeshStandardMaterial({ color: '#1a2036', roughness: 0.4, metalness: 0.5 }),
  )
  base.position.set(0, HALL_PLINTH / 2, STAGE.z)
  scene.add(base)
  const edge = new THREE.Mesh(new THREE.BoxGeometry(STAGE.halfW * 2 + 2.1, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: ACCENT }))
  edge.position.set(0, HALL_PLINTH - 0.06, STAGE.z + STAGE.halfD + 0.08)
  scene.add(edge)
  trash.push(base.geometry, base.material as THREE.Material, edge.geometry, edge.material as THREE.Material)
}

// ---------------------------------------------------------------- khán giả

function addAudience(scene: THREE.Scene, trash: Trash): (nowMs: number) => void {
  const random = mulberry(2026)
  // Điện thoại/máy bảng (con trỏ thô): giảm gần một nửa số khán giả để giữ khung hình mượt.
  const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  const keep = coarse ? 0.3 : 0.62
  // mỗi băng ghế ngồi được 3 người, cách nhau 0,7 m dọc theo băng
  const spots: Array<{ x: number; y: number; z: number; yaw: number }> = []
  for (const b of STAND_BENCHES) {
    for (const offset of [-0.7, 0, 0.7]) {
      if (random() > keep) continue // vài chỗ trống cho tự nhiên
      spots.push({ x: b.x + Math.cos(b.angle) * offset, y: b.y + 0.23, z: b.z - Math.sin(b.angle) * offset, yaw: b.angle + Math.PI })
    }
  }
  const torso = new THREE.CylinderGeometry(0.2, 0.25, 0.62, 6)
  torso.translate(0, 0.36, 0)
  const head = new THREE.IcosahedronGeometry(0.17, 0)
  head.translate(0, 0.98, 0)
  const stick = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4)
  const bodyMaterial = new THREE.MeshLambertMaterial()
  const headMaterial = new THREE.MeshLambertMaterial()
  const stickMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  trash.push(torso, head, stick, bodyMaterial, headMaterial, stickMaterial)
  const bodies = new THREE.InstancedMesh(torso, bodyMaterial, spots.length)
  const heads = new THREE.InstancedMesh(head, headMaterial, spots.length)
  const holders = spots.filter(() => random() < 0.25)
  const sticks = new THREE.InstancedMesh(stick, stickMaterial, holders.length)
  const shirts = ['#d4102c', '#d4102c', '#16161c', '#e9eaf0', '#3a3a48', '#8c1020'].map((c) => new THREE.Color(c))
  const skins = ['#e8c3a0', '#d9a984', '#c58f69', '#f0d2b6', '#b87b55'].map((c) => new THREE.Color(c))
  const matrix = new THREE.Matrix4()
  const turn = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const unit = new THREE.Vector3(1, 1, 1)
  const place = new THREE.Vector3()
  spots.forEach((s, i) => {
    turn.setFromAxisAngle(up, s.yaw)
    matrix.compose(place.set(s.x, s.y, s.z), turn, unit)
    bodies.setMatrixAt(i, matrix)
    heads.setMatrixAt(i, matrix)
    bodies.setColorAt(i, shirts[Math.floor(random() * shirts.length)]!)
    heads.setColorAt(i, skins[Math.floor(random() * skins.length)]!)
  })
  bodies.instanceMatrix.needsUpdate = true
  heads.instanceMatrix.needsUpdate = true
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true
  bodies.frustumCulled = false
  heads.frustumCulled = false
  sticks.frustumCulled = false
  scene.add(bodies, heads, sticks)

  const euler = new THREE.Euler()
  const color = new THREE.Color()
  const phases = holders.map(() => random() * Math.PI * 2)
  const palette = [new THREE.Color(RED), new THREE.Color('#ffffff'), new THREE.Color('#ff8da0')]
  let last = -1
  return (nowMs) => {
    const frame = Math.floor(nowMs / 50) // 20 lần/giây
    if (frame === last) return
    last = frame
    const t = nowMs / 1000
    holders.forEach((s, i) => {
      const sway = Math.sin(t * 3.2 + phases[i]!) * 0.35
      euler.set(0, s.yaw, sway)
      turn.setFromEuler(euler)
      // gậy giơ lên cạnh vai, lắc theo nhịp
      const side = Math.cos(s.yaw) * 0.28
      const depth = -Math.sin(s.yaw) * 0.28
      matrix.compose(place.set(s.x + side, s.y + 1.05, s.z + depth), turn, unit)
      sticks.setMatrixAt(i, matrix)
      color.copy(palette[Math.floor(t * 0.5 + phases[i]!) % palette.length]!)
      sticks.setColorAt(i, color)
    })
    sticks.instanceMatrix.needsUpdate = true
    if (sticks.instanceColor) sticks.instanceColor.needsUpdate = true
  }
}

// ---------------------------------------------------------------- đèn trần và chùm sáng

function addCeilingShow(scene: THREE.Scene, trash: Trash, lite: boolean): (nowMs: number) => void {
  const bar = new THREE.BoxGeometry(0.12, 0.12, 2.4)
  const material = new THREE.MeshBasicMaterial({ toneMapped: false })
  trash.push(bar, material)
  const rings: Array<[number, number]> = [[22, 48], [32, 72], [42, 96]]
  const total = rings.reduce((sum, [, n]) => sum + n, 0)
  const bars = new THREE.InstancedMesh(bar, material, total)
  const matrix = new THREE.Matrix4()
  const turn = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const unit = new THREE.Vector3(1, 1, 1)
  const place = new THREE.Vector3()
  const info: Array<{ ring: number; angle: number }> = []
  let index = 0
  rings.forEach(([radius, count], ring) => {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2
      turn.setFromAxisAngle(up, angle + 0.75) // thanh xiên so với tiếp tuyến như dàn đèn trên ảnh tham khảo
      matrix.compose(place.set(Math.sin(angle) * radius, ceilingAt(radius) - 0.7 - ring * 0.1, Math.cos(angle) * radius), turn, unit)
      bars.setMatrixAt(index, matrix)
      info.push({ ring, angle })
      index += 1
    }
  })
  bars.instanceMatrix.needsUpdate = true
  bars.frustumCulled = false
  scene.add(bars)

  // chùm đèn quét về sân giữa
  const beamGeometry = new THREE.CylinderGeometry(0.08, 1.3, 34, 12, 1, true)
  beamGeometry.translate(0, -17, 0)
  beamGeometry.rotateX(-Math.PI / 2) // trục chùm theo +z để dùng lookAt
  const beamRed = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const beamWhite = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  trash.push(beamGeometry, beamRed, beamWhite)
  const beams: THREE.Mesh[] = []
  for (let i = 0; i < (lite ? 0 : 6); i += 1) {
    const angle = (i / 6) * Math.PI * 2
    const mesh = new THREE.Mesh(beamGeometry, i % 2 ? beamWhite : beamRed)
    mesh.position.set(Math.sin(angle) * 14, ceilingAt(14) - 2.2, Math.cos(angle) * 14)
    mesh.frustumCulled = false
    scene.add(mesh)
    beams.push(mesh)
  }

  const colors = [new THREE.Color(ACCENT), new THREE.Color(ACCENT)] // một màu cho đỡ rối mắt
  const color = new THREE.Color()
  const target = new THREE.Vector3()
  let last = -1
  return (nowMs) => {
    const t = nowMs / 1000
    beams.forEach((beam, i) => {
      target.set(Math.sin(t * 0.7 + i * 0.8) * 9, -2.4, Math.cos(t * 0.55 + i * 1.3) * 9)
      beam.lookAt(target)
    })
    const frame = Math.floor(nowMs / 66) // 15 lần/giây
    if (frame === last) return
    last = frame
    info.forEach(({ ring, angle }, i) => {
      // sóng sáng chạy quanh từng vòng, ngược chiều giữa các vòng
      const wave = Math.sin(angle * 3 + t * (ring % 2 ? -2.4 : 2.4))
      const lit = Math.max(0, wave) ** 2
      color.copy(colors[(i + ring) % 2]!).multiplyScalar(0.4 + lit * 0.5)
      bars.setColorAt(i, color)
    })
    if (bars.instanceColor) bars.instanceColor.needsUpdate = true
  }
}

// ---------------------------------------------------------------- màn LED vòng quanh trần và đèn LED toả tia

/** Dải bề mặt vòm giữa hai khoảng cách tới trục (d0 → d1), lùi vào trong `inset` mét; u chạy quanh một vòng, v từ d0 tới d1. */
function domeBand(d0: number, d1: number, inset: number, around = 128, across = 6): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let j = 0; j <= across; j += 1) {
    const d = d0 + ((d1 - d0) * j) / across
    for (let i = 0; i <= around; i += 1) {
      const a = (i / around) * Math.PI * 2
      positions.push(Math.sin(a) * d, ceilingAt(d) - inset, Math.cos(a) * d)
      uvs.push(i / around, 1 - j / across) // v đảo: mép trong (d0) ứng với đáy ảnh khi nhìn từ giữa sân lên
    }
  }
  const row = around + 1
  for (let j = 0; j < across; j += 1) {
    for (let i = 0; i < around; i += 1) {
      const p = j * row + i
      indices.push(p, p + 1, p + row, p + 1, p + row + 1, p + row)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

/** Màn LED chạy quanh trần: một dải trên mặt vòm, chữ và hoa văn LED chạy vòng quanh (chỉ cuộn texture, không vẽ lại mỗi khung). */
function addCeilingScreen(scene: THREE.Scene, trash: Trash): (nowMs: number) => void {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 256
  const g = canvas.getContext('2d')
  if (g) {
    const back = g.createLinearGradient(0, 0, 0, 256)
    back.addColorStop(0, '#0a1230')
    back.addColorStop(0.5, '#14224d')
    back.addColorStop(1, '#0a1230')
    g.fillStyle = back
    g.fillRect(0, 0, 2048, 256)
    // đường chạy LED mảnh phía trên và dưới
    for (const y of [22, 234]) {
      g.fillStyle = ACCENT
      g.fillRect(0, y - 3, 2048, 6)
    }
    // chữ chạy
    g.font = '800 120px "Be Vietnam Pro", system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.textAlign = 'left'
    const items = ['CHUNG KẾT THẾ GIỚI', '◆', 'TÊ ĐỎ', '◆', 'CỔ VŨ HẾT MÌNH', '◆']
    const widths = items.map((t) => g.measureText(t).width + 70)
    const total = widths.reduce((a, b) => a + b, 0)
    const scale = 2048 / total // chữ vừa đúng một vòng lặp texture để nối liền
    g.save()
    g.scale(scale, 1)
    let x = 20
    items.forEach((text, i) => {
      g.fillStyle = i % 2 === 1 ? '#8a6cff' : i === 2 ? '#ff6b7a' : '#ffffff'
      g.fillText(text, x, 130)
      x += widths[i]!
    })
    g.restore()
    // lưới điểm LED mờ phủ lên để ra cảm giác màn LED
    g.fillStyle = 'rgba(5,8,20,0.38)'
    for (let yy = 0; yy < 256; yy += 8) g.fillRect(0, yy + 5, 2048, 3)
    for (let xx = 0; xx < 2048; xx += 8) g.fillRect(xx + 5, 0, 3, 256)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.repeat.set(4, 1)
  texture.anisotropy = 4
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false })
  const geometry = domeBand(34, 40, 0.5)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  scene.add(mesh)
  // hai vòng LED viền trên và dưới dải
  const edgeMaterial = new THREE.MeshBasicMaterial({ color: ACCENT })
  const edges = [34, 40].map((d) => {
    const edge = new THREE.TorusGeometry(d, 0.1, 6, 128)
    edge.rotateX(Math.PI / 2)
    edge.translate(0, ceilingAt(d) - 0.45, 0)
    const m = new THREE.Mesh(edge, edgeMaterial)
    scene.add(m)
    return edge
  })
  trash.push(texture, material, geometry, edgeMaterial, ...edges)
  return (nowMs) => {
    texture.offset.x = (nowMs / 1000) * 0.02
  }
}

/** Vạch LED liền toả từ đỉnh trần ra rìa (xen giữa các gân vòm), một màu lục lam, sáng dịu nhịp chậm (không nét đứt, không nhiều màu cho đỡ rối mắt). */
function addCeilingLeds(scene: THREE.Scene, trash: Trash): (nowMs: number) => void {
  const spokes = 24
  const parts: THREE.BufferGeometry[] = []
  for (let k = 0; k < spokes; k += 1) {
    const a = ((k + 0.5) / spokes) * Math.PI * 2 // xen giữa hai gân vòm
    for (const [d0, d1] of [[6, 33], [41, 52]] as const) { // chừa dải màn LED ở giữa
      const points: THREE.Vector3[] = []
      for (let i = 0; i <= 12; i += 1) {
        const d = d0 + ((d1 - d0) * i) / 12
        points.push(new THREE.Vector3(Math.sin(a) * d, ceilingAt(d) - 0.55, Math.cos(a) * d))
      }
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.045, 4, false))
    }
  }
  const merged = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  const material = new THREE.MeshBasicMaterial({ color: ACCENT, toneMapped: false })
  trash.push(material)
  if (merged) {
    const mesh = new THREE.Mesh(merged, material)
    mesh.frustumCulled = false
    scene.add(mesh)
    trash.push(merged)
  }
  const base = new THREE.Color(ACCENT)
  let last = -1
  return (nowMs) => {
    const frame = Math.floor(nowMs / 100) // 10 lần/giây
    if (frame === last) return
    last = frame
    material.color.copy(base).multiplyScalar(0.55 + 0.3 * Math.sin(nowMs / 1000 * 1.2))
  }
}

// ---------------------------------------------------------------- dải LED chữ chạy quanh vách và cúp giữa sân

function addRibbon(scene: THREE.Scene, trash: Trash): (nowMs: number) => void {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 128
  const g = canvas.getContext('2d')
  if (g) {
    g.fillStyle = '#070b18'
    g.fillRect(0, 0, 2048, 128)
    g.font = '800 64px "Be Vietnam Pro", system-ui, sans-serif'
    g.textBaseline = 'middle'
    g.textAlign = 'left'
    const items = ['TÊ ĐỎ', '★', 'CHUNG KẾT THẾ GIỚI', '★', 'TÊ CON', '★', 'CỔ VŨ HẾT MÌNH', '★']
    let x = 24
    for (const [i, text] of items.entries()) {
      g.fillStyle = i % 4 === 0 ? ACCENT : '#ffffff'
      g.fillText(text, x, 66)
      x += g.measureText(text).width + 44
      if (x > 2048) break
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.repeat.set(-4, 1)
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, toneMapped: false })
  const geometry = new THREE.CylinderGeometry(CAVE_RADIUS - 1.6, CAVE_RADIUS - 1.6, 1.3, 96, 1, true, 0.3, Math.PI * 2 - 0.6)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = 7.9
  scene.add(mesh)
  trash.push(texture, material, geometry)
  return (nowMs) => {
    texture.offset.x = (nowMs / 1000) * 0.03
  }
}

function addTrophy(scene: THREE.Scene, trash: Trash): void {
  const group = new THREE.Group()
  group.position.y = PODIUM_HEIGHT
  const metal = new THREE.MeshStandardMaterial({ color: '#f0d27a', roughness: 0.25, metalness: 0.9, emissive: '#f2c14e', emissiveIntensity: 0.3 })
  const dark = new THREE.MeshStandardMaterial({ color: '#1a2036', roughness: 0.35, metalness: 0.6 })
  const profile = [
    [0.001, 0], [0.9, 0], [0.9, 0.12], [0.4, 0.28], [0.24, 0.52], [0.2, 1.05], [0.46, 1.28], [0.6, 1.7], [0.7, 2.35], [0.64, 2.45], [0.001, 2.45],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const cup = new THREE.LatheGeometry(profile, 28)
  const cupMesh = new THREE.Mesh(cup, metal)
  cupMesh.position.y = 1.25
  const pedestal = new THREE.CylinderGeometry(1.3, 1.5, 0.95, 36)
  const pedestalMesh = new THREE.Mesh(pedestal, dark)
  pedestalMesh.position.y = 0.475 + 0.3
  group.add(pedestalMesh, cupMesh)
  scene.add(group)
  trash.push(metal, dark, cup, pedestal)
}

/**
 * Chế độ nhẹ cho máy rất yếu và cho bộ kiểm thử trình duyệt chạy bằng WebGL phần mềm: bỏ khán giả, chùm đèn quét và nội dung động của màn LED.
 * Bật bằng localStorage `hangmu.lite` = '1'.
 */
function liteMode(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('hangmu.lite') === '1'
  } catch {
    return false
  }
}

/** Tường chân vòm: ốp tấm đứng than chì xen trắng có dải đỏ, và biển lối vào phía trên cửa — để không gian đọc như một nhà thi đấu, không phải hang. */
function addWallSkirt(scene: THREE.Scene, trash: Trash): void {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const g = canvas.getContext('2d')
  if (g) {
    g.fillStyle = '#141a2c'
    g.fillRect(0, 0, 1024, 256)
    for (let i = 0; i < 16; i += 1) {
      const x = i * 64
      g.fillStyle = i % 4 === 0 ? '#2a78b8' : i % 2 === 0 ? '#2b3550' : '#252e47'
      g.fillRect(x + 3, 14, 58, 196)
      g.fillStyle = 'rgba(255,255,255,0.08)'
      g.fillRect(x + 3, 14, 6, 196)
    }
    g.fillStyle = '#cfeaff'
    g.fillRect(0, 214, 1024, 8)
    g.fillStyle = '#3fc8ff'
    g.fillRect(0, 226, 1024, 14)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.repeat.set(-4, 1) // nhìn từ trong lòng hình trụ: lật chiều để họa tiết không bị ngược
  const material = new THREE.MeshLambertMaterial({ map: texture, side: THREE.BackSide })
  const geometry = new THREE.CylinderGeometry(CAVE_RADIUS - 0.8, CAVE_RADIUS - 0.8, 7.2, 96, 1, true, 0.3, Math.PI * 2 - 0.6)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = 3.6
  scene.add(mesh)
  trash.push(texture, material, geometry)
}

export function addVenue(scene: THREE.Scene, trash: Trash): Venue {
  const lite = liteMode()
  addHallPlinth(scene, trash)
  addTrophy(scene, trash)
  addWallSkirt(scene, trash)
  // Chế độ nhẹ: mỗi phần chỉ vẽ đúng một khung tĩnh rồi thôi, không cập nhật theo thời gian.
  const still = (update: (nowMs: number) => void): ((nowMs: number) => void) => {
    if (!lite) return update
    let done = false
    return (nowMs) => {
      if (done) return
      done = true
      update(nowMs)
    }
  }
  const wall = addWall(scene, trash, lite)
  const updates = [wall.update, lite || !SHOW_FAKE_PEOPLE ? () => {} : addAudience(scene, trash), still(addCeilingShow(scene, trash, lite)), still(addCeilingLeds(scene, trash)), addCeilingScreen(scene, trash), still(addRibbon(scene, trash))]
  return {
    crown: wall.group,
    update(nowMs) {
      for (const update of updates) update(nowMs)
    },
  }
}
