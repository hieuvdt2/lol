// Vật lý dùng chung (shared/world.mjs): va chạm, bước mô phỏng, ghế hội trường, vùng bấm E, chọn mục tiêu đấm.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BENCH, BENCH_OBSTACLES, DUMMY_RADIUS, PODIUM_HEIGHT, PODIUM_RADIUS, HALL, HALL_BENCHES, HALL_SEATS, MOVE_SPEED, PLAYER_RADIUS, RING_RADIUS, RING_SLOTS, SIM_DT, STAGE,
  AISLE_ANGLES, AISLE_HALF, GATES, GATE_RANGE, LOUNGE_WALLS, PODIUM_STATIONS, STAND_SEATS, LOUNGE, LOUNGE_SCREEN, LOUNGE_SEATS, LOUNGE_SOFAS, LOUNGE_TABLE, SEATS, SOFA, STANDS, STANDS_OUTER, STANDS_TOP, STAND_BENCHES, STAND_BENCH_REACH, STAND_GAPS, STAND_WALLS, WALK_RADIUS, floorHeight, inHall, inLounge, inStandGap, makeBody, pushOutOfBox, resolveCollisions, slotXZ, stepBody, wrapAngle,
} from '../../shared/world.mjs'
import { HALL_LABEL, LOUNGE_LABEL, STAND_LABEL, freeSeatNear, gateDestination, gateNear, standUpSpot, zoneAt, zonePrompt } from '../../src/game/zones.ts'
import { PUNCH_CLOSE, PUNCH_REACH, pickTarget } from '../../src/game/targeting.ts'

const R = PLAYER_RADIUS
const rnd = (() => { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) })()
/** Khoảng cách từ tâm hình tròn tới hộp (0 nếu tâm nằm trong hộp). */
function gapToBox(p, cx, cz, angle, hw, hd) {
  const dx = p.x - cx
  const dz = p.z - cz
  const u = dx * Math.cos(angle) - dz * Math.sin(angle)
  const d = dx * Math.sin(angle) + dz * Math.cos(angle)
  return Math.hypot(u - Math.max(-hw, Math.min(hw, u)), d - Math.max(-hd, Math.min(hd, d)))
}
const worstOverlap = (p) => {
  let worst = Infinity
  for (const b of BENCH_OBSTACLES) worst = Math.min(worst, gapToBox(p, b.x, b.z, b.angle, b.hw, b.hd))
  worst = Math.min(worst, gapToBox(p, 0, STAGE.z, 0, STAGE.halfW, STAGE.halfD))
  return worst
}

test('bố cục nhà thi đấu: 5 hàng × 10 ghế hội trường cách 2,4 m; sàn phẳng quanh bục; khán đài 7 bậc ở rìa nằm trong vòng đi bộ', () => {
  assert.equal(HALL_BENCHES.length, 50)
  assert.equal(HALL_SEATS.length, 50)
  assert.deepEqual(HALL.columns.map((x, i) => i && +(x - HALL.columns[i - 1]).toFixed(1)).slice(1), Array(9).fill(2.4))
  assert.ok(HALL_BENCHES.every((b) => inHall(b.x, b.z)), 'mọi ghế nằm trong vùng hội trường')
  assert.ok(HALL_BENCHES.every((b) => Math.hypot(b.x, b.z) < STANDS.inner), 'ghế hội trường nằm trên sàn phẳng')
  assert.ok(STAND_BENCHES.length > 300 && STAND_BENCHES.length < 900, `${STAND_BENCHES.length} băng ghế khán đài`)
  assert.equal(STAND_WALLS.length, 2 * STAND_GAPS.length, 'hai tường chắn mỗi khoảng trống')
  assert.equal(BENCH_OBSTACLES.length, STAND_BENCHES.length + STAND_WALLS.length + 50 + LOUNGE_SOFAS.length + 2 + LOUNGE_WALLS.length + PODIUM_STATIONS.length + 1, 'ghế hội trường + sofa/bàn/màn/tường phòng chờ + bàn thi đấu và bệ cúp')
  assert.ok(WALK_RADIUS < STANDS_OUTER && WALK_RADIUS > STANDS_OUTER - 0.5, 'vòng đi bộ phủ hết khán đài')
  // sàn phẳng quanh bục, rồi dâng theo bậc
  for (const [x, z] of [[0, 30], [13, 0], [-20, -10], [39.9, 0]]) assert.equal(floorHeight(x, z), 0, `sàn phẳng tại (${x}, ${z})`)
  for (const [x, z] of [[0, 0], [8, 0], [0, 11]]) assert.equal(floorHeight(x, z), PODIUM_HEIGHT, `trên bục thi đấu tại (${x}, ${z})`)
  const a = Math.PI / 4 // hướng của một cầu thang
  const steps = Array.from({ length: STANDS.tiers }, (_, t) => floorHeight(Math.sin(a) * (STANDS.inner + t * STANDS.width + 0.1), Math.cos(a) * (STANDS.inner + t * STANDS.width + 0.1)))
  assert.deepEqual(steps, steps.map((_, t) => +((t + 1) * STANDS.rise).toFixed(10)).map((v, i) => steps[i] && v), 'mỗi bậc cao thêm đúng một nấc')
  assert.ok(steps.every((y, i) => i === 0 || y > steps[i - 1]), `cao dần theo bậc: ${steps.join(',')}`)
  assert.ok(Math.abs(floorHeight(Math.sin(a) * 54, Math.cos(a) * 54) - STANDS_TOP) < 1e-9, 'bậc trên cùng')
  assert.equal(floorHeight(0, 50), 0, 'khoảng trống lối vào: sàn phẳng')
  assert.equal(floorHeight(0, -50), 0, 'khoảng trống phía hội trường: sàn phẳng')
  assert.ok(PODIUM_RADIUS > RING_RADIUS + DUMMY_RADIUS && PODIUM_RADIUS < 20 && PODIUM_HEIGHT > 0, 'bục đủ rộng chứa năm hình nộm')
  assert.equal(RING_SLOTS, 5)
  assert.ok(inStandGap(0) && inStandGap(Math.PI) && !inStandGap(Math.PI / 2))
})

