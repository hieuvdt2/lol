// Vật lý và hình học hang DÙNG CHUNG cho client (src/game/sim.ts) và server (bot, kiểm tra vị trí).
// Số liệu và thứ tự xử lý va chạm theo bản gốc (đối chiếu từ bundle: cấu hình F, các hằng của hang, hàm va chạm và hàm bước mô phỏng).
// Viết lại bằng mã mới; một nơi duy nhất để client và server không bao giờ lệch nhau.

export const SIM_HZ = 30
export const SIM_DT = 1 / SIM_HZ
export const MOVE_SPEED = 8
export const ACCEL = 14
export const TURN_RATE = 12
export const MAX_SUBSTEP = 0.15
export const PLAYER_RADIUS = 0.32
export const CAVE_RADIUS = 58

// Khán đài ở rìa: người chơi leo lên được. Sàn phẳng tới `inner`, rồi `tiers` bậc, mỗi bậc rộng `width`, cao thêm `rise`.
// Ghế (băng ghế) nằm giữa mỗi bậc, chừa các lối đi (cầu thang) để leo; hai bên các khoảng trống (lối vào, hội trường) có tường chắn.
export const STANDS = { inner: 40, tiers: 7, width: 2.2, rise: 0.75 }
export const STANDS_OUTER = STANDS.inner + STANDS.tiers * STANDS.width
export const STANDS_TOP = STANDS.tiers * STANDS.rise
export const WALK_RADIUS = STANDS_OUTER - 0.2
/** Bục thi đấu giữa sân (tuyển thủ): vành bục chặn cả hai chiều; chỉ vào được qua cửa (GATES). */
export const PODIUM_RADIUS = 11.5
export const PODIUM_HEIGHT = 1
export const SPAWN_X = 0
export const SPAWN_Z = 36

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Các khoảng trống không có khán đài (góc quanh trục hang: 0 = +z, π = −z): lối vào phía nam, sân khấu + màn hình hội trường phía bắc.
 * Mỗi mục là [góc tâm, nửa độ rộng (rad)]. Ở đó sàn giữ phẳng tới tận tường.
 */
export const STAND_GAPS = [
  [0, 0.42],
  [Math.PI, 0.46],
]
export const inStandGap = (angle) => STAND_GAPS.some(([center, half]) => Math.abs(wrap(angle - center)) < half)

/** Cầu thang (lối đi) lên khán đài: sáu hướng, mỗi lối rộng 2 × AISLE_HALF mét, không có ghế. */
export const AISLE_ANGLES = [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4]
export const AISLE_HALF = 1.5

/** Độ cao mặt đất tại (x, z): sàn phẳng, bậc khán đài dâng dần ra rìa (trừ các khoảng trống). */
export function floorHeight(x, z) {
  const d = Math.hypot(x, z)
  if (d < PODIUM_RADIUS) return PODIUM_HEIGHT // trên bục thi đấu (chỉ vào được qua cửa)
  if (d < STANDS.inner) return 0
  if (inStandGap(Math.atan2(x, z))) return 0
  const tier = Math.min(STANDS.tiers, Math.floor((d - STANDS.inner) / STANDS.width) + 1)
  return tier * STANDS.rise
}

// Năm hình nộm (tuyển thủ) đứng trên bục giữa sân; nằm trong vùng chặn nên người chơi không chạm tới.
export const RING_SLOTS = 5
export const RING_RADIUS = 5
export const DUMMY_RADIUS = 0.45
export const slotAngle = (i) => (i * Math.PI * 2) / RING_SLOTS
export const slotXZ = (i) => ({ x: Math.sin(slotAngle(i)) * RING_RADIUS, z: Math.cos(slotAngle(i)) * RING_RADIUS })

// Màn hình / sân khấu cuối hang: hộp chữ nhật nằm ngang.
export const STAGE = { z: -(CAVE_RADIUS - 10.5), halfW: 12.9, halfD: 1.4 }

// Ghế đá: kích thước chung của mọi ghế.
export const BENCH = { length: 2.2, depth: 0.75, height: 0.46, spacing: 2.45 }
const BENCH_HALF_W = BENCH.length / 2
const BENCH_HALF_D = BENCH.depth / 2

