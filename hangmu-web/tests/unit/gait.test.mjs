import test from 'node:test'
import assert from 'node:assert/strict'
import { CYCLE_LENGTH, Gait, SEATED, HIT_DURATION, MISS_DURATION, PUNCH_DURATION, RUN_SPEED, punchDuration, hitCurve, punchCurve, smoothTowards } from '../../src/game/gait.ts'
import { BODY, poseFootballer } from '../../src/game/person.ts'

const DT = 1 / 60
const JOINTS = ['rArm', 'lArm', 'rElbow', 'lElbow', 'rLeg', 'lLeg', 'rKnee', 'lKnee', 'torsoLean', 'torsoRoll', 'torsoTwist', 'headPitch', 'headYaw']
const input = (speed, extra = {}) => ({ speed, turnRate: 0, accel: 0, ...extra })

/** Chạy một kịch bản (mảng tốc độ theo khung hình) và trả về chuỗi tư thế. */
function run(gait, speeds, dt = DT, extra = () => ({})) {
  return speeds.map((speed, i) => gait.update(dt, input(speed, extra(i))))
}
/** Độ nhảy lớn nhất của một khớp giữa hai khung hình liền kề (rad). */
function maxJump(poses, joints = JOINTS) {
  let worst = 0
  for (let i = 1; i < poses.length; i += 1) for (const j of joints) worst = Math.max(worst, Math.abs(poses[i][j] - poses[i - 1][j]))
  return worst
}
const ramp = (from, to, frames) => Array.from({ length: frames }, (_, i) => from + ((to - from) * (i + 1)) / frames)
/** Đứng 0,5 s → tăng tốc 0,3 s → chạy 1 s → giảm tốc 0,3 s → đứng 0,5 s. */
const scenario = () => [...Array(30).fill(0), ...ramp(0, RUN_SPEED, 18), ...Array(60).fill(RUN_SPEED), ...ramp(RUN_SPEED, 0, 18), ...Array(30).fill(0)]

/** Mô phỏng mã CŨ (poseFootballer) trên một "diễn viên" giả chỉ có các khớp. */
function oldPoses(speeds) {
  const j = () => ({ rotation: { x: 0, y: 0 }, position: { y: 0 } })
  const actor = { legs: [j(), j()], knees: [j(), j()], arms: [j(), j()], elbows: [j(), j()], torso: j(), head: j() }
  return speeds.map((speed, i) => {
    poseFootballer(actor, (i * DT * 1000) / 160, speed, false, 0)
    return {
      rArm: actor.arms[0].rotation.x, lArm: actor.arms[1].rotation.x, rElbow: actor.elbows[0].rotation.x, lElbow: actor.elbows[1].rotation.x,
      rLeg: actor.legs[0].rotation.x, lLeg: actor.legs[1].rotation.x, rKnee: actor.knees[0].rotation.x, lKnee: actor.knees[1].rotation.x,
      headPitch: actor.head.rotation.x, headYaw: actor.head.rotation.y,
    }
  })
}

test('mọi đầu vào cho ra số hữu hạn trong khoảng hợp lý, kể cả khung hình cực dài hoặc đầu vào xấu', () => {
  const g = new Gait(1)
  g.punch()
  g.hit()
  g.setSeated(true)
  for (const [dt, speed, turnRate, accel] of [[0, 0, 0, 0], [0.5, 8, 50, 900], [DT, -5, -50, -900], [1e-6, 1e6, 0, 0], [DT, 0, 0, 0]]) {
    const p = g.update(dt, { speed, turnRate, accel })
    for (const k of [...JOINTS, 'bob', 'step']) {
      assert.ok(Number.isFinite(p[k]) && Math.abs(p[k]) < 4, `${k}=${p[k]} (dt=${dt}, speed=${speed})`)
    }
  }
})