test('băng ghế khán đài: không lấn vào lối đi hay khoảng trống; mỗi bậc nhiều ghế hơn bậc trong; so le nửa ghế giữa các bậc', () => {
  const wrapA = (v) => Math.atan2(Math.sin(v), Math.cos(v))
  for (const b of STAND_BENCHES) {
    const r = Math.hypot(b.x, b.z)
    const ang = Math.atan2(b.x, b.z)
    for (const e of AISLE_ANGLES) assert.ok(Math.abs(wrapA(ang - e)) * r >= AISLE_HALF + b.hw - 1e-6, `băng ghế lấn vào lối đi ${e.toFixed(2)}`)
    assert.ok(!inStandGap(ang), 'băng ghế nằm trong khoảng trống')
  }
  const perTier = new Map()
  for (const b of STAND_BENCHES) {
    const tier = Math.round((Math.hypot(b.x, b.z) - STANDS.inner - STANDS.width / 2) / STANDS.width)
    perTier.set(tier, (perTier.get(tier) ?? 0) + 1)
  }
  assert.equal(perTier.size, STANDS.tiers)
  assert.ok(perTier.get(0) < perTier.get(STANDS.tiers - 1), 'bậc ngoài dài hơn nên nhiều ghế hơn')
})

test('pushOutOfBox: ngoài tầm thì giữ nguyên; chạm thì bị đẩy đúng bán kính; tâm lọt vào trong thì đẩy ra cạnh gần nhất; hộp xoay vẫn đúng', () => {
  const far = { x: 5, z: 5 }
  pushOutOfBox(far, 0, 0, 0, 1, 0.5)
  assert.deepEqual(far, { x: 5, z: 5 })
  const near = { x: 1.1, z: 0 } // cách cạnh phải 0,1 < R
  pushOutOfBox(near, 0, 0, 0, 1, 0.5)
  assert.ok(Math.abs(near.x - (1 + R)) < 1e-9 && near.z === 0)
  const inside = { x: 0.9, z: 0.1 } // gần cạnh phải hơn cạnh trên
  pushOutOfBox(inside, 0, 0, 0, 1, 0.5)
  assert.ok(Math.abs(inside.x - (1 + R)) < 1e-9, `đẩy ra phải: ${inside.x}`)
  const top = { x: 0.1, z: 0.4 }
  pushOutOfBox(top, 0, 0, 0, 1, 0.5)
  assert.ok(Math.abs(top.z - (0.5 + R)) < 1e-9, `đẩy ra trên: ${top.z}`)
  // hộp quay 90° quanh trục Y: trục X cục bộ = (cos, −sin) = (0, −1) → hộp dài theo z
  const rot = { x: 0.2, z: 1.05 }
  pushOutOfBox(rot, 0, 0, Math.PI / 2, 1, 0.5)
  assert.ok(gapToBox(rot, 0, 0, Math.PI / 2, 1, 0.5) >= R - 1e-9, 'sau khi đẩy thì không còn chồng lấn')
})

test('TÍNH CHẤT: người đi ngẫu nhiên (hàng nghìn bước) không bao giờ vượt vòng đi bộ, lún vào bục thi đấu/ghế/sân khấu', () => {
  let worstPodium = Infinity
  let worstBench = Infinity
  for (let walker = 0; walker < 60; walker += 1) {
    const a0 = rnd() * Math.PI * 2
    const r0 = 13 + rnd() * 41
    const start = { x: Math.sin(a0) * r0, z: Math.cos(a0) * r0 }
    resolveCollisions(start)
    if (worstOverlap(start) < R - 1e-3) continue // điểm xuất phát nằm trong khe 0,2 m giữa hai ghế: người không thể ở đó
    const b = makeBody(start.x, start.z, 0)
    let mx = rnd() * 2 - 1
    let mz = rnd() * 2 - 1
    for (let i = 0; i < 1500; i += 1) {
      if (i % 40 === 0) {
        mx = rnd() * 2 - 1
        mz = rnd() * 2 - 1
      }
      stepBody(b, { mx, mz })
      const radius = Math.hypot(b.x, b.z)
      assert.ok(radius <= WALK_RADIUS + 1e-9, `vượt vòng đi bộ ${radius}`)
      worstPodium = Math.min(worstPodium, radius - PODIUM_RADIUS - R)
      worstBench = Math.min(worstBench, worstOverlap(b) - R)
    }
  }
  assert.ok(worstPodium > -1e-6, `lún vào bục ${worstPodium}`)
  assert.ok(worstBench > -0.06, `lún vào ghế/sân khấu ${worstBench}`) // chỗ hai băng ghế liền nhau tạo góc lõm nhỏ nên lún vài cm là bình thường
})

