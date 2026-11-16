// Mô phỏng đẩy xe lăn: tay bám đúng vành đẩy, bánh lăn vi sai khi rẽ, bánh trước xoay theo hướng đi, chân nằm trên chỗ để chân.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { RIDE, addAccessories } from '../../src/game/accessories.ts'
import { BODY } from '../../src/game/person.ts'
import { ARM, LIFT, PUSH, RIDE_LEGS, animateRide, liftPose, newRideState, pushCycle, rimPoint, settleRide, solveArm } from '../../src/game/wheelchair.ts'
import { CELEBRATE_DURATION } from '../../src/game/gait.ts'

const POSE = { rLeg: 0, lLeg: 0, rKnee: 0, lKnee: 0, rArm: 0, lArm: 0, rElbow: 0, lElbow: 0, headPitch: 0, headYaw: 0, torsoLean: 0, torsoTwist: 0, torsoRoll: 0, bob: 0, step: 0 }

/** Khung xương giống person.ts (vai, khuỷu, hông, gối) + xe lăn thật từ accessories.ts. */
function makeRider() {
  const root = new THREE.Group()
  const detail = new THREE.Group()
  const head = new THREE.Group()
  head.position.y = BODY.headY - BODY.headR
  detail.add(head)
  const limb = (x, y, len) => {
    const top = new THREE.Group()
    top.position.set(x, y, 0)
    const mid = new THREE.Group()
    mid.position.y = -len
    top.add(mid)
    detail.add(top)
    return [top, mid]
  }
  const [rs, re] = limb(BODY.shoulderX, BODY.shoulderY, BODY.upperArmLen)
  const [ls, le] = limb(-BODY.shoulderX, BODY.shoulderY, BODY.upperArmLen)
  const [rh, rk] = limb(BODY.hipX, BODY.hipY, BODY.thighLen)
  const [lh, lk] = limb(-BODY.hipX, BODY.hipY, BODY.thighLen)
  root.add(detail)
  const ride = addAccessories({ head, detail, rightElbow: re, root }, { face: 0, carry: 0, ride: 1 }, { headCentre: BODY.headR, headR: BODY.headR, stickColor: '#fff' })
  return { root, actor: { ride, detail, head, arms: [rs, ls], elbows: [re, le], legs: [rh, lh], knees: [rk, lk] } }
}

const handAt = (rider, i) => {
  rider.root.updateMatrixWorld(true)
  return rider.actor.elbows[i].localToWorld(new THREE.Vector3(0, -ARM.fore, 0))
}

function run(rider, state, seconds, input, onFrame) {
  const dt = 1 / 60
  for (let f = 0; f < seconds * 60; f += 1) {
    animateRide(rider.actor, state, dt, input, POSE)
    onFrame?.(f)
  }
}

test('IK: đặt góc xong thì bàn tay tới đúng đích (trong tầm với)', () => {
  const shoulder = new THREE.Vector3(0.34, 1.05, 0.2)
  for (const target of [new THREE.Vector3(0.42, 0.7, 0.1), new THREE.Vector3(0.45, 0.8, -0.1), new THREE.Vector3(0.3, 0.75, 0.3)]) {
    const sol = solveArm(shoulder, target)
    const arm = new THREE.Group()
    arm.position.copy(shoulder)
    arm.rotation.set(sol.pitch, 0, sol.roll)
    const elbow = new THREE.Group()
    elbow.position.y = -ARM.upper
    elbow.rotation.x = sol.elbow
    arm.add(elbow)
    arm.updateMatrixWorld(true)
    const hand = elbow.localToWorld(new THREE.Vector3(0, -ARM.fore, 0))
    assert.ok(hand.distanceTo(target) < 1e-3, `lệch ${hand.distanceTo(target).toFixed(4)} m tới ${target.toArray()}`)
    assert.ok(sol.elbow <= 0, 'khuỷu gập về trước, không gập ngược')
  }
})