test('MƯỢT: tăng tốc/dừng không làm khớp nhảy quá mức một nhịp chạy bình thường; mã cũ thì nhảy', () => {
  const speeds = scenario()
  const fresh = maxJump(run(new Gait(0), speeds))
  const old = maxJump(oldPoses(speeds), ['rArm', 'lArm', 'rElbow', 'lElbow', 'rLeg', 'lLeg', 'rKnee', 'lKnee', 'headPitch', 'headYaw'])
  // Đo thật (60 fps, chạy 8 đv/s): cũ ≈ 0,35, mới ≈ 0,25 rad/khung. Phần lớn là nhịp chạy đều (biên độ × tần số × dt).
  assert.ok(fresh <= 0.27, `hoạt hình mới: nhảy tối đa ${fresh.toFixed(3)} rad/khung`)
  assert.ok(old > 0.3, `mã cũ (đối chứng): ${old.toFixed(3)} rad/khung`)
  assert.ok(fresh < old * 0.8, `mới ${fresh.toFixed(3)} phải thấp hơn rõ rệt so với cũ ${old.toFixed(3)}`)
  // Đầu: mã cũ đổi chế độ nhìn quanh → nhìn thẳng làm đầu giật (≈0,12 rad/khung)
  assert.ok(maxJump(run(new Gait(0), speeds), ['headYaw', 'headPitch']) < 0.04)
  assert.ok(maxJump(oldPoses(speeds), ['headYaw', 'headPitch']) > 0.09, 'mã cũ giật đầu khi chuyển trạng thái')
})

test('MƯỢT: chuyển đứng → đi → đứng dùng pha trộn, không có công tắc ngưỡng 0,35 như mã cũ', () => {
  // Tốc độ dao động quanh ngưỡng cũ (0,35): mã cũ nhấp nháy giữa hai chế độ, mã mới không.
  const wobble = Array.from({ length: 120 }, (_, i) => (i % 2 === 0 ? 0.2 : 0.5))
  const fresh = maxJump(run(new Gait(0), wobble))
  const old = maxJump(oldPoses(wobble), ['rArm', 'lArm', 'rLeg', 'lLeg'])
  assert.ok(fresh < 0.08, `mới: ${fresh.toFixed(3)}`)
  assert.ok(old > 0.3, `cũ nhấp nháy: ${old.toFixed(3)}`)
})

test('KHÔNG TRƯỢT CHÂN: số chu kỳ chân trên mỗi đơn vị quãng đường không đổi theo tốc độ; mã cũ thay đổi mạnh', () => {
  // Đo trực tiếp bằng cách cộng dồn mức tăng pha từng khung (không bị bọc).
  const measure = (speed) => {
    const g = new Gait(0)
    run(g, Array(40).fill(speed))
    let total = 0
    let prev = g.phase
    for (let i = 0; i < 180; i += 1) {
      g.update(DT, input(speed))
      let d = g.phase - prev
      if (d < 0) d += Math.PI * 2
      total += d
      prev = g.phase
    }
    return total / (Math.PI * 2) / (speed * 180 * DT) // chu kỳ / đơn vị quãng đường
  }
  const speeds = [2, 4, 6, 8]
  const fresh = speeds.map(measure)
  for (const v of fresh) assert.ok(Math.abs(v - 1 / CYCLE_LENGTH) / (1 / CYCLE_LENGTH) < 0.03, `${v} ≠ ${1 / CYCLE_LENGTH}`)
  const oldRate = (speed) => (1000 / 160) / (Math.PI * 2) / speed // mã cũ: pha chạy theo thời gian (now/160), không theo quãng đường
  assert.ok(oldRate(2) / oldRate(8) > 3.5, 'mã cũ: nhịp chân không gắn với tốc độ nên trượt chân khi chạy nhanh')
})

test('KHÔNG TRƯỢT CHÂN: bàn chân quét một quãng gần bằng quãng người đi trong nửa chu kỳ (tỉ lệ ≤ 2)', () => {
  const g = new Gait(0)
  const poses = run(g, Array(240).fill(RUN_SPEED))
  const amp = Math.max(...poses.slice(60).map((p) => Math.abs(p.rLeg)))
  const LEG = 0.47 // chiều dài đùi + cẳng trong person.ts
  const footSweepPerHalfCycle = 2 * amp * LEG
  const groundPerHalfCycle = CYCLE_LENGTH / 2
  const ratio = groundPerHalfCycle / footSweepPerHalfCycle
  assert.ok(ratio <= 2.0, `tỉ lệ trượt ${ratio.toFixed(2)} (mã cũ ≈ ${((8 * (Math.PI / 6.25)) / (2 * 0.85 * LEG)).toFixed(1)})`)
})