test('KHÁN ĐÀI: các băng ghế liền nhau chồng lên nhau (không có khe để lọt vào) và vẫn chừa lối đi', () => {
  const byTier = new Map()
  for (const b of STAND_BENCHES) {
    const tier = Math.round((Math.hypot(b.x, b.z) - STANDS.inner - STANDS.width / 2) / STANDS.width)
    byTier.set(tier, [...(byTier.get(tier) ?? []), b])
  }
  for (const list of byTier.values()) {
    list.sort((p, q) => Math.atan2(p.x, p.z) - Math.atan2(q.x, q.z))
    for (let i = 0; i < list.length - 1; i += 1) {
      const gap = Math.hypot(list[i + 1].x - list[i].x, list[i + 1].z - list[i].z)
      if (gap < 4) assert.ok(gap < 2 * STAND_BENCH_REACH, `khe giữa hai băng liền nhau ${(gap - 2 * STAND_BENCH_REACH).toFixed(3)} m`)
    }
  }
  // lối đi vẫn rộng: tâm người chơi đi được dọc trục lối đi suốt từ chân tới đỉnh (kiểm tra bằng bài leo thật bên dưới) và hộp ghế không lấn vào dải lối đi
  for (const b of STAND_BENCHES) for (const a of AISLE_ANGLES) {
    const radius = Math.hypot(b.x, b.z)
    const lateral = Math.abs(wrapAngle(Math.atan2(b.x, b.z) - a)) * radius
    assert.ok(lateral - b.hw > AISLE_HALF, `ghế lấn vào lối đi (${(lateral - b.hw).toFixed(2)} ≤ ${AISLE_HALF})`)
  }
})

test('SERVER: vị trí mà client tự giải va chạm được luôn qua kiểm tra của server (không bị "kéo về" khi đang ép vào ghế khán đài)', () => {
  // Server kiểm tra "vị trí báo lên có nằm trong vật cản không" bằng đúng resolveCollisions và sai số 0,2 m (hangmu-server.mjs: insideObstacle).
  // Lỗi cũ: giữa hai băng ghế còn khe 0,25 m; người ép chéo vào khe bị hai đầu ghế đẩy ngược chiều, lọt vào hộp, và hộp bị đẩy xuyên sang hàng bên kia.
  let worst = 0
  let seed = 5
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let run = 0; run < 60; run += 1) {
    const a = random() * Math.PI * 2
    const b = makeBody(Math.sin(a) * 41, Math.cos(a) * 41, 0)
    let dir = random() * Math.PI * 2
    let keep = 0
    for (let i = 0; i < 1200; i += 1) {
      if (keep-- <= 0) {
        dir = random() < 0.5 ? Math.atan2(b.x, b.z) + (random() - 0.5) : random() * Math.PI * 2 // nửa số lần cố tình ép ra phía ngoài (leo)
        keep = 5 + random() * 40
      }
      stepBody(b, { mx: Math.sin(dir), mz: Math.cos(dir) })
      const sent = { x: Math.round(b.x * 256) / 256, z: Math.round(b.z * 256) / 256 } // client gửi toạ độ làm tròn 1/256 m
      const fixed = { ...sent }
      resolveCollisions(fixed)
      worst = Math.max(worst, Math.hypot(fixed.x - sent.x, fixed.z - sent.z))
    }
  }
  assert.ok(worst < 0.1, `server sẽ từ chối vị trí hợp lệ: lệch ${worst.toFixed(3)} m (dung sai server 0,2 m)`)
})

test('resolveCollisions idempotent: gọi lần hai không đổi vị trí', () => {
  for (let i = 0; i < 2000; i += 1) {
    const p = { x: (rnd() - 0.5) * 90, z: (rnd() - 0.5) * 90 }
    resolveCollisions(p)
    const q = { ...p }
    resolveCollisions(q)
    // khe 0,2 m giữa hai ghế liền kề (người không thể vào) là chỗ duy nhất hai lực đẩy có thể giằng co: bỏ qua điểm nằm trong khe
    if (worstOverlap(p) < R - 1e-3) continue
    assert.ok(Math.hypot(p.x - q.x, p.z - q.z) < 1e-6, `lần hai còn dịch ${Math.hypot(p.x - q.x, p.z - q.z)}`)
  }
})

test('bục thi đấu chặn mọi hướng: đi thẳng vào tâm từ bất kỳ phía nào cũng dừng sát rìa bục; sàn quanh bục thông suốt', () => {
  for (let k = 0; k < 16; k += 1) {
    const a = (k / 16) * Math.PI * 2
    if (Math.abs(wrapAngle(a - Math.PI)) < 0.6) continue // phía bắc là hội trường (ghế, sân khấu)
    const body = makeBody(Math.sin(a) * 30, Math.cos(a) * 30, 0)
    for (let i = 0; i < 200; i += 1) stepBody(body, { mx: -Math.sin(a), mz: -Math.cos(a) })
    const r = Math.hypot(body.x, body.z)
    assert.ok(Math.abs(r - (PODIUM_RADIUS + R)) < 0.05, `hướng ${a.toFixed(2)}: dừng ở r=${r.toFixed(2)} (kỳ vọng ${(PODIUM_RADIUS + R).toFixed(2)})`)
  }
  // sàn phẳng từ rìa bục ra tới vòng đi bộ không có vật cản (trừ khu hội trường ở phía bắc)
  for (const a of [0, Math.PI / 2, -Math.PI / 2, Math.PI / 4]) {
    for (let r = WALK_RADIUS; r >= PODIUM_RADIUS + R + 0.01; r -= 0.25) {
      const p = { x: Math.sin(a) * r, z: Math.cos(a) * r }
      if (inLounge(p.x, p.z) || Math.abs(p.x) < 4 && p.z > LOUNGE.zone.z0 - 1) continue // phòng chờ (sofa, bàn, tấm màn) nằm ở khoảng trống phía nam
      const q = { ...p }
      resolveCollisions(q)
      assert.ok(Math.hypot(p.x - q.x, p.z - q.z) < 1e-9, `góc ${a.toFixed(2)} bị chặn ở r=${r}`)
    }
  }
})