test('đang đẩy: suốt phần bám vành, hai bàn tay nằm trên vành đẩy (lệch < 2 cm); có thu tay về', () => {
  const rider = makeRider()
  const state = newRideState()
  run(rider, state, 2, { speed: 4, turnRate: 0, accel: 0 }) // vào nhịp
  let contactFrames = 0
  let worst = 0
  let lifted = 0
  run(rider, state, 3, { speed: 4, turnRate: 0, accel: 0 }, () => {
    const c = pushCycle(state.phase)
    for (const i of [0, 1]) {
      const side = i === 0 ? 1 : -1
      const hand = handAt(rider, i)
      if (c.lift === 0) {
        contactFrames += 1
        worst = Math.max(worst, hand.distanceTo(rimPoint(side, PUSH.rest + (c.angle - PUSH.rest) * state.drive[i === 0 ? 1 : 0])))
      } else lifted = Math.max(lifted, hand.y - (RIDE.wheelR + RIDE.rimR))
    }
  })
  assert.ok(contactFrames > 60, `đủ khung bám vành: ${contactFrames}`)
  assert.ok(worst < 0.02, `bàn tay lệch khỏi vành đẩy tối đa ${worst.toFixed(3)} m`)
  assert.ok(lifted > 0.03, `thu tay: nhấc khỏi vành ${lifted.toFixed(3)} m`)
})

test('đẩy thì thân gập theo nhịp; đứng yên thì tay đặt trên vành, thân thẳng hơn', () => {
  const rider = makeRider()
  const state = newRideState()
  let minLean = Infinity
  let maxLean = -Infinity
  run(rider, state, 2, { speed: 4, turnRate: 0, accel: 0 })
  run(rider, state, 2, { speed: 4, turnRate: 0, accel: 0 }, () => {
    minLean = Math.min(minLean, rider.actor.detail.rotation.x)
    maxLean = Math.max(maxLean, rider.actor.detail.rotation.x)
  })
  assert.ok(maxLean - minLean > 0.15, `thân gập theo nhịp: ${minLean.toFixed(2)}..${maxLean.toFixed(2)}`)
  run(rider, state, 2, { speed: 0, turnRate: 0, accel: 0 })
  assert.ok(Math.abs(rider.actor.detail.rotation.x - PUSH.leanRest) < 0.02)
  for (const i of [0, 1]) {
    const side = i === 0 ? 1 : -1
    assert.ok(handAt(rider, i).distanceTo(rimPoint(side, PUSH.rest)) < 0.02, 'tay đặt trên vành khi đứng yên')
  }
})

test('đi thẳng: hai bánh lớn lăn bằng nhau đúng quãng đường; bánh trước thẳng hướng và lăn', () => {
  const rider = makeRider()
  const state = newRideState()
  run(rider, state, 1, { speed: 3, turnRate: 0, accel: 0 })
  const [right, left] = rider.actor.ride.wheels
  assert.ok(Math.abs(right.rotation.x - 3 / RIDE.wheelR) < 1e-6)
  assert.ok(Math.abs(left.rotation.x - right.rotation.x) < 1e-9)
  assert.ok(Math.abs(state.casterYaw) < 1e-6)
  assert.ok(rider.actor.ride.casters[0].wheel.rotation.x > 3 / RIDE.casterR - 1e-6)
})

test('xoay tại chỗ sang trái: bánh phải lăn tới, bánh trái lăn lùi, tay trái kéo ngược; bánh trước quay ngang', () => {
  const rider = makeRider()
  const state = newRideState()
  run(rider, state, 1, { speed: 0, turnRate: 2, accel: 0 })
  const [right, left] = rider.actor.ride.wheels
  assert.ok(right.rotation.x > 0.5 && left.rotation.x < -0.5, `phải ${right.rotation.x.toFixed(2)}, trái ${left.rotation.x.toFixed(2)}`)
  assert.deepEqual(state.dir, [1, -1])
  assert.ok(Math.abs(state.casterYaw - Math.PI / 2) < 0.05, `bánh trước ${state.casterYaw.toFixed(2)}`)
})

test('rẽ trái khi đang đi: bánh ngoài (phải) lăn nhanh hơn bánh trong; bánh trước lệch sang trái', () => {
  const rider = makeRider()
  const state = newRideState()
  run(rider, state, 1, { speed: 3, turnRate: 1.5, accel: 0 })
  const [right, left] = rider.actor.ride.wheels
  assert.ok(right.rotation.x > left.rotation.x * 1.3)
  assert.ok(state.casterYaw > 0.1 && state.casterYaw < Math.PI / 2)
})

