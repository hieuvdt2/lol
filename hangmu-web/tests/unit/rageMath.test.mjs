import test from 'node:test'
import assert from 'node:assert/strict'
import { RING_RADIUS, SLOTS, aimToNdc, arc, rageCamera, slotAngle, slotXZ, splatOpacity, springStep } from '../../src/game/rageMath.ts'

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

test('5 ô nằm đều trên vòng bán kính 5, cách đều nhau', () => {
  const pts = Array.from({ length: SLOTS }, (_, i) => slotXZ(i))
  for (const p of pts) assert.ok(near(Math.hypot(p.x, p.z), RING_RADIUS), 'trên vòng')
  const gaps = pts.map((p, i) => Math.hypot(p.x - pts[(i + 1) % SLOTS].x, p.z - pts[(i + 1) % SLOTS].z))
  for (const g of gaps) assert.ok(near(g, gaps[0], 1e-9), 'cách đều')
  assert.ok(near(slotAngle(0), 0) && near(slotAngle(SLOTS), Math.PI * 2))
})

test('camera ném đồ: đứng ngoài vòng, trên tia từ tâm qua ô, nhìn vào hình nộm', () => {
  const ground = (x, z) => -2 + 0.1 * Math.hypot(x, z)
  for (let i = 0; i < SLOTS; i += 1) {
    const { position, look } = rageCamera(i, ground)
    const slot = slotXZ(i)
    const r = Math.hypot(position.x, position.z)
    assert.ok(r > RING_RADIUS + 5, `ô ${i}: camera ở ngoài vòng (${r.toFixed(2)})`)
    // thẳng hàng tâm - ô - camera
    const cross = position.x * slot.z - position.z * slot.x
    assert.ok(Math.abs(cross) < 1e-6, `ô ${i}: lệch khỏi tia từ tâm`)
    assert.ok(near(look.x, slot.x) && near(look.z, slot.z), 'nhìn đúng ô')
    assert.ok(position.y > look.y - 1 && position.y < look.y + 3, 'tầm mắt hợp lý')
  }
})

test('quỹ đạo: bắt đầu ở điểm ném, kết thúc ở đích, bay cao hơn đường thẳng ở giữa', () => {
  const a = { x: 0, y: 1.5, z: 8 }
  const b = { x: 0.4, y: 1.2, z: -1 }
  const start = arc(0, a, b, 1)
  const end = arc(1, a, b, 1)
  for (const k of ['x', 'y', 'z']) {
    assert.ok(near(start[k], a[k]), `đầu ${k}`)
    assert.ok(near(end[k], b[k]), `cuối ${k}`)
  }
  const mid = arc(0.5, a, b, 1)
  assert.ok(mid.y > (a.y + b.y) / 2 + 0.4, 'vòng cung nhô lên giữa đường')
  assert.deepEqual(arc(-3, a, b, 1), start, 'kẹp t < 0')
  assert.deepEqual(arc(7, a, b, 1), end, 'kẹp t > 1')
  let prevZ = Infinity
  for (let t = 0; t <= 1.0001; t += 0.1) { const p = arc(t, a, b, 1); assert.ok(p.z <= prevZ + 1e-9, 'tiến đều về phía đích'); prevZ = p.z }
})

test('aimToNdc: tâm khung = (0,0), góc khung = ±1, ngoài khung bị kẹp, làm tròn 2 số lẻ', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 }
  assert.deepEqual(aimToNdc(300, 150, rect), { u: 0, v: 0 })
  assert.deepEqual(aimToNdc(100, 50, rect), { u: -1, v: 1 })
  assert.deepEqual(aimToNdc(500, 250, rect), { u: 1, v: -1 })
  assert.deepEqual(aimToNdc(9999, -9999, rect), { u: 1, v: 1 })
  const r = aimToNdc(333, 77, rect)
  assert.ok(Number.isInteger(Math.round(r.u * 100)) && Math.abs(r.u * 100 - Math.round(r.u * 100)) < 1e-9)
  assert.deepEqual(aimToNdc(1, 1, { left: 0, top: 0, width: 0, height: 0 }), { u: 1, v: -1 }, 'khung rỗng không gây chia cho 0 (kẹp về biên)')
})

test('lò xo: tắt dần về 0, không nổ số', () => {
  let s = { angle: 0.3, velocity: 0 }
  let peak = 0
  for (let i = 0; i < 600; i += 1) {
    s = springStep(s.angle, s.velocity, 1 / 60)
    assert.ok(Number.isFinite(s.angle))
    peak = Math.max(peak, Math.abs(s.angle))
  }
  assert.ok(peak <= 0.31, `không dao động tăng: ${peak}`)
  assert.ok(Math.abs(s.angle) < 0.002 && Math.abs(s.velocity) < 0.02, 'đã lắng')
})

test('vệt bẩn: đậm lúc đầu, nhạt dần, biến mất đúng hạn', () => {
  assert.equal(splatOpacity(0), 1)
  assert.equal(splatOpacity(8), 1)
  assert.ok(splatOpacity(14) > 0 && splatOpacity(14) < 1)
  assert.ok(splatOpacity(12) > splatOpacity(16))
  assert.equal(splatOpacity(20), 0)
  assert.equal(splatOpacity(99), 0)
})