/** Hội trường đá: 5 hàng × 10 ghế, mỗi ghế một người, cách nhau 2,4 m; mặt về màn hình (hướng −z). */
export const HALL = {
  capacity: 50,
  zone: { x0: -12.4, x1: 12.4, z0: -38, z1: -25.1 },
  rows: [-37, -34.4, -31.8, -29.2, -26.6],
  columns: [-10.8, -8.4, -6, -3.6, -1.2, 1.2, 3.6, 6, 8.4, 10.8],
}
export const HALL_BENCHES = HALL.rows.flatMap((z) => HALL.columns.map((x) => ({ x, z })))
/** Băng ghế khán đài: dài 2,2 m, sâu 0,6 m, mỗi bậc một vòng, bỏ các chỗ trùng lối đi và khoảng trống. */
export const STAND_BENCH = { length: 2.2, depth: 0.6, height: 0.46, spacing: 2.45 }
/** Nửa chiều dài hộp va chạm của băng ghế khán đài (> nửa khoảng cách tâm tối đa giữa hai băng: 2,45 × (1 + 1/105) / 2 ≈ 1,23). */
export const STAND_BENCH_REACH = 1.24
export function standBenches() {
  const out = []
  for (let tier = 0; tier < STANDS.tiers; tier += 1) {
    const radius = STANDS.inner + tier * STANDS.width + STANDS.width / 2
    const y = (tier + 1) * STANDS.rise + STAND_BENCH.height / 2
    const count = Math.floor((2 * Math.PI * radius) / STAND_BENCH.spacing)
    for (let k = 0; k < count; k += 1) {
      const a = (k / count) * Math.PI * 2 + (tier % 2) * (Math.PI / count)
      // chừa lối đi: băng ghế (nửa dài 1,1) không được lấn vào dải lối đi
      if (AISLE_ANGLES.some((e) => Math.abs(wrap(a - e)) * radius < AISLE_HALF + STAND_BENCH_REACH + 0.05)) continue
      // chừa khoảng trống (kèm biên bằng một băng ghế để không chạm tường chắn)
      if (STAND_GAPS.some(([c, h]) => Math.abs(wrap(a - c)) * radius < h * radius + STAND_BENCH_REACH + 0.2)) continue
      // Hộp va chạm dài hơn băng ghế vẽ ra (nửa dài 1,24 thay vì 1,1) để hai băng liền nhau chồng lên nhau, không còn khe 0,25 m:
      // người chơi (đường kính 0,64 m) ép vào khe giữa hai đầu ghế bị hai bên đẩy ngược chiều, có thể lọt vào trong hộp rồi bị đẩy xuyên sang hàng bên kia.
      out.push({ x: Math.sin(a) * radius, y, z: Math.cos(a) * radius, angle: a, hw: STAND_BENCH_REACH, hd: STAND_BENCH.depth / 2 })
    }
  }
  return out
}
export const STAND_BENCHES = standBenches()

/** Tường chắn hai bên mỗi khoảng trống (dọc bán kính, từ mép sàn phẳng tới mép ngoài khán đài). */
export const STAND_WALLS = STAND_GAPS.flatMap(([center, half]) =>
  [-1, 1].map((side) => {
    const a = center + side * half
    const mid = (STANDS.inner + STANDS_OUTER) / 2
    return { x: Math.sin(a) * mid, y: STANDS_TOP / 2, z: Math.cos(a) * mid, angle: a - Math.PI / 2, hw: (STANDS_OUTER - STANDS.inner) / 2 + 0.3, hd: 0.15 }
  }),
)

/** Khoảng bước ra khi đứng dậy khỏi ghế (m), tính từ tâm ghế về phía trước mặt. */
export const SEAT_EXIT = 1.15
/**
 * Ghế ngồi trong hội trường: cùng vị trí với ghế đá; `bench` là chỉ số trong SEATS (và HALL_BENCHES).
 * Mỗi ghế có `y` (độ cao sàn tại ghế), `heading` (hướng mặt khi ngồi), `exit` (chỗ đứng dậy) và `zone` ('hall' | 'lounge' | 'stand').
 */
export const HALL_SEATS = HALL_BENCHES.map((b, bench) => ({ x: b.x, z: b.z, y: 0, bench, heading: Math.PI, exit: { x: b.x, z: b.z + SEAT_EXIT }, zone: 'hall' }))

