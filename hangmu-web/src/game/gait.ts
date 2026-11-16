// Hoạt hình thân người: hàm thuần (không phụ thuộc Three.js) để kiểm thử được bằng số đo.
//
// Nguyên tắc cho cảm giác mượt:
//  - Chu kỳ chân gắn với QUÃNG ĐƯỜNG đã đi (không phải thời gian) nên chân không trượt trên nền.
//  - Mọi chuyển trạng thái (đứng ↔ đi ↔ ngồi) đều là pha trộn có làm mượt, không có "công tắc".
//  - Tốc độ đầu vào được làm mượt trước khi dùng (người khác bị dự đoán lại làm tốc độ nhảy cóc).
//  - Hành động (đấm, bị đấm) là đường cong có chuẩn bị → ra đòn → thu về, chồng lên chuyển động.
// Quy ước dấu giữ nguyên như poseFootballer cũ: tay âm = đưa ra trước; thân dương = chúi về trước.

/** Quãng đường (đơn vị thế giới) cho một chu kỳ chân đầy đủ (hai bước). */
export const CYCLE_LENGTH = 3.4
/** Tốc độ chạy tối đa của người chơi (khớp MOVE_SPEED trong sim.ts). */
export const RUN_SPEED = 8

export interface BodyPose {
  rArm: number
  lArm: number
  rElbow: number
  lElbow: number
  rLeg: number
  lLeg: number
  rKnee: number
  lKnee: number
  /** Chúi thân về trước (+) / ngả ra sau (−). */
  torsoLean: number
  /** Nghiêng thân sang bên khi rẽ. */
  torsoRoll: number
  /** Xoay thân quanh trục dọc (dồn lực khi đấm). */
  torsoTwist: number
  headPitch: number
  headYaw: number
  /** Nhấp nhô lên xuống của cả người. */
  bob: number
  /** Bước tới (+) / lùi (−) dọc hướng nhìn. */
  step: number
}

export interface GaitInput {
  /** Tốc độ ngang hiện tại (đơn vị thế giới / giây). */
  speed: number
  /** Tốc độ quay hướng (rad/s), dương = quay trái. */
  turnRate: number
  /** Gia tốc dọc hướng chạy (đơn vị / giây²). */
  accel: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1)
const smoothstep = (t: number) => {
  const k = clamp(t, 0, 1)
  return k * k * (3 - 2 * k)
}
/** Hệ số làm mượt mũ độc lập tốc độ khung hình. */
const alpha = (dt: number, tau: number) => 1 - Math.exp(-dt / tau)

// ---------------- hành động: đấm ----------------
export const PUNCH_DURATION = 0.44

export interface ActionCurve {
  /** 0..1: mức hành động chi phối cánh tay/thân so với chuyển động thường. */
  weight: number
  arm: number
  elbow: number
  twist: number
  step: number
  lean: number
}

/**
 * Đường cong cú đấm theo thời gian t (giây): chuẩn bị 0–0,07 (kéo tay ra sau), ra đòn 0,07–0,16 (duỗi tay, lao tới),
 * giữ 0,16–0,22, thu về 0,22–0,44.
 */
/** Hệ số đổi bước chúi của đường cong (đv của khớp) sang mét dịch cả người khi hiển thị. */
export const LUNGE_SCALE = 1.6
export const KNOCK_SCALE = 2.2

export type PunchKind = 'hit' | 'miss'
/** Đấm hụt (vung vào không khí) kéo dài hơn: tay vung quá đà, mất thăng bằng, thu về chậm. */
export const MISS_DURATION = 0.6
export const punchDuration = (kind: PunchKind): number => (kind === 'miss' ? MISS_DURATION : PUNCH_DURATION)