test('đứng lại: về tư thế nghỉ, không còn đung đưa chân/tay', () => {
  const g = new Gait(0)
  const poses = run(g, [...Array(60).fill(RUN_SPEED), ...Array(90).fill(0)])
  const last = poses.at(-1)
  for (const k of ['rLeg', 'lLeg', 'rKnee', 'lKnee']) assert.ok(Math.abs(last[k]) < 0.03, `${k}=${last[k]}`)
  assert.ok(Math.abs(last.rArm) < 0.1 && Math.abs(last.lArm) < 0.1)
  assert.ok(Math.abs(last.torsoLean) < 0.05)
})

test('nhịp chạy thay đổi theo tốc độ: càng nhanh biên độ càng lớn, bước nhỏ ở tốc độ thấp', () => {
  const amp = (speed) => {
    const g = new Gait(0)
    return Math.max(...run(g, Array(180).fill(speed)).slice(60).map((p) => Math.abs(p.rLeg)))
  }
  assert.ok(amp(1) < amp(4) && amp(4) < amp(8), `${amp(1)} < ${amp(4)} < ${amp(8)}`)
  assert.ok(amp(1) < 0.45, 'đi chậm thì bước nhỏ')
})

test('đấm: chuẩn bị rồi duỗi tay ra trước đạt đỉnh ~0,16 s, giữ, thu về trước 0,6 s; liên tục, không giật', () => {
  const g = new Gait(0)
  run(g, Array(30).fill(0))
  const base = g.update(DT, input(0)).rArm
  g.punch()
  const frames = run(g, Array(60).fill(0))
  const t = (i) => (i + 1) * DT
  const peakIndex = frames.reduce((best, p, i) => (p.rArm < frames[best].rArm ? i : best), 0)
  assert.ok(frames[peakIndex].rArm < -1.4, `duỗi tay: ${frames[peakIndex].rArm}`)
  assert.ok(t(peakIndex) > 0.1 && t(peakIndex) < 0.26, `đỉnh lúc ${t(peakIndex).toFixed(2)} s`)
  const anticipation = Math.max(...frames.slice(0, 8).map((p) => p.rArm))
  assert.ok(anticipation > base + 0.3, 'có động tác chuẩn bị kéo tay ra sau trước khi đấm')
  assert.ok(Math.abs(frames.at(-1).rArm - base) < 0.08, 'thu tay về')
  assert.ok(maxJump(frames, ['rArm', 'rElbow', 'torsoTwist']) < 0.5, `không có nhảy cóc: ${maxJump(frames, ['rArm', 'rElbow', 'torsoTwist']).toFixed(3)}`)
  assert.ok(g.isPunching === false, 'hết hành động')
})

test('đấm liên tiếp: bắt đầu lại giữa chừng vẫn liên tục (không giật về tư thế cũ)', () => {
  const g = new Gait(0)
  const poses = []
  g.punch()
  for (let i = 0; i < 60; i += 1) {
    if (i === 8 || i === 22) g.punch() // đấm lại khi đang gồng và khi đang thu về
    poses.push(g.update(DT, input(0)))
  }
  assert.ok(maxJump(poses, ['rArm', 'rElbow', 'torsoTwist']) < 0.55, maxJump(poses, ['rArm', 'rElbow', 'torsoTwist']).toFixed(3))
})

test('đường cong đấm: trọng số 0 ở hai đầu, 1 ở giữa; mọi đại lượng liên tục theo thời gian', () => {
  assert.equal(punchCurve(-0.1).weight, 0)
  assert.equal(punchCurve(PUNCH_DURATION + 0.01).weight, 0)
  assert.equal(punchCurve(0.12).weight, 1)
  let prev = punchCurve(0)
  for (let t = 0.001; t < PUNCH_DURATION; t += 0.001) {
    const c = punchCurve(t)
    for (const k of ['weight', 'arm', 'elbow', 'twist', 'step', 'lean']) assert.ok(Math.abs(c[k] - prev[k]) < 0.08, `${k} nhảy tại t=${t.toFixed(3)}: ${prev[k]} → ${c[k]}`)
    prev = c
  }
})

