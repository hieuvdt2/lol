// Chuyển động người ngồi xe lăn, mô phỏng theo cách người thật tự đẩy xe:
// - Mỗi nhịp đẩy: hai tay bắt vành đẩy ở phía sau đỉnh bánh, đẩy vòng về phía trước tới ~40° trước đỉnh rồi nhả (≈40% chu kỳ);
//   thân gập người về trước theo lực đẩy. Phần còn lại tay nhấc lên vòng qua phía trên vành về chỗ bắt, thân ngả lại.
// - Bàn tay bám đúng vành đẩy nhờ IK hai đoạn (vai → khuỷu → bàn tay).
// - Rẽ: hai bánh lăn khác nhau (bánh ngoài nhanh, bánh trong chậm hoặc lăn lùi khi xoay tại chỗ); tay bên nào bánh lăn lùi thì kéo ngược.
// - Bánh trước xoay theo hướng chuyển động của chính nó (có độ trễ) và lăn theo quãng đường.
// - Đứng yên: hai tay đặt hờ trên vành; đang chạy mà dừng lại thì tay giữ vành (phanh), thân hơi ngả sau.
// - Ăn mừng: đứng dậy, hai tay nâng cả chiếc xe lăn lên quá đầu như nâng cúp (đỡ ở đáy hai bánh lớn), nhún nâng xe và nhảy, rồi hạ xe ngồi lại.
import * as THREE from 'three'
import { RIDE } from './accessories.ts'
import type { Ride } from './accessories.ts'
import { BODY } from './person.ts'
import { CELEBRATE_DURATION } from './gait.ts'
import type { BodyPose } from './gait.ts'

/** Đoạn vai → khuỷu và khuỷu → tâm bàn tay (khớp với hình trong person.ts). */
export const ARM = { upper: BODY.upperArmLen, fore: BODY.foreArmLen + BODY.handR * 0.4 }

/** Góc trên vành đẩy, tính từ đỉnh bánh (rad; dương = phía trước). */
export const PUSH = {
  catch: -0.35,
  release: 0.7,
  /** tay đặt hờ khi đứng yên / giữ vành khi phanh */
  rest: 0.15,
  /** phần chu kỳ tay bám vành (còn lại là thu tay về) */
  contact: 0.42,
  /** nghiêng thân lúc bắt vành / cuối nhịp đẩy */
  leanCatch: 0.12,
  leanRelease: 0.4,
  leanRest: 0.06,
}
/** Tư thế chân khi ngồi xe (so với phương thẳng đứng, không phụ thuộc thân nghiêng): đùi gần ngang, cẳng chân duỗi ra trước xuống chỗ để chân. */
export const RIDE_LEGS = { hip: -1.57, knee: 0.92 }

export interface RideState {
  /** pha chu kỳ đẩy (0..1) */
  phase: number
  /** mức đang đẩy (0 = đứng yên, 1 = đẩy đều) của từng tay [phải, trái] */
  drive: [number, number]
  /** chiều đẩy từng tay (1 tới, −1 lùi) */
  dir: [number, number]
  brake: number
  lean: number
  casterYaw: number
}

export const newRideState = (): RideState => ({ phase: 0, drive: [0, 0], dir: [1, 1], brake: 0, lean: PUSH.leanRest, casterYaw: 0 })

export interface RideInput {
  /** tốc độ tiến (m/s, ≥ 0) */
  speed: number
  /** tốc độ quay (rad/s, dương = rẽ trái) */
  turnRate: number
  /** gia tốc tiến (m/s²) */
  accel: number
  /** số giây kể từ lúc bắt đầu ăn mừng (−1 / bỏ trống: không ăn mừng) */
  celebrate?: number
}

/**
 * Ăn mừng trên xe lăn: đứng dậy và nâng cả chiếc xe lên quá đầu như nâng cúp.
 * Tay chibi giơ thẳng chỉ tới ~1,75 m (đỉnh đầu 1,91 m) nên tay đỡ ở đáy hai bánh lớn: hai bánh nằm ngoài bề ngang của đầu,
 * đệm ghế nằm trên đỉnh đầu. Mốc động tác (giây, tổng CELEBRATE_DURATION = 5,4 s):
 */