/** Đường cong cú đấm hụt: cùng đoạn chuẩn bị và ra đòn nhưng không có điểm tựa — vung quá đà (tay −1,9, xoay thân 0,6, chúi và bước lố), rồi thu về chậm. */
function missCurve(t: number): ActionCurve {
  if (t < 0 || t >= MISS_DURATION) return { weight: 0, arm: 0, elbow: 0, twist: 0, step: 0, lean: 0 }
  if (t < 0.07) {
    const k = smoothstep(t / 0.07)
    return { weight: k, arm: lerp(0, 0.8, k), elbow: lerp(-0.25, -0.9, k), twist: -0.25 * k, step: -0.06 * k, lean: -0.08 * k }
  }
  if (t < 0.16) {
    const k = smoothstep((t - 0.07) / 0.09)
    return { weight: 1, arm: lerp(0.8, -1.9, k), elbow: lerp(-0.9, -0.02, k), twist: lerp(-0.25, 0.55, k), step: lerp(-0.06, 0.4, k), lean: lerp(-0.08, 0.3, k) }
  }
  if (t < 0.26) {
    const k = smoothstep((t - 0.16) / 0.1) // quán tính: không có gì chặn nên tay đi tiếp, thân chúi thêm
    return { weight: 1, arm: lerp(-1.9, -2.05, k), elbow: -0.02, twist: lerp(0.55, 0.62, k), step: lerp(0.4, 0.46, k), lean: lerp(0.3, 0.36, k) }
  }
  const k = smoothstep((t - 0.26) / (MISS_DURATION - 0.26))
  return { weight: 1 - k, arm: lerp(-2.05, 0, k), elbow: lerp(-0.02, -0.25, k), twist: lerp(0.62, 0, k), step: lerp(0.46, 0, k), lean: lerp(0.36, 0, k) }
}

export function punchCurve(t: number, kind: PunchKind = 'hit'): ActionCurve {
  if (kind === 'miss') return missCurve(t)
  if (t < 0 || t >= PUNCH_DURATION) return { weight: 0, arm: 0, elbow: 0, twist: 0, step: 0, lean: 0 }
  if (t < 0.07) {
    const k = smoothstep(t / 0.07)
    return { weight: k, arm: lerp(0, 0.8, k), elbow: lerp(-0.25, -0.9, k), twist: -0.25 * k, step: -0.06 * k, lean: -0.08 * k }
  }
  if (t < 0.16) {
    const k = smoothstep((t - 0.07) / 0.09)
    return { weight: 1, arm: lerp(0.8, -1.6, k), elbow: lerp(-0.9, -0.05, k), twist: lerp(-0.25, 0.35, k), step: lerp(-0.06, 0.25, k), lean: lerp(-0.08, 0.2, k) }
  }
  if (t < 0.22) return { weight: 1, arm: -1.6 + (t - 0.16) * 0.8, elbow: -0.05, twist: 0.35, step: 0.25, lean: 0.2 }
  const k = smoothstep((t - 0.22) / (PUNCH_DURATION - 0.22))
  return { weight: 1 - k, arm: lerp(-1.55, 0, k), elbow: lerp(-0.05, -0.25, k), twist: lerp(0.35, 0, k), step: lerp(0.25, 0, k), lean: lerp(0.2, 0, k) }
}

// ---------------- hành động: bị đấm ----------------
export const HIT_DURATION = 0.7

/** Phản ứng khi trúng đòn: đầu ngửa, thân ngả, bật lùi rồi hồi dần. */
export function hitCurve(t: number): { head: number; lean: number; step: number; arms: number; twist: number; roll: number } {
  if (t < 0 || t >= HIT_DURATION) return { head: 0, lean: 0, step: 0, arms: 0, twist: 0, roll: 0 }
  const rise = smoothstep(t / 0.04) // vào nhanh để cảm giác "trúng"
  const fall = Math.exp(-t / 0.18)
  // twist/roll: thân bị hất sang bên đối diện người đấm (nhân với hướng đòn ở Gait.hit)
  return { head: -0.5 * rise * fall, lean: -0.4 * rise * fall, step: -0.26 * rise * Math.exp(-t / 0.15), arms: 0.35 * rise * fall, twist: 0.35 * rise * fall, roll: 0.18 * rise * fall }
}

// ---------------- ăn mừng ----------------
/** Thời gian ăn mừng (s): 2,4 s + 3 s theo yêu cầu (động tác cũ hơi nhanh). */
export const CELEBRATE_DURATION = 5.4