test('bị đấm: đầu ngửa, thân ngả, lùi lại rồi hồi dần về nghỉ', () => {
  const g = new Gait(0)
  run(g, Array(30).fill(0))
  const base = g.update(DT, input(0))
  g.hit()
  const frames = run(g, Array(60).fill(0))
  const peak = Math.min(...frames.map((p) => p.headPitch))
  assert.ok(peak < base.headPitch - 0.3, `đầu ngửa ${peak}`)
  assert.ok(Math.min(...frames.map((p) => p.torsoLean)) < base.torsoLean - 0.25)
  assert.ok(Math.min(...frames.map((p) => p.step)) < -0.15, 'bật lùi')
  const end = g.update(DT, input(0))
  assert.ok(Math.abs(end.headPitch - base.headPitch) < 0.08, 'hồi lại')
  assert.equal(hitCurve(HIT_DURATION + 0.1).head, 0)
})

test('ngồi / đứng dậy: pha trộn mượt trong ~0,5 s, không nhảy', () => {
  const g = new Gait(0)
  run(g, Array(30).fill(0))
  g.setSeated(true)
  const sit = run(g, Array(45).fill(0))
  assert.ok(sit.at(-1).rLeg < -1.15 && sit.at(-1).rKnee > 1.25, 'đã ngồi: đùi ra trước (âm), gối gập (dương)')
  assert.ok(maxJump(sit, ['rLeg', 'lLeg', 'rKnee', 'lKnee', 'rArm']) < 0.15, maxJump(sit, ['rLeg', 'rKnee']).toFixed(3))
  g.setSeated(false)
  const stand = run(g, Array(45).fill(0))
  assert.ok(Math.abs(stand.at(-1).rLeg) < 0.05, 'đã đứng')
  assert.ok(maxJump(stand, ['rLeg', 'lLeg', 'rKnee', 'lKnee']) < 0.15)
})

test('không phụ thuộc tốc độ khung hình: dt 1/30, 1/60, 1/120 cho cùng kết quả sau 1 giây', () => {
  const finalPose = (dt) => {
    const g = new Gait(0)
    return run(g, Array(Math.round(1 / dt)).fill(6), dt).at(-1)
  }
  const a = finalPose(1 / 30)
  const b = finalPose(1 / 60)
  const c = finalPose(1 / 120)
  for (const k of ['torsoLean', 'rKnee', 'bob']) {
    assert.ok(Math.abs(a[k] - c[k]) < 0.08 && Math.abs(b[k] - c[k]) < 0.05, `${k}: ${a[k]} / ${b[k]} / ${c[k]}`)
  }
})

test('tốc độ nhảy cóc giữa 1 và 8 đv/s (dự đoán lại) được làm mượt, không làm chân/tay giật', () => {
  const noisy = Array.from({ length: 240 }, (_, i) => (i % 2 === 0 ? 1 : RUN_SPEED))
  const steady = Array(240).fill((1 + RUN_SPEED) / 2)
  const a = maxJump(run(new Gait(0), noisy).slice(60))
  const b = maxJump(run(new Gait(0), steady).slice(60))
  assert.ok(a < b * 1.35 + 0.03, `nhiễu ${a.toFixed(3)} so với đều ${b.toFixed(3)}`)
})

test('đám đông không bước đồng bộ: mỗi nhân vật có pha khởi đầu khác nhau', () => {
  const phases = new Set(Array.from({ length: 20 }, (_, i) => new Gait(i).phase.toFixed(3)))
  assert.ok(phases.size >= 18, `${phases.size}/20 pha khác nhau`)
})

test('chúi người theo tốc độ và nghiêng khi rẽ, đối xứng theo chiều rẽ', () => {
  const lean = (speed) => run(new Gait(0), Array(90).fill(speed)).at(-1).torsoLean
  assert.ok(lean(8) > lean(2) + 0.05 && lean(2) > lean(0), `${lean(0)} < ${lean(2)} < ${lean(8)}`)
  const roll = (turn) => run(new Gait(0), Array(90).fill(8), DT, () => ({ turnRate: turn })).at(-1).torsoRoll
  assert.ok(Math.abs(roll(3) + roll(-3)) < 1e-9 && roll(3) > 0.03, 'đối xứng')
  assert.ok(Math.abs(roll(1000)) <= 0.14 + 1e-9, 'bị kẹp')
})

