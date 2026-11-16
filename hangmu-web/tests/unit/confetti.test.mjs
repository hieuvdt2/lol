// Pháo giấy khi ăn mừng: mảnh giấy rơi chậm (cản không khí), nằm lại trên sàn rồi biến mất; số mảnh không vượt giới hạn.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { FALL_SPEED, createConfetti, stepPiece } from '../../src/game/confetti.ts'
import { CELEBRATE_DURATION } from '../../src/game/gait.ts'

const piece = (over = {}) => ({ x: 0, y: 3, z: 0, vx: 2, vy: 6, vz: 0, rx: 0, ry: 0, sx: 5, sy: 3, sway: 0, swayRate: 3, floor: 0, age: 0, life: 6, color: 0, ...over })

test('mảnh giấy: bay lên rồi rơi chậm (không quá tốc độ rơi giới hạn), lật vòng, nằm lại trên sàn, hết đời thì biến mất', () => {
  const p = piece()
  let top = p.y
  let fastest = 0
  let alive = true
  let t = 0
  while (alive && t < 10) {
    alive = stepPiece(p, 1 / 60)
    t += 1 / 60
    top = Math.max(top, p.y)
    if (t > 1.5 && p.y > p.floor) fastest = Math.max(fastest, -p.vy)
  }
  assert.ok(top > 4, 'được bắn lên')
  assert.ok(fastest <= FALL_SPEED + 0.05, `rơi chậm như giấy: ${fastest.toFixed(2)} m/s`)
  assert.equal(alive, false, 'hết đời')
  assert.ok(Math.abs(p.y - p.floor) < 1e-9, 'nằm trên sàn')
  const q = piece({ life: 100 })
  for (let i = 0; i < 600; i += 1) stepPiece(q, 1 / 60)
  assert.equal(q.y, q.floor)
  const x = q.x
  stepPiece(q, 1 / 60)
  assert.equal(q.x, x, 'đã nằm trên sàn thì đứng yên')
})

test('ăn mừng: phát bắn + mưa giấy suốt lúc ăn mừng quanh người, không vượt số mảnh tối đa; xong thì tan hết', () => {
  const scene = new THREE.Scene()
  let seed = 1
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const fx = createConfetti(scene, 600, random)
  fx.burst(10, 0, -5)
  const afterBurst = fx.count
  assert.ok(afterBurst > 30, `phát bắn: ${afterBurst} mảnh`)
  let maxCount = 0
  let minDuring = Infinity
  const dt = 1 / 60
  for (let t = 0; t < CELEBRATE_DURATION; t += dt) {
    fx.shower(1, 10, 0, -5, t, dt)
    fx.update(dt)
    maxCount = Math.max(maxCount, fx.count)
    if (t > 1) minDuring = Math.min(minDuring, fx.count)
  }
  assert.ok(maxCount <= 600)
  assert.ok(minDuring > 50, `mưa giấy liên tục: ít nhất ${minDuring} mảnh`)
  const mesh = scene.children.find((o) => o.isInstancedMesh)
  assert.equal(mesh.count, fx.count, 'số mảnh vẽ = số mảnh đang sống')
  // các mảnh ở quanh người (trong bán kính vài mét)
  const m = new THREE.Matrix4()
  const v = new THREE.Vector3()
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m)
    v.setFromMatrixPosition(m)
    assert.ok(Math.hypot(v.x - 10, v.z + 5) < 8 && v.y >= 0 && v.y < 12, `mảnh ${i} ở (${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`)
  }
  for (let t = 0; t < 8; t += dt) fx.update(dt)
  assert.equal(fx.count, 0)
  assert.equal(mesh.count, 0)
  fx.dispose()
  assert.equal(scene.children.length, 0)
})