/**
 * Phòng chờ: khu sofa nằm ở khoảng trống phía nam (giữa chỗ xuất hiện và cổng vào), quây tường kính, có tấm màn đứng phía bắc, bàn thấp ở
 * giữa và ba bộ sofa quay vào bàn. Chỉ vào được bằng cửa (bấm E ở cửa, xem GATES). `angle` của sofa cũng là hướng mặt của người ngồi
 * (trục z cục bộ của hộp = hướng ra phía trước, lưng ghế ở phía −z cục bộ).
 */
export const LOUNGE = { zone: { x0: -11, x1: 11, z0: 41, z1: 53 }, center: { x: 0, z: 47.5 } }
export const SOFA = { depth: 0.95, height: 0.46, seatSpacing: 0.85, exit: 1.35, seatForward: 0.12 }
export const LOUNGE_SOFAS = [
  { x: -3.4, z: 47.5, angle: Math.PI / 2, seats: 3 }, // bên trái, quay sang +x
  { x: 3.4, z: 47.5, angle: -Math.PI / 2, seats: 3 }, // bên phải, quay sang −x
  { x: 0, z: 51, angle: Math.PI, seats: 4 }, // phía sau, quay về phía bắc (về tấm màn)
].map((sofa) => ({ ...sofa, length: sofa.seats * SOFA.seatSpacing + 0.4 }))
export const LOUNGE_TABLE = { x: 0, z: 47.5, angle: 0, hw: 1, hd: 0.55, height: 0.42 }
/** Tấm màn đứng phía bắc phòng chờ, hai mặt (một mặt quay vào phòng chờ, một mặt quay ra cửa). */
export const LOUNGE_SCREEN = { x: 0, z: 44.2, halfW: 3.2, halfD: 0.2, width: 6, height: 3.375, bottom: 0.9 }
/** Tường kính quanh phòng chờ (hộp dày 0,3 m, cao `LOUNGE_WALL_HEIGHT`): bốn bên liền nhau, chỉ có "cửa" là điểm dịch chuyển của GATES. */
export const LOUNGE_WALL_HEIGHT = 1.6
const LW = LOUNGE.zone
export const LOUNGE_WALLS = [
  { x: 0, z: LW.z0, angle: 0, hw: (LW.x1 - LW.x0) / 2 + 0.15, hd: 0.15 }, // bắc (phía chỗ xuất hiện), có cửa
  { x: 0, z: LW.z1, angle: 0, hw: (LW.x1 - LW.x0) / 2 + 0.15, hd: 0.15 }, // nam
  { x: LW.x0, z: (LW.z0 + LW.z1) / 2, angle: Math.PI / 2, hw: (LW.z1 - LW.z0) / 2 + 0.15, hd: 0.15 }, // tây
  { x: LW.x1, z: (LW.z0 + LW.z1) / 2, angle: Math.PI / 2, hw: (LW.z1 - LW.z0) / 2 + 0.15, hd: 0.15 }, // đông
]
/** Ghế trong phòng chờ: chỉ số nối tiếp ghế hội trường (50, 51, ...). Người ngồi dịch ra trước một chút để lưng không lọt vào tựa ghế. */
export const LOUNGE_SEATS = LOUNGE_SOFAS.flatMap((sofa, s) =>
  Array.from({ length: sofa.seats }, (_, k) => {
    const t = (k - (sofa.seats - 1) / 2) * SOFA.seatSpacing
    const x = sofa.x + Math.cos(sofa.angle) * t + Math.sin(sofa.angle) * SOFA.seatForward
    const z = sofa.z - Math.sin(sofa.angle) * t + Math.cos(sofa.angle) * SOFA.seatForward
    return { x, z, y: 0, sofa: s, heading: sofa.angle, zone: 'lounge' }
  }),
).map((seat, i) => ({
  ...seat,
  bench: HALL_SEATS.length + i,
  exit: { x: seat.x + Math.sin(seat.heading) * SOFA.exit, z: seat.z + Math.cos(seat.heading) * SOFA.exit },
}))
export const inLounge = (x, z) => x >= LOUNGE.zone.x0 && x <= LOUNGE.zone.x1 && z >= LOUNGE.zone.z0 && z <= LOUNGE.zone.z1