test('smoothTowards: hội tụ về đích, không vọt quá, giữ nguyên khóa chưa có', () => {
  let cur = { a: 0, b: 10 }
  const target = { a: 1, b: -2 }
  for (let i = 0; i < 300; i += 1) {
    cur = smoothTowards(cur, target, DT, 0.08)
    assert.ok(cur.a <= 1 + 1e-9 && cur.b >= -2 - 1e-9, 'không vọt quá')
  }
  assert.ok(Math.abs(cur.a - 1) < 1e-3 && Math.abs(cur.b + 2) < 1e-3)
  assert.deepEqual(smoothTowards({ a: 1 }, { a: 1, c: 5 }, DT, 0.1), { a: 1, c: 5 }, 'khóa mới nhảy thẳng tới đích')
  assert.deepEqual(smoothTowards({ a: 0 }, { a: 1 }, 0, 0.1), { a: 0 }, 'dt = 0 thì đứng yên')
})

// ---------- ăn mừng ----------
import { CELEBRATE_DURATION, celebrateWeight } from '../../src/game/gait.ts'

test('celebrateWeight: 0 ngoài khoảng, vào nhanh, giữ 1, thu về mượt, liên tục', () => {
  assert.equal(celebrateWeight(-0.1), 0)
  assert.equal(celebrateWeight(CELEBRATE_DURATION), 0)
  assert.equal(celebrateWeight(1), 1)
  let prev = celebrateWeight(0)
  for (let t = 0.001; t < CELEBRATE_DURATION; t += 0.001) {
    const w = celebrateWeight(t)
    assert.ok(Math.abs(w - prev) < 0.06, `nhảy tại ${t.toFixed(3)}`)
    prev = w
  }
})

test('ăn mừng: giơ hai tay lên, nhún nhảy, ngẩng đầu, rồi về nghỉ; không giật; ngồi thì không ăn mừng', () => {
  const g = new Gait(0)
  run(g, Array(30).fill(0))
  const base = g.update(DT, input(0))
  g.celebrate()
  assert.equal(g.isCelebrating, true)
  const frames = run(g, Array(90).fill(0))
  assert.ok(Math.min(...frames.map((p) => p.rArm)) < -2.3, 'tay phải giơ cao')
  assert.ok(Math.min(...frames.map((p) => p.lArm)) < -2.3, 'tay trái giơ cao')
  assert.ok(Math.max(...frames.map((p) => p.bob)) > 0.1, 'nhún nhảy')
  assert.ok(Math.min(...frames.map((p) => p.headPitch)) < base.headPitch - 0.15, 'ngẩng đầu')
  assert.ok(maxJump(frames, ['rArm', 'lArm', 'rElbow', 'headPitch', 'torsoLean']) < 0.5, maxJump(frames, ['rArm', 'lArm']).toFixed(3))
  // ăn mừng lại khi đang ăn mừng: không bắt đầu lại từ đầu (tránh giật động tác)
  const mid = g.celebrateTime
  g.celebrate()
  assert.equal(g.celebrateTime, mid)
  const after = run(g, Array(Math.ceil((CELEBRATE_DURATION - mid + 1) / DT)).fill(0)).at(-1)
  assert.equal(g.isCelebrating, false)
  assert.ok(Math.abs(after.rArm - base.rArm) < 0.1 && Math.abs(after.lArm - base.lArm) < 0.1, 'về tư thế nghỉ')
  const s = new Gait(0)
  s.setSeated(true)
  run(s, Array(60).fill(0))
  const seatedBase = s.update(DT, input(0)).rArm
  s.celebrate()
  const seated = run(s, Array(30).fill(0))
  assert.ok(Math.abs(Math.min(...seated.map((p) => p.rArm)) - seatedBase) < 0.3, 'đang ngồi thì tay không giơ lên')
})

const idleBase = (g) => {
  run(g, Array(30).fill(0))
  return g.update(DT, input(0))
}

