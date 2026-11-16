import test from 'node:test'
import assert from 'node:assert/strict'
import { fightPose } from '../../src/game/fightPose.ts'

const POSES = ['idle', 'windup', 'strike', 'guard', 'hurt', 'hit', 'block', 'ko']

test('mọi tư thế ở mọi thời điểm cho ra số hữu hạn, trong khoảng hợp lý', () => {
  for (const pose of POSES) {
    for (const t of [0, 16, 90, 250, 700, 5000]) {
      for (const [key, value] of Object.entries(fightPose(pose, t, t / 300))) {
        assert.ok(Number.isFinite(value), `${pose}@${t}.${key} = ${value}`)
        assert.ok(Math.abs(value) < 4, `${pose}@${t}.${key} = ${value} ngoài khoảng`)
      }
    }
  }
})

test('gồng tay (windup): tay phải kéo ra sau và thân xoay, càng lâu càng rõ rồi ổn định', () => {
  const idle = fightPose('idle', 0)
  const early = fightPose('windup', 50)
  const late = fightPose('windup', 500)
  assert.ok(late.rArm > idle.rArm + 1, 'tay phải kéo ra sau so với đứng yên')
  assert.ok(late.rArm > early.rArm, 'kéo dần')
  assert.ok(late.torsoTwist < 0 && late.bodyShift < 0, 'thân xoay và lùi nhẹ')
  assert.ok(Math.abs(fightPose('windup', 5000).rArm - late.rArm) < 0.05, 'kéo xong thì giữ nguyên')
})

test('ra đòn (strike): tay phải duỗi thẳng ra trước, người lao tới rồi quay về', () => {
  const start = fightPose('strike', 0)
  const mid = fightPose('strike', 120)
  const end = fightPose('strike', 400)
  assert.ok(mid.rArm < start.rArm - 1.5, 'duỗi tay ra trước (góc âm)')
  assert.ok(mid.rElbow > start.rElbow, 'khuỷu duỗi')
  assert.ok(mid.bodyShift > 0.4, `lao tới: ${mid.bodyShift}`)
  assert.ok(end.bodyShift < 0.05, 'sau đòn trở về chỗ cũ')
})

test('đỡ (guard/block): hai tay nâng lên che mặt, hạ trọng tâm; block giật lùi rồi hết giật', () => {
  for (const pose of ['guard', 'block']) {
    const g = fightPose(pose, 300)
    assert.ok(g.rArm < -1.5 && g.lArm < -1.5, `${pose}: hai tay nâng cao`)
    assert.ok(g.crouch > fightPose('idle', 0).crouch, `${pose}: hạ thấp`)
  }
  assert.ok(fightPose('block', 0).bodyShift < -0.1, 'vừa đỡ thì giật lùi')
  assert.ok(Math.abs(fightPose('block', 1000).bodyShift) < 0.01, 'hết giật')
})

test('trúng đòn (hurt/hit): đầu ngửa, thân ngả, bật lùi rồi hồi dần', () => {
  for (const pose of ['hurt', 'hit']) {
    const a = fightPose(pose, 0)
    const b = fightPose(pose, 800)
    assert.ok(a.headPitch < -0.4 && a.torsoLean < -0.3 && a.bodyShift < -0.3, pose)
    assert.ok(Math.abs(b.headPitch) < 0.1 && Math.abs(b.bodyShift) < 0.05, `${pose}: hồi lại`)
  }
})

test('hạ đo ván (ko): ngã dần tới 1 và dừng ở đó, không bao giờ vượt', () => {
  let previous = -1
  for (const t of [0, 100, 250, 450, 650, 2000]) {
    const { fall } = fightPose('ko', t)
    assert.ok(fall >= previous - 1e-9, 'ngã đơn điệu')
    assert.ok(fall <= 1 + 1e-9)
    previous = fall
  }
  assert.equal(fightPose('ko', 0).fall, 0)
  assert.ok(Math.abs(fightPose('ko', 5000).fall - 1) < 1e-9, 'ngã hẳn')
})

test('tư thế chờ chuyển động nhẹ theo nhịp thở nhưng không bao giờ lệch xa', () => {
  const a = fightPose('idle', 0, 0)
  const b = fightPose('idle', 0, 1.2)
  assert.notEqual(a.crouch, b.crouch, 'có nhịp thở')
  assert.ok(Math.abs(a.rArm - b.rArm) < 0.1)
})