/**
 * Bục thi đấu của tuyển thủ: quây kín bằng vành bục (chặn cả hai chiều, xem resolveCollisions), vào/ra bằng cửa (GATES). Bố cục bàn dùng chung
 * giữa hình ảnh (podium.ts) và va chạm: hai dãy năm bàn hình cung đối diện nhau (phía +x và −x) và bệ cúp ở giữa.
 */
export const PODIUM_LAYOUT = { chairR: 7.5, deskR: 8.5, panelR: 10.1, stationStep: 0.23, sideAngles: [Math.PI / 2, -Math.PI / 2], pedestal: 1.55, deskHalfW: 0.85, deskHalfD: 0.5 }
export const PODIUM_STATIONS = PODIUM_LAYOUT.sideAngles.flatMap((side, s) => Array.from({ length: 5 }, (_, i) => ({ angle: side + (i - 2) * PODIUM_LAYOUT.stationStep, side: s })))
const PODIUM_FURNITURE = [
  ...PODIUM_STATIONS.map((st) => ({ x: Math.sin(st.angle) * PODIUM_LAYOUT.deskR, y: 0.4, z: Math.cos(st.angle) * PODIUM_LAYOUT.deskR, angle: st.angle, hw: PODIUM_LAYOUT.deskHalfW, hd: PODIUM_LAYOUT.deskHalfD })),
  { x: 0, y: 1, z: 0, angle: 0, hw: PODIUM_LAYOUT.pedestal, hd: PODIUM_LAYOUT.pedestal }, // bệ cúp
]

/**
 * Cửa vào các khu đặc biệt: người chơi KHÔNG đi bộ vào được (có tường / vành chặn), phải đứng gần cửa rồi bấm E; server dịch chuyển qua cửa.
 * Mỗi cửa có hai đầu: `outside` (phía ngoài, ra) và `inside` (phía trong); `heading` là hướng mặt sau khi tới đó.
 * Bấm E trong tầm `GATE_RANGE` của đầu nào thì sang đầu kia.
 */
export const GATE_RANGE = 2
export const GATES = [
  { id: 'podium', label: 'Sân thi đấu', outside: { x: 0, z: PODIUM_RADIUS + 1.7, heading: 0 }, inside: { x: 0, z: PODIUM_RADIUS - 1.7, heading: Math.PI } },
  { id: 'lounge', label: 'Phòng chờ', outside: { x: 0, z: LOUNGE.zone.z0 - 1.8, heading: Math.PI }, inside: { x: 0, z: LOUNGE.zone.z0 + 1.9, heading: 0 } },
]

/**
 * Ghế trên khán đài: mỗi băng ghế ngồi được 3 người (cách nhau 0,7 m dọc băng), quay mặt vào giữa sân. `y` là độ cao bậc.
 * Chỉ số nối tiếp ghế phòng chờ.
 */
export const STAND_SEATS_PER_BENCH = [-0.7, 0, 0.7]
export const STAND_SEAT_EXIT = 1.2

export const STAND_SEATS = STAND_BENCHES.flatMap((b) =>
  STAND_SEATS_PER_BENCH.map((t) => {
    const heading = b.angle + Math.PI
    const x = b.x + Math.cos(b.angle) * t
    const z = b.z - Math.sin(b.angle) * t
    return { x, z, y: floorHeight(b.x, b.z), heading, zone: 'stand', exit: { x: x + Math.sin(heading) * STAND_SEAT_EXIT, z: z + Math.cos(heading) * STAND_SEAT_EXIT } }
  }),
).map((seat, i) => ({ ...seat, bench: HALL_SEATS.length + LOUNGE_SEATS.length + i }))
/** Mọi ghế ngồi được (hội trường, phòng chờ, rồi khán đài); `bench` là chỉ số trong mảng này, dùng trong giao thức `sit`/`seat`. */
export const SEATS = [...HALL_SEATS, ...LOUNGE_SEATS, ...STAND_SEATS]