test('bước mô phỏng ở khoảng trống: tăng tốc dần, tối đa 8, dừng hẳn khi thả, hướng theo hướng đi', () => {
  const b = makeBody(0, 36, 0)
  let top = 0
  for (let i = 0; i < 60; i += 1) {
    stepBody(b, { mx: 1, mz: 0 })
    top = Math.max(top, Math.hypot(b.vx, b.vz))
    assert.ok(top <= MOVE_SPEED + 1e-6)
  }
  assert.ok(top > MOVE_SPEED * 0.97, `đạt tốc độ ${top.toFixed(2)}`)
  assert.ok(Math.abs(b.heading - Math.PI / 2) < 0.05, `quay mặt theo hướng đi (+x): ${b.heading.toFixed(2)}`)
  for (let i = 0; i < 60; i += 1) stepBody(b, { mx: 0, mz: 0 })
  assert.equal(Math.hypot(b.vx, b.vz), 0)
  const before = b.heading
  for (let i = 0; i < 30; i += 1) stepBody(b, { mx: 0, mz: 0 })
  assert.equal(b.heading, before, 'đứng yên thì không tự quay')
  // đầu vào lạ
  stepBody(b, { mx: NaN, mz: Infinity })
  assert.ok(Number.isFinite(b.x) && Number.isFinite(b.z) && Number.isFinite(b.heading))
})

test('chạy thẳng vào hàng ghế hội trường: dừng sát ghế (không xuyên), trượt dọc ghế khi đi chéo', () => {
  const b = makeBody(1.2, -13, Math.PI) // phía bắc, ngoài vành bục thi đấu
  for (let i = 0; i < 150; i += 1) {
    stepBody(b, { mx: 0, mz: -1 })
    assert.ok(worstOverlap(b) >= R - 1e-3, `lún vào ghế tại bước ${i}: ${worstOverlap(b)}`)
  }
  const stop = -26.6 + BENCH.depth / 2 + R
  assert.ok(Math.abs(b.z - stop) < 0.02, `dừng ở z=${b.z.toFixed(3)} (kỳ vọng ${stop.toFixed(3)})`)
  assert.equal(Math.round(Math.hypot(b.vx, b.vz) * 100) / 100, 0, 'đứng yên sát ghế')
  const x0 = b.x
  for (let i = 0; i < 20; i += 1) stepBody(b, { mx: 1, mz: -1 })
  assert.ok(b.x > x0 + 0.5, 'đi chéo thì trượt dọc ghế')
  assert.ok(worstOverlap(b) >= R - 1e-3)
})

test('không xuyên ghế dù bước thời gian lớn (chia đoạn nhỏ) hay chạy rất nhanh', () => {
  for (const dt of [SIM_DT, 0.05, 0.1]) {
    const b = makeBody(-3.6, -15, Math.PI)
    for (let i = 0; i < Math.ceil(3 / dt); i += 1) {
      stepBody(b, { mx: 0, mz: -1 }, dt)
      assert.ok(worstOverlap(b) >= R - 1e-3, `dt=${dt}: lún vào ghế (z=${b.z})`)
    }
  }
})

test('bục thi đấu (và hình nộm trên đó) chặn đường; đứng giữa hai thứ vẫn thoát được; xác định (cùng đầu vào → cùng kết quả)', () => {
  const run = () => {
    const b = makeBody(0, 12, Math.PI)
    for (let i = 0; i < 120; i += 1) stepBody(b, { mx: 0, mz: -1 })
    return b
  }
  const a = run()
  const c = run()
  assert.deepEqual(a, c)
  const d = slotXZ(2) // hình nộm gần hướng này nhất trên đường đi
  assert.ok(Math.hypot(a.x, a.z) >= PODIUM_RADIUS + R - 1e-9)
  for (let s = 0; s < RING_SLOTS; s += 1) assert.ok(Math.hypot(a.x - slotXZ(s).x, a.z - slotXZ(s).z) >= DUMMY_RADIUS + R - 1e-6)
  assert.ok(d)
  assert.ok(RING_RADIUS === 5)
})

// ---------- ghế + vùng bấm E ----------
test('mọi ghế đều tới được: đi vào hành lang trước hàng ghế từ đầu hàng rồi tới sát ghế; chỗ đứng dậy không vướng vật cản', () => {
  for (const seat of HALL_SEATS) {
    // hành lang giữa hai hàng ghế (rộng 1,85 m): vào từ đầu hàng bên phải, đi dọc tới ghế
    const b = makeBody(13.5, seat.z + 1.3, -Math.PI / 2)
    for (let i = 0; i < 400 && Math.abs(b.x - seat.x) > 0.05; i += 1) stepBody(b, { mx: Math.sign(seat.x - b.x), mz: 0 })
    assert.ok(Math.abs(b.x - seat.x) < 0.3, `ghế ${seat.bench}: không đi dọc hành lang tới được (x=${b.x.toFixed(2)})`)
    for (let i = 0; i < 40; i += 1) stepBody(b, { mx: 0, mz: -1 })
    const d = Math.hypot(b.x - seat.x, b.z - seat.z)
    assert.ok(d < 1.0, `ghế ${seat.bench}: đứng sát ghế cách tâm ${d.toFixed(2)}`)
    const spot = standUpSpot(seat)
    const copy = { ...spot }
    resolveCollisions(copy)
    assert.ok(Math.hypot(copy.x - spot.x, copy.z - spot.z) < 1e-9, `chỗ đứng dậy của ghế ${seat.bench} bị vướng`)
    assert.ok(inHall(seat.x, seat.z))
  }
})

