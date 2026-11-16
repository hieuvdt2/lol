import test from 'node:test'
import assert from 'node:assert/strict'
import { hitDirection, turnToward } from '../../src/game/targeting.ts'
import { SHAKE_AMPLITUDE, SHAKE_DURATION_MS, punchShake } from '../../src/game/punchFx.ts'

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)

test('hitDirection: trước/sau/trái/phải theo hướng mặt (0 = +z, trái = +x)', () => {
  const v = { x: 0, z: 0, heading: 0 }
  let d = hitDirection(v, { x: 0, z: 1 })
  near(d.front, 1); near(d.side, 0)
  d = hitDirection(v, { x: 0, z: -2 })
  near(d.front, -1); near(d.side, 0)
  d = hitDirection(v, { x: 1, z: 0 })
  near(d.front, 0); near(d.side, 1) // +x là bên trái khi mặt hướng +z
  d = hitDirection(v, { x: -1, z: 0 })
  near(d.side, -1)
  // xoay mặt 90° về +x: người ở +x thành phía trước, người ở +z thành bên phải
  const turned = { x: 0, z: 0, heading: Math.PI / 2 }
  d = hitDirection(turned, { x: 3, z: 0 })
  near(d.front, 1); near(d.side, 0)
  d = hitDirection(turned, { x: 0, z: 3 })
  near(d.front, 0); near(d.side, -1)
  // trùng vị trí: coi như từ phía trước, không NaN
  assert.deepEqual(hitDirection(v, { x: 0, z: 0 }), { front: 1, side: 0 })
})

test('turnToward: góc cần xoay để hướng về mục tiêu, kẹp theo giới hạn, đi đường ngắn', () => {
  near(turnToward({ x: 0, z: 0 }, 0, { x: 0, z: 5 }, 0.7), 0)
  near(turnToward({ x: 0, z: 0 }, 0, { x: 5, z: 5 }, 2), Math.PI / 4) // +x là trái ⇒ xoay dương
  near(turnToward({ x: 0, z: 0 }, 0, { x: 5, z: 5 }, 0.7), 0.7, 1e-9) // 45° nhưng giới hạn 0,7
  near(turnToward({ x: 0, z: 0 }, 0, { x: -5, z: 5 }, 2), -Math.PI / 4)
  near(turnToward({ x: 0, z: 0 }, 0, { x: 5, z: 0 }, 0.7), 0.7, 1e-9) // 90° bị kẹp
  near(turnToward({ x: 0, z: 0 }, Math.PI * 1.9, { x: 0, z: 5 }, 2), 0.1 * Math.PI) // quanh vòng: đi đường ngắn
  assert.equal(turnToward({ x: 1, z: 1 }, 2, { x: 1, z: 1 }, 0.7), 0)
})

test('punchShake: bắt đầu ngay, tắt dần, về đúng 0 khi hết; không NaN với đầu vào xấu', () => {
  const first = punchShake(5)
  assert.ok(Math.hypot(first.x, first.y) > 0.02, 'rung ngay khi trúng')
  let peak = 0
  for (let t = 0; t < SHAKE_DURATION_MS; t += 2) peak = Math.max(peak, Math.hypot(punchShake(t).x, punchShake(t).y))
  assert.ok(peak <= SHAKE_AMPLITUDE * 1.3, `biên độ ${peak}`)
  assert.ok(Math.hypot(punchShake(SHAKE_DURATION_MS - 1).x, punchShake(SHAKE_DURATION_MS - 1).y) < 0.01, 'tắt mượt ở cuối')
  assert.deepEqual(punchShake(SHAKE_DURATION_MS), { x: 0, y: 0 })
  assert.deepEqual(punchShake(-5), { x: 0, y: 0 })
  assert.deepEqual(punchShake(Number.NaN), { x: 0, y: 0 })
  assert.deepEqual(punchShake(Infinity), { x: 0, y: 0 })
  assert.deepEqual(punchShake(-Infinity), { x: 0, y: 0 })
})