/** Mọi vật cản dạng ghế/hộp (góc quay quanh trục Y): băng ghế khán đài + tường chắn + ghế hội trường (góc 0). */
export const BENCH_OBSTACLES = [
  ...STAND_BENCHES,
  ...STAND_WALLS,
  ...HALL_BENCHES.map((b) => ({ x: b.x, y: BENCH.height / 2, z: b.z, angle: 0, hw: BENCH_HALF_W, hd: BENCH_HALF_D })),
  ...LOUNGE_SOFAS.map((sofa) => ({ x: sofa.x, y: SOFA.height / 2, z: sofa.z, angle: sofa.angle, hw: sofa.length / 2, hd: SOFA.depth / 2 })),
  { x: LOUNGE_TABLE.x, y: LOUNGE_TABLE.height / 2, z: LOUNGE_TABLE.z, angle: LOUNGE_TABLE.angle, hw: LOUNGE_TABLE.hw, hd: LOUNGE_TABLE.hd },
  { x: LOUNGE_SCREEN.x, y: 1.5, z: LOUNGE_SCREEN.z, angle: 0, hw: LOUNGE_SCREEN.halfW, hd: LOUNGE_SCREEN.halfD },
  ...LOUNGE_WALLS.map((w) => ({ ...w, y: LOUNGE_WALL_HEIGHT / 2 })),
  ...PODIUM_FURNITURE,
]

// Băm không gian ô 3×3 để chỉ xét ghế ở ô hiện tại (mỗi ghế được thêm vào mọi ô nó có thể chạm tới).
const CELL = 3
const key = (cx, cz) => cx * 1000 + cz
const GRID = new Map()
{
  for (const b of BENCH_OBSTACLES) {
    const reach = Math.hypot(b.hw, b.hd) + PLAYER_RADIUS // hộp xoay: lấy nửa đường chéo để ô băm chắc chắn phủ hết
    for (let cx = Math.floor((b.x - reach) / CELL); cx <= Math.floor((b.x + reach) / CELL); cx += 1) {
      for (let cz = Math.floor((b.z - reach) / CELL); cz <= Math.floor((b.z + reach) / CELL); cz += 1) {
        const k = key(cx, cz)
        const list = GRID.get(k)
        if (list) list.push(b)
        else GRID.set(k, [b])
      }
    }
  }
}

/**
 * Đẩy người chơi (hình tròn bán kính PLAYER_RADIUS) ra khỏi hộp chữ nhật tâm (cx, cz) quay `angle`, nửa rộng halfW, nửa sâu halfD.
 * Sửa p.x, p.z tại chỗ.
 */
export function pushOutOfBox(p, cx, cz, angle, halfW, halfD) {
  const dx = p.x - cx
  const dz = p.z - cz
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const u = dx * c - dz * s // toạ độ trong hệ của hộp
  const d = dx * s + dz * c
  const nu = Math.max(-halfW, Math.min(halfW, u)) // điểm gần nhất trên hộp
  const nd = Math.max(-halfD, Math.min(halfD, d))
  const gu = u - nu
  const gd = d - nd
  const gap = Math.hypot(gu, gd)
  if (gap >= PLAYER_RADIUS) return
  let m
  let h
  if (gap < 1e-5) {
    // tâm nằm trong hộp: đẩy ra theo cạnh gần nhất
    if (halfW - Math.abs(u) < halfD - Math.abs(d)) {
      m = (Math.sign(u) || 1) * (halfW + PLAYER_RADIUS)
      h = d
    } else {
      m = u
      h = (Math.sign(d) || 1) * (halfD + PLAYER_RADIUS)
    }
  } else {
    const k = PLAYER_RADIUS / gap
    m = nu + gu * k
    h = nd + gd * k
  }
  p.x = cx + m * c + h * s
  p.z = cz - m * s + h * c
}

/**
 * Vành bục thi đấu là một "bức tường" hình tròn: không băng qua được theo chiều nào. Ở trong thì bị giữ ở trong (cách vành ít nhất bán kính người),
 * ở ngoài thì giữ ở ngoài. Người chơi chỉ sang bên kia bằng cửa (GATES, server dịch chuyển).
 */
function keepOffRim(p) {
  const r = Math.hypot(p.x, p.z)
  const gap = r - PODIUM_RADIUS
  if (Math.abs(gap) >= PLAYER_RADIUS || r < 1e-5) return
  const target = PODIUM_RADIUS + (gap >= 0 ? PLAYER_RADIUS : -PLAYER_RADIUS)
  p.x *= target / r
  p.z *= target / r
}