test('đấm HỤT: vung quá đà (tay xa hơn, thân xoay và chúi hơn đòn trúng), thu về chậm hơn; liên tục', () => {
  const hitG = new Gait(0)
  const missG = new Gait(0)
  const base = idleBase(hitG)
  idleBase(missG)
  hitG.punch('hit')
  missG.punch('miss')
  const hit = run(hitG, Array(80).fill(0))
  const miss = run(missG, Array(80).fill(0))
  const peak = (frames, k, sign) => Math.max(...frames.map((p) => sign * p[k]))
  assert.ok(peak(miss, 'rArm', -1) > peak(hit, 'rArm', -1) + 0.25, 'tay vung xa hơn')
  assert.ok(peak(miss, 'torsoTwist', 1) > peak(hit, 'torsoTwist', 1) + 0.05, 'xoay thân nhiều hơn')
  assert.ok(peak(miss, 'torsoLean', 1) > peak(hit, 'torsoLean', 1) + 0.05, 'chúi tới nhiều hơn')
  const activeFrames = (frames) => frames.filter((p) => Math.abs(p.rArm - base.rArm) > 0.15).length
  assert.ok(activeFrames(miss) > activeFrames(hit) + 6, `thu về chậm: ${activeFrames(miss)} vs ${activeFrames(hit)} khung`)
  assert.ok(MISS_DURATION > PUNCH_DURATION)
  assert.equal(punchDuration('miss'), MISS_DURATION)
  assert.equal(punchDuration('hit'), PUNCH_DURATION)
  assert.ok(maxJump(miss, ['rArm', 'rElbow', 'torsoTwist', 'torsoLean', 'lArm']) < 0.55, maxJump(miss, ['rArm', 'rElbow', 'torsoTwist', 'torsoLean', 'lArm']).toFixed(3))
  assert.ok(Math.abs(miss.at(-1).rArm - base.rArm) < 0.08, 'về nghỉ')
  assert.equal(missG.isPunching, false)
})

test('đấm hụt: isPunching kéo dài theo thời lượng của đòn hụt, không bị cắt ở 0,44 s', () => {
  const g = new Gait(0)
  g.punch('miss')
  run(g, Array(Math.round(0.5 / DT)).fill(0))
  assert.equal(g.isPunching, true, 'còn đang thu tay sau 0,5 s')
  run(g, Array(Math.round(0.2 / DT)).fill(0))
  assert.equal(g.isPunching, false)
})

test('đấm: tay trái giơ lên che mặt khi ra đòn (đòn trúng lẫn hụt), rồi hạ xuống', () => {
  for (const kind of ['hit', 'miss']) {
    const g = new Gait(0)
    const base = idleBase(g)
    g.punch(kind)
    const frames = run(g, Array(90).fill(0))
    assert.ok(Math.min(...frames.map((p) => p.lArm)) < base.lArm - 0.4, `${kind}: tay trái giơ`)
    assert.ok(Math.abs(frames.at(-1).lArm - base.lArm) < 0.08, `${kind}: hạ tay trái`)
  }
})