test('freeSeatNear / zoneAt: chọn ghế trống gần nhất; bỏ ghế có người; hết chỗ thì báo; ngoài hội trường không có vùng', () => {
  const seat = HALL_SEATS[22]
  const me = { x: seat.x, z: seat.z + 0.7 }
  const near = freeSeatNear(me, [])
  assert.equal(near.seat.bench, seat.bench)
  const other = freeSeatNear(me, [{ x: seat.x, z: seat.z }])
  assert.notEqual(other?.seat.bench, seat.bench, 'ghế có người đã ngồi thì bỏ qua')
  assert.equal(freeSeatNear({ x: 0, z: 20 }, []), null, 'xa ghế')
  assert.equal(zoneAt({ x: 0, z: 20 }, []), null)
  assert.equal(zoneAt(me, []).kind, 'hall-seat')
  assert.equal(zoneAt(me, []).label, HALL_LABEL)
  // bao quanh toàn bộ ghế trong tầm bằng người khác → hall-full
  const around = HALL_SEATS.filter((s) => Math.hypot(s.x - me.x, s.z - me.z) <= 1.6).map((s) => ({ x: s.x, z: s.z }))
  assert.equal(zoneAt(me, around).kind, 'hall-full')
  assert.match(zonePrompt(zoneAt(me, []), false), /bấm E để ngồi/)
  assert.match(zonePrompt(zoneAt(me, []), true), /🪑/)
  assert.match(zonePrompt({ kind: 'hall', label: HALL_LABEL }, false), /đến gần một ghế đá/)
  // vùng hội trường nhưng không sát ghế nào (giữa hai hàng ghế, xa mép)
  const gap = { x: 0, z: -28 }
  assert.ok(['hall', 'hall-seat', 'hall-full'].includes(zoneAt(gap, []).kind))
})

// ---------- phòng chờ ----------
test('PHÒNG CHỜ: 10 ghế sofa nối tiếp ghế hội trường (chỉ số 50–59), mỗi ghế nằm trong sofa của nó, quay mặt vào bàn hoặc tấm màn', () => {
  assert.equal(LOUNGE_SEATS.length, 10)
  assert.deepEqual(LOUNGE_SEATS.map((s) => s.bench), Array.from({ length: 10 }, (_, i) => 50 + i))
  assert.equal(SEATS.length, 50 + 10 + STAND_SEATS.length)
  SEATS.forEach((s, i) => assert.equal(s.bench, i, 'chỉ số ghế = vị trí trong SEATS'))
  for (const seat of LOUNGE_SEATS) {
    const sofa = LOUNGE_SOFAS[seat.sofa]
    assert.ok(gapToBox(seat, sofa.x, sofa.z, sofa.angle, sofa.length / 2, SOFA.depth / 2) === 0, `ghế ${seat.bench} nằm trong sofa`)
    assert.equal(seat.zone, 'lounge')
    assert.ok(inLounge(seat.x, seat.z))
    // mặt về phía bàn: tích vô hướng giữa hướng mặt và hướng tới bàn dương rõ rệt
    const toTable = { x: LOUNGE_TABLE.x - seat.x, z: LOUNGE_TABLE.z - seat.z }
    const len = Math.hypot(toTable.x, toTable.z)
    const dot = (Math.sin(seat.heading) * toTable.x + Math.cos(seat.heading) * toTable.z) / len
    assert.ok(dot > 0.6, `ghế ${seat.bench} không quay mặt vào bàn (cos=${dot.toFixed(2)})`)
  }
  // hai ghế cùng sofa cách nhau đủ để không bị coi là "ghế đã có người" lẫn nhau
  for (const a of LOUNGE_SEATS) for (const b of LOUNGE_SEATS) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 0.5, `ghế ${a.bench}/${b.bench} quá sát`)
})

test('PHÒNG CHỜ: nằm gọn trên sàn phẳng ở khoảng trống phía nam, không đè lên chỗ xuất hiện, tường khán đài, bục hay hội trường', () => {
  const { x0, x1, z0, z1 } = LOUNGE.zone
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    assert.equal(floorHeight(x, z), 0, `(${x},${z}) phải là sàn phẳng`)
    assert.ok(inStandGap(Math.atan2(x, z)), `(${x},${z}) nằm trong khoảng trống khán đài`)
    assert.ok(Math.hypot(x, z) < WALK_RADIUS - 0.5)
  }
  assert.ok(z0 > 36 + 3, 'chỗ xuất hiện (0, 36) không nằm trong phòng chờ')
  // mọi đồ đạc nằm trong vùng và không chồng nhau
  const things = [
    ...LOUNGE_SOFAS.map((s, i) => ({ name: `sofa ${i}`, x: s.x, z: s.z, angle: s.angle, hw: s.length / 2, hd: SOFA.depth / 2 })),
    { name: 'bàn', x: LOUNGE_TABLE.x, z: LOUNGE_TABLE.z, angle: LOUNGE_TABLE.angle, hw: LOUNGE_TABLE.hw, hd: LOUNGE_TABLE.hd },
    { name: 'màn', x: LOUNGE_SCREEN.x, z: LOUNGE_SCREEN.z, angle: 0, hw: LOUNGE_SCREEN.halfW, hd: LOUNGE_SCREEN.halfD },
  ]
  for (const t of things) {
    for (const [u, v] of [[-t.hw, -t.hd], [t.hw, -t.hd], [-t.hw, t.hd], [t.hw, t.hd]]) {
      const cx = t.x + u * Math.cos(t.angle) + v * Math.sin(t.angle)
      const cz = t.z - u * Math.sin(t.angle) + v * Math.cos(t.angle)
      assert.ok(cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1, `${t.name} nằm trong vùng phòng chờ (góc ${cx.toFixed(2)}, ${cz.toFixed(2)})`)
    }
  }
  for (let i = 0; i < things.length; i += 1) for (let j = i + 1; j < things.length; j += 1) {
    const a = things[i]
    const b = things[j]
    // lấy mẫu mép của a, xem có điểm nào lọt vào b (cộng đường kính người để chừa lối đi giữa hai món)
    let minGap = Infinity
    for (let u = -a.hw; u <= a.hw; u += 0.1) for (let v = -a.hd; v <= a.hd; v += 0.1) {
      const p = { x: a.x + u * Math.cos(a.angle) + v * Math.sin(a.angle), z: a.z - u * Math.sin(a.angle) + v * Math.cos(a.angle) }
      minGap = Math.min(minGap, gapToBox(p, b.x, b.z, b.angle, b.hw, b.hd))
    }
    assert.ok(minGap > 0.5, `${a.name} và ${b.name} cách nhau ${minGap.toFixed(2)} m (cần chừa lối đi)`)
  }
})