export const LIFT = {
  /** đứng dậy, nhấc xe khỏi đất (tay vẫn nắm vành) */
  stand: 0.32,
  /** xe lên ngang ngực */
  chest: 0.55,
  /** xe lên quá đầu */
  overhead: 0.8,
  /** bắt đầu hạ xe xuống (0,58 s trước khi hết ăn mừng) */
  lower: CELEBRATE_DURATION - 0.58,
  /** nhảy khi đang giơ xe: bắt đầu, số lần, thời gian mỗi lần, độ cao; hết nhảy thì nhún xe lên xuống tới lúc hạ */
  hopStart: 0.84,
  hops: 5,
  hopTime: 0.55,
  hopHeight: 0.2,
}

/** Mốc vị trí: tay (khung nhóm người + xe) và điểm nắm trên xe (khung xe) — nên vị trí xe = tay − điểm nắm. Toạ độ cho tay bên +x. */
interface LiftKey {
  hand: THREE.Vector3
  grip: THREE.Vector3
  /** mức đứng dậy (0 ngồi, 1 đứng thẳng) */
  stand: number
}

const keyAt = (handY: number, handZ: number, gripAngle: number, gripR: number, gripX: number, stand: number, handX = gripX): LiftKey => ({
  hand: new THREE.Vector3(handX, handY, handZ),
  grip: new THREE.Vector3(gripX, RIDE.wheelR + gripR * Math.cos(gripAngle), RIDE.axleZ + gripR * Math.sin(gripAngle)),
  stand,
})

const RIM_X = RIDE.wheelX + RIDE.rimOut + 0.012
const RIM_HAND = RIDE.rimR + 0.03
/** Mốc: ngồi (tay đặt trên vành), đứng nhấc xe, xe ngang ngực, xe quá đầu (tay đỡ đáy bánh). */
const LIFT_KEYS: LiftKey[] = (() => {
  const shoulderY = BODY.shoulderY
  const reach = ARM.upper + ARM.fore - 0.035 // chừa khoảng với: thân hơi ngả / khuỵu gối khi nhảy
  const armAt = (pitch: number) => ({ y: shoulderY - reach * Math.cos(pitch), z: reach * Math.sin(pitch) })
  const rest = keyAt(0, 0, PUSH.rest, RIM_HAND, RIM_X, 0)
  rest.hand.copy(rest.grip) // ngồi: xe ở chỗ cũ, tay đúng điểm nắm
  const low = armAt(0.5)
  const mid = armAt(1.6)
  const top = armAt(Math.PI - 0.22)
  return [
    rest,
    keyAt(low.y, low.z, PUSH.rest, RIM_HAND, RIM_X, 1),
    keyAt(mid.y, mid.z, Math.PI / 2, RIM_HAND, RIM_X, 1),
    keyAt(top.y, top.z, Math.PI, RIDE.wheelR + 0.06, RIDE.wheelX, 1, BODY.shoulderX + 0.03),
  ]
})()

export interface LiftPose {
  /** đang ăn mừng (0..1, vào/ra mượt) */
  weight: number
  /** mức đứng dậy (0..1) */
  stand: number
  /** vị trí xe so với chỗ để trên đất (khung nhóm người + xe) */
  chair: THREE.Vector3
  /** điểm tay nắm trên xe (khung xe, cho tay bên +x) */
  grip: THREE.Vector3
  /** mức giơ cao (0..1): ngửa mặt nhìn xe */
  raised: number
  /** độ cao nhảy (m) và mức khuỵu gối (0..1) */
  hop: number
  crouch: number
}