test('chân giữ trên chỗ để chân dù thân gập; mông ngồi trên đệm', () => {
  const rider = makeRider()
  const state = newRideState()
  run(rider, state, 3, { speed: 4, turnRate: 0, accel: 0 }, () => {
    const lean = rider.actor.detail.rotation.x
    for (const leg of rider.actor.legs) assert.ok(Math.abs(leg.rotation.x + lean - RIDE_LEGS.hip) < 1e-9)
    rider.root.updateMatrixWorld(true)
    const hip = rider.actor.legs[0].getWorldPosition(new THREE.Vector3())
    assert.ok(Math.abs(hip.y - BODY.legR - RIDE.seatTop) < 0.03, `đáy đùi ${(hip.y - BODY.legR).toFixed(3)} so với mặt đệm ${RIDE.seatTop}`)
    const foot = rider.actor.knees[0].localToWorld(new THREE.Vector3(0, -BODY.shinLen - 0.02, 0.06))
    const sole = foot.y - BODY.footR * 0.6
    assert.ok(sole > 0.02 && sole < 0.08, `đế giày ở ${sole.toFixed(3)} m (chỗ để chân cao 0,032 m)`)
  })
})

test('dừng gấp khi đang chạy: tay giữ vành (phanh), thân ngả sau', () => {
  const rider = makeRider()
  const state = newRideState()
  run(rider, state, 2, { speed: 6, turnRate: 0, accel: 0 })
  run(rider, state, 0.25, { speed: 3, turnRate: 0, accel: -12 })
  assert.ok(state.brake > 0.8)
  assert.ok(rider.actor.detail.rotation.x < PUSH.leanRest)
})

test('chu kỳ đẩy liền mạch (không giật ở chỗ nhả tay và chỗ bắt vành)', () => {
  for (const u of [PUSH.contact, 0]) {
    const a = pushCycle(u - 1e-4)
    const b = pushCycle(u + 1e-4)
    assert.ok(Math.abs(a.angle - b.angle) < 1e-2 && Math.abs(a.lean - b.lean) < 1e-2 && Math.abs(a.lift - b.lift) < 1e-2)
  }
})

test('ăn mừng (nâng xe): vào/ra mượt, giơ xe lên quá đầu, nhảy đúng 2 lần, cuối cùng xe về chỗ', () => {
  assert.equal(liftPose(-1).weight, 0)
  assert.equal(liftPose(CELEBRATE_DURATION).weight, 0)
  let prev = liftPose(0)
  let maxStep = 0
  let peaks = 0
  let rising = false
  let top = 0
  for (let t = 0; t < CELEBRATE_DURATION; t += 1 / 240) {
    const p = liftPose(t)
    maxStep = Math.max(maxStep, p.chair.distanceTo(prev.chair), Math.abs(p.hop - prev.hop), Math.abs(p.stand - prev.stand))
    if (p.hop < prev.hop && rising) peaks += 1
    rising = p.hop > prev.hop
    top = Math.max(top, p.chair.y)
    prev = p
  }
  assert.ok(maxStep < 0.05, `không giật: bước lớn nhất ${maxStep.toFixed(3)} (1/240 s)`)
  assert.equal(peaks, LIFT.hops)
  assert.ok(top > 1.6, `xe lên tới ${top.toFixed(2)} m`)
  assert.ok(liftPose(0).chair.length() < 1e-9)
  assert.ok(liftPose(CELEBRATE_DURATION - 1e-6).chair.length() < 1e-3)
})