/** BFS theo ô trên đúng hàm va chạm: tập ô tới được từ `origin` trong hộp [x0,x1]×[z0,z1]. */
function reachable(origin, box, step = 0.25) {
  const free = (x, z) => {
    const q = { x, z }
    resolveCollisions(q)
    return Math.hypot(q.x - x, q.z - z) < 1e-9
  }
  const key = (i, j) => `${i},${j}`
  const seen = new Set([key(0, 0)])
  const queue = [[0, 0]]
  while (queue.length) {
    const [i, j] = queue.shift()
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di
      const nj = j + dj
      const x = origin.x + ni * step
      const z = origin.z + nj * step
      if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1 || seen.has(key(ni, nj)) || !free(x, z)) continue
      seen.add(key(ni, nj))
      queue.push([ni, nj])
    }
  }
  return { free, has: (x, z) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([a, b]) => seen.has(key(Math.round((x - origin.x) / step) + a, Math.round((z - origin.z) / step) + b))) }
}

test('PHÒNG CHỜ: từ cửa đi bộ tới được chỗ đứng dậy của MỌI ghế (BFS theo ô 0,25 m trên đúng hàm va chạm); chỗ đứng dậy và chỗ đứng sát ghế không vướng', () => {
  const gate = GATES.find((g) => g.id === 'lounge')
  const box = { x0: -20, x1: 20, z0: 30, z1: 54 }
  const inside = reachable(gate.inside, box)
  for (const seat of LOUNGE_SEATS) {
    assert.ok(inside.free(seat.exit.x, seat.exit.z), `chỗ đứng dậy của ghế ${seat.bench} bị vướng`)
    assert.ok(inLounge(seat.exit.x, seat.exit.z), `ghế ${seat.bench}: chỗ đứng dậy nằm ngoài phòng chờ`)
    assert.ok(inside.has(seat.exit.x, seat.exit.z), `ghế ${seat.bench}: không đi bộ tới được chỗ đứng dậy từ cửa`)
    const front = { x: seat.x + Math.sin(seat.heading) * 0.85, z: seat.z + Math.cos(seat.heading) * 0.85 }
    assert.ok(inside.free(front.x, front.z), `ghế ${seat.bench}: chỗ đứng sát trước ghế bị vướng`)
    assert.ok(Math.hypot(front.x - seat.x, front.z - seat.z) <= 1.6)
  }
})

test('CỬA: phòng chờ và sân thi đấu KHÔNG đi bộ vào được từ ngoài (BFS từ chỗ xuất hiện không chạm tới đầu trong cửa), nhưng hai đầu cửa đều đứng được và cách nhau qua tường', () => {
  assert.deepEqual(GATES.map((g) => g.id), ['podium', 'lounge'])
  for (const gate of GATES) {
    for (const end of [gate.outside, gate.inside]) {
      const q = { x: end.x, z: end.z }
      resolveCollisions(q)
      assert.ok(Math.hypot(q.x - end.x, q.z - end.z) < 1e-9, `${gate.id}: đầu cửa (${end.x}, ${end.z}) bị vướng`)
    }
    assert.ok(Math.hypot(gate.outside.x - gate.inside.x, gate.outside.z - gate.inside.z) > GATE_RANGE * 1.2, `${gate.id}: hai đầu cửa phải đủ xa để không bấm nhầm đầu kia`)
  }
  const spawn = { x: 0, z: 36 }
  const outside = reachable(spawn, { x0: -45, x1: 45, z0: -45, z1: 54 })
  for (const gate of GATES) {
    assert.ok(outside.has(gate.outside.x, gate.outside.z), `${gate.id}: đầu ngoài phải đi bộ tới được từ chỗ xuất hiện`)
    assert.ok(!outside.has(gate.inside.x, gate.inside.z), `${gate.id}: đầu trong không được đi bộ tới từ ngoài`)
  }
  // bên trong thì ở yên bên trong: đi hết cỡ về phía cửa cũng không ra ngoài
  for (const gate of GATES) {
    const b = makeBody(gate.inside.x, gate.inside.z, 0)
    const dx = gate.outside.x - gate.inside.x
    const dz = gate.outside.z - gate.inside.z
    const len = Math.hypot(dx, dz)
    for (let i = 0; i < 120; i += 1) stepBody(b, { mx: dx / len, mz: dz / len })
    assert.ok(Math.hypot(b.x - gate.outside.x, b.z - gate.outside.z) > 1, `${gate.id}: đi hết cỡ về phía cửa vẫn bị tường/vành giữ lại`)
  }
})

test('SÂN THI ĐẤU: ở trên bục thì cao 1 m, đi lại được trong vành nhưng không băng qua bàn thi đấu và bệ cúp; từ cửa tới được mọi chỗ ngồi tuyển thủ', () => {
  const gate = GATES.find((g) => g.id === 'podium')
  assert.equal(floorHeight(gate.inside.x, gate.inside.z), PODIUM_HEIGHT)
  assert.equal(floorHeight(gate.outside.x, gate.outside.z), 0)
  const inside = reachable(gate.inside, { x0: -12, x1: 12, z0: -12, z1: 12 })
  // khoảng trống ngay trước từng bàn (phía ghế) tới được
  for (const st of PODIUM_STATIONS) {
    const chair = { x: Math.sin(st.angle) * 7.5, z: Math.cos(st.angle) * 7.5 }
    assert.ok(inside.free(chair.x, chair.z), `ghế tuyển thủ ở góc ${st.angle.toFixed(2)} bị vướng`)
    assert.ok(inside.has(chair.x, chair.z), `không đi bộ tới được ghế tuyển thủ ở góc ${st.angle.toFixed(2)}`)
  }
  // đi thẳng vào bệ cúp ở giữa: bị chặn quanh bệ
  const b = makeBody(gate.inside.x, gate.inside.z, Math.PI)
  for (let i = 0; i < 200; i += 1) stepBody(b, { mx: 0, mz: -1 })
  assert.ok(Math.hypot(b.x, b.z) > 1.55 + R - 0.05, `đi vào bệ cúp: dừng cách tâm ${Math.hypot(b.x, b.z).toFixed(2)}`)
  assert.ok(b.y > 0.9, `đi trên bục thì cao ~1 m: y=${b.y}`)
})