/** Tư thế ăn mừng nâng xe tại thời điểm `t` (s). */
export function liftPose(t: number): LiftPose {
  const none = { weight: 0, stand: 0, chair: new THREE.Vector3(), grip: LIFT_KEYS[0]!.grip.clone(), raised: 0, hop: 0, crouch: 0 }
  if (!(t >= 0) || t >= CELEBRATE_DURATION) return none
  // thời điểm các mốc: lên 0 → 1 → 2 → 3, giữ, rồi xuống 3 → 2 → 1 → 0 (đối xứng)
  const down = CELEBRATE_DURATION - LIFT.lower
  const up = [0, LIFT.stand, LIFT.chest, LIFT.overhead]
  const dn = [CELEBRATE_DURATION, LIFT.lower + down * 0.75, LIFT.lower + down * 0.4, LIFT.lower]
  let a = 3
  let b = 3
  let f = 0
  if (t < LIFT.overhead) {
    for (let i = 0; i < 3; i += 1) if (t >= up[i]! && t < up[i + 1]!) [a, b, f] = [i, i + 1, smooth((t - up[i]!) / (up[i + 1]! - up[i]!))]
  } else if (t >= LIFT.lower) {
    for (let i = 3; i > 0; i -= 1) if (t >= dn[i]! && t < dn[i - 1]!) [a, b, f] = [i, i - 1, smooth((t - dn[i]!) / (dn[i - 1]! - dn[i]!))]
  }
  const A = LIFT_KEYS[a]!
  const B = LIFT_KEYS[b]!
  const hand = A.hand.clone().lerp(B.hand, f)
  const grip = A.grip.clone().lerp(B.grip, f)
  const stand = A.stand + (B.stand - A.stand) * f
  const raised = Math.min(1, Math.max(0, (a + (b - a) * f - 1) / 2))
  // nhảy khi đang giơ xe; nhún xe lên xuống như nâng cúp
  const k = (t - LIFT.hopStart) / LIFT.hopTime
  let hop = 0
  let crouch = 0
  let pump = 0
  if (k >= 0 && k < LIFT.hops) {
    const g = k % 1
    const arc = 4 * g * (1 - g)
    const edge = Math.min(smooth(k / 0.25), smooth((LIFT.hops - k) / 0.25))
    hop = LIFT.hopHeight * arc
    crouch = (1 - arc) * edge
    pump = 0.04 * crouch // tay hạ xe một chút lúc lấy đà rồi đẩy lên (ít hơn độ hạ người để đệm ghế không chạm đầu)
  } else if (k >= LIFT.hops && t < LIFT.lower) {
    // hết nhảy: đứng giơ xe, nhún xe như nâng cúp
    // nhún gối và nhún xe cùng lúc (đầu hạ theo xe, đệm ghế không chạm đầu)
    const q = (k - LIFT.hops) * LIFT.hopTime
    const bounce = (0.5 - 0.5 * Math.cos((Math.PI * 2 * q) / 0.6)) * Math.min(1, q / 0.3, (LIFT.lower - t) / 0.3)
    crouch = 0.8 * bounce
    pump = 0.04 * bounce
  }
  const chair = hand.clone().sub(grip)
  chair.x = 0
  chair.y -= pump
  return { weight: 1, stand, chair, grip, raised, hop, crouch }
}

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}
const approach = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt))

/** Nửa khoảng cách hai bánh lớn (m). */
const HALF_TRACK = RIDE.wheelX
/** Trục xoay bánh trước cách trục bánh lớn (m). */
const CASTER_LEVER = RIDE.casterZ - RIDE.axleZ

/** Tần số đẩy (nhịp/giây) theo tốc độ bánh: chậm ~0,7 nhịp/s, nhanh tối đa 1,5 nhịp/s. */
export const pushRate = (wheelSpeed: number): number => Math.min(1.5, 0.55 + Math.abs(wheelSpeed) * 0.13)

/**
 * Góc tay trên vành và độ nhấc khỏi vành tại pha `u` (0..1) của chu kỳ đẩy tới.
 * `lift` > 0: tay rời vành, vòng phía trên (m, cộng thêm vào bán kính).
 */
export function pushCycle(u: number): { angle: number; lift: number; lean: number } {
  const t = ((u % 1) + 1) % 1
  if (t < PUSH.contact) {
    const s = smooth(t / PUSH.contact)
    return { angle: PUSH.catch + (PUSH.release - PUSH.catch) * s, lift: 0, lean: PUSH.leanCatch + (PUSH.leanRelease - PUSH.leanCatch) * s }
  }
  const r = (t - PUSH.contact) / (1 - PUSH.contact)
  const s = smooth(r)
  return { angle: PUSH.release + (PUSH.catch - PUSH.release) * s, lift: 0.09 * Math.sin(Math.PI * r), lean: PUSH.leanRelease + (PUSH.leanCatch - PUSH.leanRelease) * s }
}

/** Tâm bàn tay khi bám vành ở góc `angle` (khung gốc nhân vật). `side` 1 = trái (+x), −1 = phải. */
export function rimPoint(side: number, angle: number, lift = 0): THREE.Vector3 {
  const r = RIDE.rimR + 0.03 + lift // tâm bàn tay nằm trên mặt vành
  return new THREE.Vector3(side * (RIDE.wheelX + RIDE.rimOut + 0.012 + lift * 0.4), RIDE.wheelR + r * Math.cos(angle), RIDE.axleZ + r * Math.sin(angle))
}