/** Giữ người chơi trong thế giới: vòng đi bộ, bục thi đấu giữa sân, sân khấu hội trường, ghế hội trường. */
export function resolveCollisions(p) {
  let r = Math.hypot(p.x, p.z)
  if (r > WALK_RADIUS) {
    p.x *= WALK_RADIUS / r
    p.z *= WALK_RADIUS / r
    r = WALK_RADIUS
  }
  keepOffRim(p)
  pushOutOfBox(p, 0, STAGE.z, 0, STAGE.halfW, STAGE.halfD)
  // Hộp (ghế, tường) rồi kẹp lại vòng đi bộ: lực đẩy của hộp sát mép ngoài có thể đẩy ra quá vòng, và kẹp vòng có thể ép lại vào hộp.
  // Lặp vài lượt cho hai ràng buộc hội tụ ở góc giữa tường và mép ngoài.
  for (let pass = 0; pass < 4; pass += 1) {
    const near = GRID.get(key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)))
    if (near) for (const b of near) pushOutOfBox(p, b.x, b.z, b.angle, b.hw, b.hd)
    keepOffRim(p)
    const last = Math.hypot(p.x, p.z)
    if (last > WALK_RADIUS) {
      p.x *= WALK_RADIUS / last
      p.z *= WALK_RADIUS / last
    } else if (pass > 0 && !near) break
  }
}

export const wrapAngle = wrap

export function makeBody(x, z, heading = 0) {
  return { x, y: floorHeight(x, z), z, vx: 0, vz: 0, heading }
}
export function copyBody(to, from) {
  to.x = from.x
  to.y = from.y
  to.z = from.z
  to.vx = from.vx
  to.vz = from.vz
  to.heading = from.heading
}

/**
 * Một bước mô phỏng của một người: tăng tốc về vận tốc mong muốn, đi từng đoạn nhỏ có va chạm, vận tốc lấy từ quãng đường thực đi,
 * mặt đất mượt theo bậc thang, hướng quay dần về hướng đang đi.
 * @param {{x:number,y:number,z:number,vx:number,vz:number,heading:number}} body
 * @param {{mx:number,mz:number}} input hướng muốn đi (độ dài ≤ 1)
 */
export function stepBody(body, input, dt = SIM_DT) {
  let mx = Number.isFinite(input.mx) ? input.mx : 0
  let mz = Number.isFinite(input.mz) ? input.mz : 0
  const length = Math.hypot(mx, mz)
  if (length > 1) {
    mx /= length
    mz /= length
  }
  const blend = Math.min(1, ACCEL * dt)
  body.vx += (mx * MOVE_SPEED - body.vx) * blend
  body.vz += (mz * MOVE_SPEED - body.vz) * blend
  if (length === 0 && body.vx * body.vx + body.vz * body.vz < 0.01) {
    body.vx = 0
    body.vz = 0
  }
  const startX = body.x
  const startZ = body.z
  const travel = Math.hypot(body.vx, body.vz) * dt
  const parts = Math.max(1, Math.ceil(travel / MAX_SUBSTEP))
  const p = { x: body.x, z: body.z }
  for (let i = 0; i < parts; i += 1) {
    p.x += (body.vx * dt) / parts
    p.z += (body.vz * dt) / parts
    resolveCollisions(p)
  }
  body.x = p.x
  body.z = p.z
  body.vx = (body.x - startX) / dt
  body.vz = (body.z - startZ) / dt
  body.y += (floorHeight(body.x, body.z) - body.y) * Math.min(1, dt * 14)
  const dx = body.x - startX
  const dz = body.z - startZ
  if (dx * dx + dz * dz > 1e-5) {
    const delta = wrap(Math.atan2(dx, dz) - body.heading)
    body.heading = wrap(body.heading + delta * Math.min(1, TURN_RATE * dt))
  }
}

/** Điểm (x, z) có nằm trong hội trường đá không. */
export const inHall = (x, z) => x >= HALL.zone.x0 && x <= HALL.zone.x1 && z >= HALL.zone.z0 && z <= HALL.zone.z1