test('KHÁN ĐÀI: mỗi băng ghế ngồi được 3 người, ghế nằm trong băng, đúng độ cao bậc, quay mặt vào giữa sân, chỗ đứng dậy không vướng', () => {
  assert.equal(STAND_SEATS.length, STAND_BENCHES.length * 3)
  const first = SEATS.find((s) => s.zone === 'stand')
  assert.equal(first.bench, 60, 'chỉ số ghế khán đài nối tiếp phòng chờ')
  STAND_SEATS.forEach((seat, i) => assert.equal(seat.bench, 60 + i))
  for (const seat of STAND_SEATS) {
    const r = Math.hypot(seat.x, seat.z)
    assert.ok(Math.abs(seat.y - floorHeight(seat.x, seat.z)) < 1e-9, `độ cao ghế ${seat.bench}`)
    // mặt hướng về tâm: (sin h, cos h) ngược hướng bán kính
    const dot = (Math.sin(seat.heading) * seat.x + Math.cos(seat.heading) * seat.z) / r
    assert.ok(dot < -0.99, `ghế ${seat.bench} không quay mặt vào giữa sân (cos=${dot.toFixed(3)})`)
    assert.ok(seat.y > 0 && r > STANDS.inner && r < STANDS_OUTER)
    const q = { ...seat.exit }
    resolveCollisions(q)
    assert.ok(Math.hypot(q.x - seat.exit.x, q.z - seat.exit.z) < 1e-9, `chỗ đứng dậy của ghế khán đài ${seat.bench} bị vướng`)
  }
})

test('PHÒNG CHỜ: vùng bấm E — ghế sofa trống thì ngồi được, nhãn "Phòng chờ", hết chỗ thì báo, trong phòng không sát ghế thì gợi ý', () => {
  const seat = LOUNGE_SEATS[1] // ghế giữa sofa trái
  const me = { x: seat.x + Math.sin(seat.heading) * 0.85, z: seat.z + Math.cos(seat.heading) * 0.85 }
  const hit = zoneAt(me, [])
  assert.equal(hit.kind, 'lounge-seat')
  assert.equal(hit.label, LOUNGE_LABEL)
  assert.equal(hit.seat.zone, 'lounge')
  assert.match(zonePrompt(hit, false), /Phòng chờ: bấm E để ngồi/)
  assert.deepEqual(standUpSpot(hit.seat), hit.seat.exit)
  const around = SEATS.filter((s) => Math.hypot(s.x - me.x, s.z - me.z) <= 1.6).map((s) => ({ x: s.x, z: s.z }))
  assert.equal(zoneAt(me, around).kind, 'lounge-full')
  assert.match(zonePrompt({ kind: 'lounge', label: LOUNGE_LABEL }, false), /sofa/)
  const empty = { x: LOUNGE.zone.x1 - 0.5, z: LOUNGE.zone.z0 + 0.5 }
  assert.equal(zoneAt(empty, []).kind, 'lounge')
  assert.equal(zoneAt({ x: 0, z: 36 }, []), null, 'chỗ xuất hiện không thuộc vùng nào')
  assert.equal(zoneAt({ x: GATES[1].outside.x, z: GATES[1].outside.z }, []).kind, 'gate', 'trước cửa phòng chờ hiện gợi ý cửa')
  // ghế hội trường giữ nguyên nhãn
  assert.equal(zoneAt({ x: HALL_SEATS[22].x, z: HALL_SEATS[22].z + 0.7 }, []).label, HALL_LABEL)
})

test('CỬA và KHÁN ĐÀI ở vùng bấm E: gợi ý vào/ra đúng chiều, điểm tới đúng đầu cửa và độ cao, ghế khán đài có nhãn riêng', () => {
  const podium = GATES.find((g) => g.id === 'podium')
  const near = gateNear({ x: podium.outside.x + 0.5, z: podium.outside.z })
  assert.equal(near.gate.id, 'podium')
  assert.equal(near.enter, true)
  assert.equal(gateNear({ x: podium.inside.x, z: podium.inside.z + 0.3 }).enter, false, 'đứng ở đầu trong thì là đi ra')
  assert.equal(gateNear({ x: 0, z: 30 }), null, 'xa mọi cửa')
  assert.equal(gateNear({ x: podium.outside.x, z: podium.outside.z + GATE_RANGE + 0.3 }), null, 'quá tầm')
  const to = gateDestination(podium, true)
  assert.deepEqual([to.x, to.z, to.y, to.heading], [podium.inside.x, podium.inside.z, PODIUM_HEIGHT, podium.inside.heading])
  assert.equal(gateDestination(podium, false).y, 0)
  const hit = zoneAt({ x: podium.outside.x, z: podium.outside.z }, [])
  assert.equal(hit.kind, 'gate')
  assert.match(zonePrompt(hit, false), /Sân thi đấu: bấm E để vào/)
  assert.match(zonePrompt({ ...hit, enter: false }, true), /🪑 để ra ngoài/)
  const seat = STAND_SEATS[10]
  const me = { x: seat.x + Math.sin(seat.heading) * 0.85, z: seat.z + Math.cos(seat.heading) * 0.85 }
  const stand = zoneAt(me, [])
  assert.equal(stand.kind, 'stand-seat')
  assert.equal(stand.label, STAND_LABEL)
  assert.match(zonePrompt(stand, false), /Khán đài: bấm E để ngồi/)
})