test('ăn mừng trên xe: đứng dậy, hai tay nâng cả xe qua đầu (đệm ghế trên đỉnh đầu), tay luôn nắm xe; xong thì ngồi lại', () => {
  const rider = makeRider()
  const state = newRideState()
  const ride = rider.actor.ride
  let worstHand = 0
  let clearOverhead = Infinity
  let standHip = 0
  for (let t = 0; t < CELEBRATE_DURATION + 0.2; t += 1 / 60) {
    const c = t < CELEBRATE_DURATION ? t : -1
    animateRide(rider.actor, state, 1 / 60, { speed: 0, turnRate: 0, accel: 0, celebrate: c }, POSE)
    rider.root.updateMatrixWorld(true)
    const p = liftPose(c)
    if (p.weight > 0) {
      for (const i of [0, 1]) {
        const side = rider.actor.arms[i].position.x < 0 ? -1 : 1
        const grip = ride.group.localToWorld(new THREE.Vector3(side * p.grip.x, p.grip.y, p.grip.z))
        worstHand = Math.max(worstHand, handAt(rider, i).distanceTo(grip))
      }
    }
    if (c > LIFT.overhead && c < LIFT.lower) {
      const seat = ride.group.localToWorld(new THREE.Vector3(0, RIDE.seatTop - 0.06, 0))
      const headTop = rider.actor.head.localToWorld(new THREE.Vector3(0, BODY.headR * 2.06, 0))
      clearOverhead = Math.min(clearOverhead, seat.y - headTop.y)
    }
    if (Math.abs(c - (LIFT.overhead + LIFT.hopStart) / 2) < 1 / 120) standHip = rider.actor.legs[0].getWorldPosition(new THREE.Vector3()).y
  }
  assert.ok(worstHand < 0.02, `tay luôn nắm xe (lệch tối đa ${worstHand.toFixed(3)} m)`)
  assert.ok(clearOverhead > 0, `đệm ghế nằm trên đỉnh đầu khi giơ xe (cách ${clearOverhead.toFixed(3)} m)`)
  assert.ok(Math.abs(standHip - BODY.hipY) < 0.05, `đứng thẳng khi giơ xe: hông cao ${standHip.toFixed(2)} m`)
  rider.root.updateMatrixWorld(true)
  assert.ok(ride.group.position.length() < 1e-3, 'xe về chỗ')
  assert.ok(ride.carrier.position.length() < 1e-9)
  const hip = rider.actor.legs[0].getWorldPosition(new THREE.Vector3())
  assert.ok(Math.abs(hip.y - BODY.legR - RIDE.seatTop) < 0.03, 'ngồi lại vào đệm')
})

test('đang ăn mừng dở mà ngồi xuống ghế: xe/người về vị trí gốc', () => {
  const rider = makeRider()
  const state = newRideState()
  animateRide(rider.actor, state, 1 / 60, { speed: 0, turnRate: 0, accel: 0, celebrate: 1 }, POSE)
  assert.ok(rider.actor.ride.group.position.y > 1)
  settleRide(rider.actor.ride)
  assert.ok(rider.actor.ride.group.position.length() < 1e-9)
  assert.ok(rider.actor.ride.carrier.position.length() < 1e-9)
})

test('bình oxi: có mặt nạ thở trùm mũi và miệng, nằm trước mặt; dây thở nối tới đầu nối mặt nạ', () => {
  const head = new THREE.Group()
  const detail = new THREE.Group()
  head.position.y = BODY.headY - BODY.headR
  detail.add(head)
  const root = new THREE.Group()
  root.add(detail)
  const hc = BODY.headR
  addAccessories({ head, detail, rightElbow: new THREE.Group(), root }, { face: 0, carry: 1, ride: 0 }, { headCentre: hc, headR: BODY.headR, stickColor: '#fff' })
  const mask = head.children.find((m) => m.material?.transparent)
  assert.ok(mask, 'có vỏ mặt nạ trong suốt')
  const box = new THREE.Box3().setFromObject(mask)
  assert.ok(box.min.y < hc - 0.15 && box.max.y > hc - 0.05, `trùm từ miệng tới mũi: ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)}`)
  assert.ok(box.max.z > BODY.headR + 0.03, 'nhô ra trước mặt')
  // ống dẫn (gắn ở thân) kết thúc gần đầu nối dưới đáy mặt nạ (gắn ở đầu)
  const hose = detail.children.find((m) => m.geometry?.type === 'TubeGeometry')
  root.updateMatrixWorld(true)
  const end = hose.geometry.parameters.path.getPoint(1)
  const port = new THREE.Vector3(0, hc - 0.1 - 0.085, Math.sqrt(BODY.headR ** 2 - 0.01) - 0.012 + 0.05)
  head.localToWorld(port)
  assert.ok(end.distanceTo(port) < 0.05, `ống thở cách đầu nối ${end.distanceTo(port).toFixed(3)} m`)
})