/** Trọng số 0..1 của động tác ăn mừng theo thời gian: vào nhanh, giữ, thu về mượt. */
export function celebrateWeight(t: number): number {
  if (t < 0 || t >= CELEBRATE_DURATION) return 0
  if (t < 0.18) return smoothstep(t / 0.18)
  if (t > CELEBRATE_DURATION - 0.4) return smoothstep((CELEBRATE_DURATION - t) / 0.4)
  return 1
}

// ---------------- tư thế ngồi ----------------------
// Quy ước dấu của tư thế (xem đầu tệp): với chân và tay, góc ÂM đưa ra phía trước (mặt nhân vật quay về +z cục bộ). Ngồi: đùi duỗi ra phía trước
// (âm), cẳng chân gập xuống (dương: gập đầu gối), tay đặt hơi ra trước. Bản cũ để dấu ngược nên đùi chĩa ra SAU lưng và gối gập sai chiều:
// người chơi đứng "trong" ghế chứ không ngồi.
export const SEATED = { legs: -1.25, knees: 1.35, arm: -0.25, elbow: -0.6, head: 0.15 }

export class Gait {
  /** Pha chu kỳ chân (rad), tăng theo quãng đường. */
  phase: number
  private clock = 0
  private speed = 0
  private walk = 0
  private lean = 0
  private roll = 0
  private seat = 0
  private seatSm = 0
  private seated = false
  private punchT = -1
  private hitT = -1
  private celebrateT = -1
  private celebrateW = 0
  private punchWeight = 0
  private punchKind: PunchKind = 'hit'
  private hitFront = 1
  private hitSide = 0
  /** Giá trị đường cong đấm đã làm mượt (để đấm lại giữa chừng không bị nhảy góc). */
  private punchSm = { arm: 0, elbow: 0, twist: 0, step: 0, lean: 0 }
  /**
   * Độ dịch cả người (mét, dọc hướng mặt; dương = tiến) chỉ để hiển thị, cộng thêm vào vị trí vẽ: người đấm xô tới khi ra đòn,
   * người bị đấm bị hất lùi/chúi. Camera nhìn từ sau lưng nên tay duỗi thẳng về phía trước gần như bị che; dịch cả người mới thấy rõ.
   */
  lunge = 0
  knock = 0

  constructor(seed = 0) {
    this.phase = (seed * 2.399963) % (Math.PI * 2) // lệch pha giữa các nhân vật để đám đông không bước đồng bộ
  }

  /** Bắt đầu cú đấm (đấm lại giữa chừng thì bắt đầu lại, vẫn liên tục nhờ làm mượt trọng số). */
  punch(kind: PunchKind = 'hit'): void {
    this.punchKind = kind
    // đấm lại khi tay còn đang duỗi: bỏ qua đoạn chuẩn bị để trọng số không tụt về 0 rồi vọt lên (gây giật)
    this.punchT = this.punchWeight > 0.3 ? 0.05 : 0
  }
  /**
   * Bị trúng đòn. `front` = người đấm ở phía trước (+1) hay sau lưng (−1) so với hướng mặt của mình; `side` = bên trái (+1) / phải (−1).
   * Đòn từ trước làm ngửa đầu, ngả ra sau, bật lùi; đòn từ sau làm chúi tới, bước loạng choạng về trước; đòn từ bên làm thân bị hất sang bên đối diện.
   */
  hit(front = 1, side = 0): void {
    this.hitT = 0
    this.hitFront = Number.isFinite(front) ? clamp(front, -1, 1) : 1
    this.hitSide = Number.isFinite(side) ? clamp(side, -1, 1) : 0
  }
  /** Ăn mừng: giơ hai tay lên, nhún nhảy, ngẩng đầu. Đang ăn mừng thì bỏ qua (không giật về đầu động tác). */
  celebrate(): void {
    if (this.isCelebrating) return
    this.celebrateT = 0
  }
  /** Số giây kể từ lúc bắt đầu ăn mừng (−1: không ăn mừng). */
  get celebrateTime(): number {
    return this.celebrateT
  }
  get isCelebrating(): boolean {
    return this.celebrateT >= 0 && this.celebrateT < CELEBRATE_DURATION
  }
  setSeated(seated: boolean): void {
    this.seated = seated
  }
  get isPunching(): boolean {
    return this.punchT >= 0 && this.punchT < punchDuration(this.punchKind)
  }