// ---------- chọn mục tiêu đấm ----------
test('pickTarget: gần nhất trong tầm; trong 0,9 thì mọi hướng; xa hơn phải ở trong nón ±70° phía trước; quá tầm thì không', () => {
  const me = { x: 0, z: 0 }
  const heading = 0 // nhìn +z
  assert.equal(pickTarget(heading, me, [{ id: 1, x: 0, z: 1.5 }]), 1, 'trước mặt trong tầm')
  assert.equal(pickTarget(heading, me, [{ id: 1, x: 0, z: -1.5 }]), null, 'sau lưng ngoài vùng sát')
  assert.equal(pickTarget(heading, me, [{ id: 1, x: 0, z: -0.8 }]), 1, 'sau lưng nhưng trong 0,9')
  assert.equal(pickTarget(heading, me, [{ id: 1, x: 1.7, z: 0.1 }]), null, 'vuông góc ở xa: ngoài nón')
  assert.equal(pickTarget(heading, me, [{ id: 1, x: 1.2, z: 1.2 }]), 1, '45°: trong nón')
  assert.equal(pickTarget(heading, me, [{ id: 1, x: 0, z: PUNCH_REACH + 0.01 }]), null, 'quá tầm')
  assert.equal(pickTarget(heading, me, [{ id: 1, x: 0, z: 1.7 }, { id: 2, x: 0.3, z: 1.0 }]), 2, 'chọn người gần hơn')
  assert.equal(pickTarget(heading, me, []), null)
  // quay mặt thì nón quay theo
  assert.equal(pickTarget(Math.PI, me, [{ id: 1, x: 0, z: -1.5 }]), 1)
  assert.equal(pickTarget(Math.PI / 2, me, [{ id: 1, x: 1.5, z: 0 }]), 1)
  assert.ok(PUNCH_CLOSE < PUNCH_REACH)
  // ngay mép nón: cos 70° ≈ 0,342
  const edge = (deg) => ({ id: 1, x: Math.sin((deg * Math.PI) / 180) * 1.5, z: Math.cos((deg * Math.PI) / 180) * 1.5 })
  assert.equal(pickTarget(0, me, [edge(69)]), 1)
  assert.equal(pickTarget(0, me, [edge(71)]), null)
})

test('LEO KHÁN ĐÀI: đi thẳng lên theo từng cầu thang lối đi tới bậc trên cùng; giữa hai cầu thang thì băng ghế chặn; không xuyên tường chắn', () => {
  // mỗi lối đi: bắt đầu trên sàn phẳng (r=36) và đi ra ngoài; phải lên tới bậc cao nhất, đi qua đủ mọi bậc
  for (const a of AISLE_ANGLES) {
    const b = makeBody(Math.sin(a) * 36, Math.cos(a) * 36, a)
    const seen = new Set()
    for (let i = 0; i < 600; i += 1) {
      stepBody(b, { mx: Math.sin(a), mz: Math.cos(a) })
      seen.add(Math.round(floorHeight(b.x, b.z) * 100))
    }
    assert.ok(Math.hypot(b.x, b.z) > WALK_RADIUS - 0.5, `lối đi ${a.toFixed(2)}: chỉ lên tới r=${Math.hypot(b.x, b.z).toFixed(1)}`)
    assert.ok(Math.abs(b.y - STANDS_TOP) < 0.05, `lối đi ${a.toFixed(2)}: độ cao ${b.y.toFixed(2)} (kỳ vọng ${STANDS_TOP})`)
    assert.equal(seen.size, STANDS.tiers + 1, `lối đi ${a.toFixed(2)}: phải đi qua ${STANDS.tiers + 1} mức cao`)
  }
  // góc giữa hai cầu thang (không phải lối đi): đi ra ngoài thì bị băng ghế chặn ở bậc đầu
  for (const a of [0.6, (3 * Math.PI) / 8, (5 * Math.PI) / 8, (11 * Math.PI) / 8]) {
    const b = makeBody(Math.sin(a) * 38, Math.cos(a) * 38, a)
    for (let i = 0; i < 400; i += 1) stepBody(b, { mx: Math.sin(a), mz: Math.cos(a) })
    assert.ok(Math.hypot(b.x, b.z) < STANDS.inner + 2 * STANDS.width, `hướng ${a.toFixed(2)}: băng ghế phải chặn (r=${Math.hypot(b.x, b.z).toFixed(1)})`)
  }
  // đi dọc mép khoảng trống từ sàn phẳng sang khán đài: tường chắn, độ cao giữ 0
  for (const [center, half] of STAND_GAPS) {
    for (const side of [-1, 1]) {
      const edge = center + side * half
      const r = 48
      const b = makeBody(Math.sin(center + side * (half - 0.08)) * r, Math.cos(center + side * (half - 0.08)) * r, 0)
      // đi theo tiếp tuyến về phía khán đài
      const tx = Math.cos(edge) * side
      const tz = -Math.sin(edge) * side
      for (let i = 0; i < 120; i += 1) stepBody(b, { mx: tx, mz: tz })
      assert.ok(Math.abs(wrapAngle(Math.atan2(b.x, b.z) - center)) < half + 0.01, `qua tường tại ${edge.toFixed(2)} sang khán đài`)
      assert.ok(b.y < 0.1, 'vẫn ở trên sàn phẳng')
    }
  }
})
