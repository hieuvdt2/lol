// Camera không được chui vào thân khán đài / bục / bệ hội trường (thấy đáy các bậc).
import test from 'node:test'
import assert from 'node:assert/strict'
import { STANDS, STAGE } from '../../shared/world.mjs'
import { HALL_PLINTH, cameraBlocked, solidTop } from '../../src/game/cameraGuard.ts'

const along = (angle, r) => ({ x: Math.sin(angle) * r, z: Math.cos(angle) * r })

test('solidTop: sàn phẳng 0, bậc khán đài dâng dần, bục thi đấu và bệ hội trường', () => {
  assert.equal(solidTop(0, 30), 0)
  assert.ok(solidTop(...Object.values(along(Math.PI / 2, STANDS.inner + 3))) > 0.7)
  assert.ok(solidTop(0, 0) > 1, 'bệ cúp trên bục cao hơn mặt bục')
  assert.equal(solidTop(6, 0), 1, 'mặt bục')
  assert.equal(solidTop(0, STAGE.z), HALL_PLINTH)
})

test('camera phía sau người đứng sát chân khán đài (quay lưng ra khán đài) bị coi là lọt vào khối đặc, kéo gần lại thì thoáng', () => {
  const angle = Math.PI / 2 // khán đài hướng +x, lối đi nằm ở 3π/4 nên góc này có ghế nhưng thân bậc vẫn đặc
  const me = along(angle, STANDS.inner - 1)
  const cam = (distance, y) => ({ x: me.x + Math.sin(angle) * distance, z: me.z + Math.cos(angle) * distance, y })
  const far = cam(14, 4)
  assert.equal(cameraBlocked(me.x, 1.6, me.z, far.x, far.y, far.z), true, 'camera 14 m phía sau nằm trong bậc khán đài')
  const low = cam(6, 1.2)
  assert.equal(cameraBlocked(me.x, 1.6, me.z, low.x, low.y, low.z), true, 'camera thấp trong bậc')
  const near = cam(1.2, 1.4)
  assert.equal(cameraBlocked(me.x, 1.6, me.z, near.x, near.y, near.z), false, 'sát lưng người chơi thì thoáng')
})

test('camera trên sàn phẳng hoặc ở trên cao phía trên khán đài thì không bị chặn', () => {
  assert.equal(cameraBlocked(-15, 1.6, 30, -15, 4, 44), false)
  const angle = 1
  const me = along(angle, STANDS.inner - 1)
  const top = along(angle, STANDS.inner + 12)
  assert.equal(cameraBlocked(me.x, 1.6, me.z, top.x, 12, top.z), false, 'camera đủ cao phía trên đỉnh khán đài')
})

test('camera không chui vào sofa, tường kính phòng chờ hay vòm cổng vào', () => {
  const me = { x: 3.28, z: 47.5 } // người ngồi ở sofa phải
  // camera 14 m phía nam (sau tường kính, trong vòm cổng) bị chặn; kéo sát lưng thì thoáng
  assert.equal(cameraBlocked(me.x, 1.6, me.z, me.x, 5.7, me.z + 14), true)
  assert.equal(cameraBlocked(me.x, 1.6, me.z, me.x, 3.4, me.z + 1.4), false)
  assert.ok(solidTop(3.4, 47.5) >= 0.9, 'sofa')
  assert.equal(solidTop(0, 44.2), 5.4, 'tấm màn')
  assert.ok(solidTop(0, 53) >= 1.6, 'tường kính phía nam')
  assert.ok(solidTop(0, 57) >= 14, 'vòm cổng vào')
  assert.equal(solidTop(0, 30), 0)
})

test('đứng ở chỗ xuất hiện ngay trước phòng chờ: camera không thò vào trong phòng chờ (bị tấm màn che), kéo lại sát lưng thì thoáng; đang ở trong thì camera không ra ngoài', () => {
  assert.equal(cameraBlocked(0, 1.6, 36, 0, 4, 50), true, 'camera 14 m sau lưng nằm trong phòng chờ')
  assert.equal(cameraBlocked(0, 1.6, 36, 0, 4, 40.5), false, 'camera trước tường phòng chờ')
  assert.equal(cameraBlocked(-6, 1.6, 47, -6, 4, 39), true, 'trong phòng chờ, camera ra ngoài tường')
  assert.equal(cameraBlocked(-6, 1.6, 47, -6, 3.5, 42), false)
})