/**
 * IK hai đoạn cho tay: từ vai (khung cha của vai) tới điểm `target` (cùng khung).
 * Trả về góc xoay vai (x: gập tới/lùi, z: dang ra) và góc khuỷu (âm = gập cẳng tay về trước), theo quy ước Euler XYZ của three.js.
 * `reach`: khoảng cách tới đích sau khi đặt góc (≤ tổng chiều dài tay; nhỏ hơn khoảng cách thật nếu đích xa quá).
 */
export function solveArm(shoulder: THREE.Vector3, target: THREE.Vector3): { pitch: number; roll: number; elbow: number; reach: number } {
  const D = target.clone().sub(shoulder)
  const max = ARM.upper + ARM.fore - 1e-3
  const min = Math.abs(ARM.upper - ARM.fore) + 0.02
  const d = Math.min(max, Math.max(min, D.length()))
  if (D.lengthSq() < 1e-9) D.set(0, -1, 0)
  D.setLength(d)
  const cosB = (d * d - ARM.upper ** 2 - ARM.fore ** 2) / (2 * ARM.upper * ARM.fore)
  const bend = Math.acos(Math.min(1, Math.max(-1, cosB)))
  // vị trí bàn tay trong khung vai trước khi xoay vai: (0, hy, hz)
  const hy = -(ARM.upper + ARM.fore * Math.cos(bend))
  const hz = ARM.fore * Math.sin(bend)
  const roll = Math.asin(Math.min(1, Math.max(-1, D.x / -hy)))
  const y1 = hy * Math.cos(roll)
  const pitch = Math.atan2(D.z, D.y) - Math.atan2(hz, y1)
  return { pitch, roll, elbow: -bend, reach: d }
}

const tmpMatrix = new THREE.Matrix4()

export interface RideActor {
  ride: Ride | null
  detail: THREE.Object3D
  head: THREE.Object3D
  arms: [THREE.Object3D, THREE.Object3D]
  elbows: [THREE.Object3D, THREE.Object3D]
  legs: [THREE.Object3D, THREE.Object3D]
  knees: [THREE.Object3D, THREE.Object3D]
}

/**
 * Áp tư thế ngồi xe lăn lên nhân vật (gọi sau applyBodyPose) và quay bánh xe.
 * `freeArms` theo thứ tự `actor.arms`: tay nào đang bận (đấm / ăn mừng) thì để nguyên tư thế của dáng đi.
 */