  update(dtRaw: number, input: GaitInput): BodyPose {
    const dt = clamp(dtRaw, 0, 0.05)
    this.clock += dt

    // 1) làm mượt tốc độ đầu vào (bản ghi mới làm tốc độ nhảy cóc)
    this.speed += (Math.max(0, input.speed) - this.speed) * alpha(dt, 0.07)
    const moving = this.speed > 0.3 && !this.seated
    // 2) pha chu kỳ gắn với quãng đường: chân không trượt
    if (moving) this.phase = (this.phase + (this.speed / CYCLE_LENGTH) * Math.PI * 2 * dt) % (Math.PI * 2)
    // 3) các hệ số pha trộn (mượt, vào nhanh hơn ra một chút)
    const walkTarget = moving ? 1 : 0
    this.walk += (walkTarget - this.walk) * alpha(dt, walkTarget > this.walk ? 0.06 : 0.12)
    const s = clamp(this.speed / RUN_SPEED, 0, 1)
    const amp = (0.3 + 0.7 * s) * this.walk

    // 4) chúi theo tốc độ + gia tốc, nghiêng khi rẽ
    const leanTarget = (0.16 * s + clamp(input.accel * 0.01, -0.1, 0.1)) * (this.seated ? 0 : 1)
    this.lean += (leanTarget - this.lean) * alpha(dt, 0.12)
    const rollTarget = clamp(input.turnRate * 0.03, -0.14, 0.14) * s
    this.roll += (rollTarget - this.roll) * alpha(dt, 0.1)
    // hai tầng làm mượt nối tiếp: vận tốc bắt đầu từ 0 nên ngồi/đứng dậy không bị giật ở khung đầu
    this.seat += ((this.seated ? 1 : 0) - this.seat) * alpha(dt, 0.08)
    this.seatSm += (this.seat - this.seatSm) * alpha(dt, 0.08)

    // 5) bước chạy
    const sw = Math.sin(this.phase)
    const swing = sw * 1.0 * amp
    const breathe = Math.sin(this.clock * 1.7) * (1 - this.walk)
    const run: BodyPose = {
      rArm: -swing * 0.8,
      lArm: swing * 0.8,
      rElbow: -(0.25 + 0.55 * s * this.walk) - Math.max(0, -sw) * 0.25 * amp,
      lElbow: -(0.25 + 0.55 * s * this.walk) - Math.max(0, sw) * 0.25 * amp,
      rLeg: swing,
      lLeg: -swing,
      rKnee: Math.max(0, sw) * (0.2 + 0.7 * s) * this.walk,
      lKnee: Math.max(0, -sw) * (0.2 + 0.7 * s) * this.walk,
      torsoLean: this.lean + breathe * 0.015,
      torsoRoll: this.roll,
      torsoTwist: 0,
      headPitch: 0.05 * this.walk + breathe * 0.04,
      headYaw: Math.sin(this.clock * 0.5) * 0.18 * (1 - this.walk) * (1 - this.seat),
      bob: Math.abs(Math.sin(this.phase)) * 0.05 * s * this.walk + breathe * 0.01,
      step: 0,
    }

    // 6) hành động chồng lên
    if (this.punchT >= 0) {
      this.punchT += dt
      if (this.punchT >= punchDuration(this.punchKind)) this.punchT = -1
    }
    const punch = punchCurve(this.punchT, this.punchKind)
    this.punchWeight += (punch.weight - this.punchWeight) * alpha(dt, 0.025) // chuyển mượt kể cả khi đấm lại giữa chừng
    const w = this.punchWeight
    const pa = alpha(dt, 0.03)
    const sm = this.punchSm
    // giới hạn tốc độ quay (≈ cú ra đòn nhanh nhất, 27 rad/s) để đấm lại giữa chừng không làm tay bật tức thời
    const maxSlew = 30 * dt
    sm.arm += clamp((punch.arm - sm.arm) * pa, -maxSlew, maxSlew)
    sm.elbow += (punch.elbow - sm.elbow) * pa
    sm.twist += (punch.twist - sm.twist) * pa
    sm.step += (punch.step - sm.step) * pa
    sm.lean += (punch.lean - sm.lean) * pa
    run.rArm = lerp(run.rArm, sm.arm, w)
    run.rElbow = lerp(run.rElbow, sm.elbow, w)
    run.torsoTwist = sm.twist * w
    run.step += sm.step * w
    run.torsoLean += sm.lean * w
    // tay trái giơ lên che mặt khi tay phải ra đòn (đúng luật giao lưu: tay trái đỡ, tay phải đấm)
    run.lArm = lerp(run.lArm, -0.9, 0.55 * w)
    run.lElbow = lerp(run.lElbow, -1.3, 0.55 * w)

    if (this.hitT >= 0) {
      this.hitT += dt
      if (this.hitT >= HIT_DURATION) this.hitT = -1
    }
    const hit = hitCurve(this.hitT)
    // độ mạnh tối thiểu 0,55 để đòn từ bên hông vẫn thấy rõ; hướng quyết định chiều ngả
    const mag = 0.55 + 0.45 * Math.abs(this.hitFront)
    const dir = Math.abs(this.hitFront) < 0.15 ? 1 : Math.sign(this.hitFront)
    run.headPitch += hit.head * dir * mag
    run.torsoLean += hit.lean * dir * mag
    run.step += hit.step * dir * mag
    run.torsoTwist += hit.twist * this.hitSide * -1
    run.torsoRoll -= hit.roll * this.hitSide // roll dương = nghiêng sang trái; bị đánh từ bên trái thì ngả sang phải
    run.rArm += hit.arms
    run.lArm += hit.arms
    this.lunge = sm.step * w * LUNGE_SCALE
    this.knock = hit.step * dir * mag * KNOCK_SCALE

    // ăn mừng chồng lên (trừ khi đang ngồi hay đang đấm)
    if (this.celebrateT >= 0) {
      this.celebrateT += dt
      if (this.celebrateT >= CELEBRATE_DURATION) this.celebrateT = -1
    }
    const cw = celebrateWeight(this.celebrateT)
    this.celebrateW += (cw - this.celebrateW) * alpha(dt, 0.03)
    if (this.celebrateW > 0.001) {
      const c = this.celebrateW * (1 - this.seat) * (1 - w)
      const wave = Math.sin(this.clock * 11) * 0.35
      run.rArm = lerp(run.rArm, -2.7 + wave, c)
      run.lArm = lerp(run.lArm, -2.7 - wave, c)
      run.rElbow = lerp(run.rElbow, -0.15, c)
      run.lElbow = lerp(run.lElbow, -0.15, c)
      run.headPitch = lerp(run.headPitch, -0.25, c)
      run.torsoLean = lerp(run.torsoLean, -0.08, c)
      run.bob += Math.abs(Math.sin(this.clock * 9)) * 0.2 * c
    }

    // 7) pha trộn với tư thế ngồi
    const q = this.seatSm
    if (q > 0) {
      run.rLeg = lerp(run.rLeg, SEATED.legs, q)
      run.lLeg = lerp(run.lLeg, SEATED.legs, q)
      run.rKnee = lerp(run.rKnee, SEATED.knees, q)
      run.lKnee = lerp(run.lKnee, SEATED.knees, q)
      run.rArm = lerp(run.rArm, SEATED.arm, q * (1 - w))
      run.lArm = lerp(run.lArm, SEATED.arm, q)
      run.rElbow = lerp(run.rElbow, SEATED.elbow, q * (1 - w))
      run.lElbow = lerp(run.lElbow, SEATED.elbow, q)
      run.headPitch = lerp(run.headPitch, SEATED.head, q)
      run.bob *= 1 - q
    }
    return run
  }
}

/** Làm mượt từng góc của một tư thế về phía tư thế đích (dùng cho võ sĩ trên sàn đấu). */
export function smoothTowards<T extends object>(current: T, target: T, dtSec: number, tauSec: number): T {
  const a = alpha(clamp(dtSec, 0, 0.1), Math.max(1e-4, tauSec))
  const out = { ...current } as Record<string, number>
  for (const key of Object.keys(target)) {
    const from = (current as Record<string, number>)[key] ?? (target as Record<string, number>)[key]!
    out[key] = from + ((target as Record<string, number>)[key]! - from) * a
  }
  return out as unknown as T
}