test('bị đấm theo hướng: từ trước thì ngửa/ngả/lùi; từ sau lưng thì chúi/bước tới; từ bên thì thân bị hất sang bên đối diện', () => {
  const trace = (front, side) => {
    const g = new Gait(0)
    const base = idleBase(g)
    g.hit(front, side)
    return { base, frames: run(g, Array(50).fill(0)) }
  }
  const front = trace(1, 0)
  const back = trace(-1, 0)
  assert.ok(Math.min(...front.frames.map((p) => p.headPitch)) < front.base.headPitch - 0.3, 'trước: ngửa đầu')
  assert.ok(Math.min(...front.frames.map((p) => p.step)) < -0.15, 'trước: bật lùi')
  assert.ok(Math.max(...back.frames.map((p) => p.headPitch)) > back.base.headPitch + 0.3, 'sau lưng: cúi đầu')
  assert.ok(Math.max(...back.frames.map((p) => p.torsoLean)) > back.base.torsoLean + 0.25, 'sau lưng: chúi tới')
  assert.ok(Math.max(...back.frames.map((p) => p.step)) > 0.15, 'sau lưng: loạng choạng bước tới')
  const left = trace(0, 1) // người đấm bên trái → thân bị hất sang phải (twist âm, roll âm)
  const right = trace(0, -1)
  assert.ok(Math.min(...left.frames.map((p) => p.torsoTwist)) < left.base.torsoTwist - 0.12, 'trái: xoay sang phải')
  assert.ok(Math.max(...right.frames.map((p) => p.torsoTwist)) > right.base.torsoTwist + 0.12, 'phải: xoay sang trái')
  assert.ok(Math.min(...left.frames.map((p) => p.torsoRoll)) < left.base.torsoRoll - 0.06, 'trái: nghiêng sang phải')
  assert.ok(Math.max(...right.frames.map((p) => p.torsoRoll)) > right.base.torsoRoll + 0.06, 'phải: nghiêng sang trái')
  // đòn đúng bên hông vẫn có phản ứng đáng kể (độ mạnh tối thiểu), không phẳng lì
  assert.ok(Math.min(...left.frames.map((p) => p.headPitch)) < left.base.headPitch - 0.2, 'từ bên: vẫn giật đầu')
  for (const t of [front, back, left, right]) assert.ok(maxJump(t.frames, ['headPitch', 'torsoLean', 'torsoTwist', 'torsoRoll', 'step']) < 0.3, 'liên tục')
})

test('bị đấm: tham số lạ (NaN, ngoài khoảng) không làm hỏng tư thế', () => {
  const g = new Gait(0)
  g.hit(Number.NaN, Infinity)
  const frames = run(g, Array(40).fill(0))
  for (const p of frames) for (const j of JOINTS) assert.ok(Number.isFinite(p[j]) && Math.abs(p[j]) < 4, `${j}=${p[j]}`)
})

test('tư thế ngồi: đùi duỗi ra PHÍA TRƯỚC (+z cục bộ), gần nằm ngang ở độ cao mặt ghế, cẳng chân rủ xuống trước ghế — không chĩa ra sau lưng', () => {
  // Xoay quanh trục x góc θ đưa vectơ (0, −L, 0) tới (0, −L·cosθ, −L·sinθ): góc ÂM đưa chi ra trước (mặt nhân vật quay về +z).
  const knee = { z: -BODY.thighLen * Math.sin(SEATED.legs), y: BODY.hipY - BODY.thighLen * Math.cos(SEATED.legs) }
  const total = SEATED.legs + SEATED.knees
  const foot = { z: knee.z - BODY.shinLen * Math.sin(total), y: knee.y - BODY.shinLen * Math.cos(total) }
  assert.ok(knee.z > 0.15, `đầu gối phải ở phía trước hông: z=${knee.z.toFixed(3)}`)
  assert.ok(Math.abs(knee.y - BODY.hipY) < 0.2, `đùi gần ngang: đầu gối cao ${knee.y.toFixed(2)} so với hông ${BODY.hipY}`)
  assert.ok(foot.y < knee.y - 0.15 && foot.y > 0.05, `cẳng chân rủ xuống: bàn chân cao ${foot.y.toFixed(2)}`)
  assert.ok(Math.abs(foot.z - knee.z) < 0.1, `bàn chân ngay dưới đầu gối: lệch ${(foot.z - knee.z).toFixed(3)}`)
  // mặt trên đùi ở ~0,46 m (hông 0,55 − bán kính đùi 0,088) = độ cao mặt ghế (BENCH.height / SOFA.height)
  assert.ok(Math.abs(BODY.hipY - BODY.legR - 0.46) < 0.01, 'hông ngồi đúng độ cao mặt ghế 0,46 m')
  // poseFootballer (bản cũ dùng cho ảnh đại diện) cùng chiều
  const rig = (v) => ({ rotation: { x: v } })
  const actor = { legs: [rig(0), rig(0)], knees: [rig(0), rig(0)], arms: [rig(0), rig(0)], elbows: [rig(0), rig(0)], torso: { position: { y: 0 } }, head: { rotation: { x: 0, y: 0 } } }
  poseFootballer(actor, 0, 0, true, 0)
  assert.ok(actor.legs[0].rotation.x < 0 && actor.knees[0].rotation.x > 0)
})