export function animateRide(actor: RideActor, state: RideState, dt: number, input: RideInput, pose: BodyPose, freeArms: [boolean, boolean] = [true, true]): void {
  const ride = actor.ride
  if (!ride) return
  const step = Math.max(0, Math.min(0.1, dt))
  // --- bánh lớn: lăn vi sai theo tốc độ tiến và tốc độ quay
  const wheelSpeed: [number, number] = [input.speed + input.turnRate * HALF_TRACK, input.speed - input.turnRate * HALF_TRACK] // [phải, trái]
  const grounded = (input.celebrate ?? -1) >= 0 ? 0 : 1 // đang nâng xe: bánh không lăn theo đường đi
  for (const i of [0, 1] as const) ride.wheels[i].rotation.x += (wheelSpeed[i] * step * grounded) / RIDE.wheelR
  // --- bánh trước: xoay theo hướng chuyển động của trục bánh trước, lăn theo quãng đường
  const lateral = input.turnRate * CASTER_LEVER
  const travel = Math.hypot(lateral, input.speed)
  if (travel > 0.05) state.casterYaw = approach(state.casterYaw, Math.atan2(lateral, input.speed), 9, step)
  for (const c of ride.casters) {
    c.swivel.rotation.y = state.casterYaw
    c.wheel.rotation.x += (travel * step * grounded) / RIDE.casterR
  }
  // --- nhịp đẩy
  const fastest = Math.max(Math.abs(wheelSpeed[0]), Math.abs(wheelSpeed[1]))
  state.phase = (state.phase + pushRate(fastest) * step) % 1
  for (const i of [0, 1] as const) {
    const want = Math.min(1, Math.abs(wheelSpeed[i]) / 1.2)
    state.drive[i] = approach(state.drive[i], want, want > state.drive[i] ? 6 : 4, step)
    if (Math.abs(wheelSpeed[i]) > 0.2) state.dir[i] = wheelSpeed[i] >= 0 ? 1 : -1
  }
  const braking = input.accel < -3 && input.speed > 0.3 ? 1 : 0
  state.brake = approach(state.brake, braking, braking ? 10 : 3, step)
  const cycle = pushCycle(state.phase)
  const party = liftPose(input.celebrate ?? -1)
  const drive = Math.max(state.drive[0], state.drive[1]) * (1 - state.brake)
  const rideLean = PUSH.leanRest + (cycle.lean - PUSH.leanRest) * drive - 0.1 * state.brake
  // ăn mừng: đứng thẳng, hơi ngả ra sau khi giơ xe; khuỵu gối lấy đà mỗi lần nhảy
  const wantLean = rideLean + (-0.02 * party.raised + 0.1 * party.crouch - rideLean) * party.stand
  state.lean = approach(state.lean, wantLean, 14, step)
  // xe: nhấc theo tay (bánh không lăn khi đã rời đất); cả người + xe nhảy cùng nhau
  const carrier = ride.carrier
  carrier.rotation.x = 0
  carrier.position.set(0, party.hop, 0)
  ride.group.position.copy(party.chair)
  ride.group.rotation.z = 0.05 * party.raised * Math.sin((input.celebrate ?? 0) * 9) // lắc nhẹ trên cao
  ride.group.updateMatrix()
  // --- thân: hạ thấp vào ghế, gập theo nhịp đẩy (cộng thêm nghiêng do dáng đi, ví dụ bị đấm); quay quanh hông
  const lean = state.lean + pose.torsoLean
  const d = actor.detail
  d.rotation.x = lean
  // đứng dậy (ăn mừng): hết hạ người, chân duỗi thẳng; khuỵu gối thì hạ người theo
  const st = party.stand
  const kneeBend = 0.8 * party.crouch * st
  const sink = BODY.thighLen * (1 - Math.cos(kneeBend / 2)) + BODY.shinLen * (1 - Math.cos(kneeBend / 2))
  d.position.set(0, pose.bob - RIDE.drop * (1 - st) - sink + BODY.hipY * (1 - Math.cos(lean)), -BODY.hipY * Math.sin(lean))
  // chân: ngồi thì giữ trên chỗ để chân dù thân nghiêng; đứng thì thẳng dưới hông
  for (const leg of actor.legs) leg.rotation.x = RIDE_LEGS.hip * (1 - st) - kneeBend / 2 - lean
  for (const knee of actor.knees) knee.rotation.x = RIDE_LEGS.knee * (1 - st) + kneeBend
  // đầu: nhìn thẳng phía trước dù thân gập; giơ xe thì ngửa nhìn xe, hò reo
  actor.head.rotation.x = pose.headPitch * 0.4 - state.lean * 0.75 + (-0.45 + 0.1 * Math.sin((input.celebrate ?? 0) * 14)) * party.raised
  // --- tay: IK tới điểm trên vành đẩy
  d.updateMatrix()
  tmpMatrix.copy(d.matrix).invert()
  for (const i of [0, 1] as const) {
    if (!freeArms[i]) continue
    const arm = actor.arms[i]
    const side = arm.position.x < 0 ? -1 : 1
    const k = side < 0 ? 0 : 1 // bánh cùng bên (chỉ số trong wheelSpeed/drive/dir)
    const w = state.drive[k] * (1 - state.brake)
    const forward = state.dir[k] >= 0
    const angle = forward ? cycle.angle : PUSH.catch + PUSH.release - cycle.angle
    // ăn mừng: tay nắm điểm trên xe đang nâng (khung xe → khung nhóm → khung thân)
    const target = party.weight > 0
      ? new THREE.Vector3(side * party.grip.x, party.grip.y, party.grip.z).applyMatrix4(ride.group.matrix).applyMatrix4(tmpMatrix)
      : rimPoint(side, PUSH.rest + (angle - PUSH.rest) * w, cycle.lift * w).applyMatrix4(tmpMatrix)
    const sol = solveArm(arm.position, target)
    arm.rotation.set(sol.pitch, 0, sol.roll)
    actor.elbows[i].rotation.x = sol.elbow
  }
}

/** Người ngồi xe đổi sang ngồi ghế (xe cất đi): đặt xe và người về chỗ nếu đang ăn mừng dở. */
export function settleRide(ride: Ride | null): void {
  if (!ride) return
  ride.carrier.rotation.x = 0
  ride.carrier.position.set(0, 0, 0)
  ride.group.position.set(0, 0, 0)
  ride.group.rotation.set(0, 0, 0)
}
