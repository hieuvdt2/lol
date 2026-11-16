// Camera sau lưng người chơi không được giật khi người chơi chạy đi khỏi chỗ vướng (phòng chờ ngay sau chỗ xuất hiện).
import test from 'node:test'
import assert from 'node:assert/strict'
import { SPAWN_X, SPAWN_Z, floorHeight } from '../../shared/world.mjs'
import { CAMERA_CLEARANCE, cameraBlocked, solidTop } from '../../src/game/cameraGuard.ts'
import { baseDistance, cameraSpot, clearDistance, easeDistance } from '../../src/game/cameraRig.ts'

const DT = 1 / 60
const SPEED = 8

/** Chạy thẳng `frames` khung hình, trả về bước nhảy lớn nhất của camera (đã trừ phần người chơi tự đi) mỗi khung. */
function worstJump(x0, z0, yaw, pitchPos, frames = 150) {
  let x = x0
  let z = z0
  let current = -1
  let prev = null
  let worst = 0
  for (let f = 0; f < frames; f += 1) {
    const py = floorHeight(x, z)
    const rig = { px: x, py, pz: z, yaw, pitchPos, scale: 1 }
    current = easeDistance(current, clearDistance(rig), DT)
    const s = cameraSpot(rig, current)
    const cam = { x: s.x, y: Math.max(s.y, solidTop(s.x, s.z) + CAMERA_CLEARANCE), z: s.z, px: x, py, pz: z }
    if (prev) worst = Math.max(worst, Math.hypot(cam.x - prev.x - (x - prev.px), cam.y - prev.y - (py - prev.py), cam.z - prev.z - (z - prev.pz)))
    prev = cam
    x -= Math.sin(yaw) * SPEED * DT
    z -= Math.cos(yaw) * SPEED * DT
  }
  return worst
}

test('chạy thẳng từ chỗ xuất hiện (phòng chờ sau lưng): camera lùi ra mượt, không nhảy cả nấc', () => {
  for (const pitch of [-0.08, 0, 0.14, 0.4]) {
    for (const yaw of [0, 0.4, -0.4]) {
      const jump = worstJump(SPAWN_X, SPAWN_Z, yaw, pitch)
      assert.ok(jump < 0.25, `pitch ${pitch} yaw ${yaw}: camera nhảy ${jump.toFixed(2)} m trong một khung`)
    }
  }
})

test('chạy ra xa phòng chờ: khoảng cách thoáng không bị tụt (tụt thì camera giật vào ngay)', () => {
  for (const pitchPos of [-0.08, 0, 0.14, 0.4]) {
    let prev = null
    for (let z = SPAWN_Z; z > SPAWN_Z - 12; z -= 0.05) {
      const d = clearDistance({ px: 0, py: 0, pz: z, yaw: 0, pitchPos, scale: 1 })
      if (prev !== null) assert.ok(d > prev - 0.15, `pitch ${pitchPos} z=${z.toFixed(2)}: ${prev.toFixed(2)} → ${d.toFixed(2)}`)
      prev = d
    }
  }
})

test('khoảng cách thoáng thật sự thoáng; chỗ trống thì giữ khoảng cách chuẩn', () => {
  const open = { px: 0, py: 0, pz: 25, yaw: 0, pitchPos: 0.14, scale: 1 }
  assert.equal(clearDistance(open), baseDistance(open))
  const nearLounge = { px: 0, py: 0, pz: SPAWN_Z, yaw: 0, pitchPos: 0, scale: 1 }
  const d = clearDistance(nearLounge)
  assert.ok(d < baseDistance(nearLounge))
  const c = cameraSpot(nearLounge, d)
  assert.equal(cameraBlocked(0, 1.6, SPAWN_Z, c.x, c.y, c.z), false)
})

test('vướng thì kéo vào ngay; hết vướng thì lùi ra từ từ', () => {
  assert.equal(easeDistance(-1, 9, DT), 9)
  assert.equal(easeDistance(12, 4, DT), 4)
  const next = easeDistance(4, 14, DT)
  assert.ok(next > 4 && next - 4 <= 0.11, String(next))
  const near = easeDistance(13.9, 14, DT)
  assert.ok(near > 13.9 && near < 14)
})
