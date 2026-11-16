// Tư thế võ sĩ trên sàn đấu: hàm thuần (không phụ thuộc Three.js) để kiểm thử được.
// Góc tính bằng radian quanh trục ngang của cơ thể; âm = đưa ra phía trước / lên, theo quy ước của poseFootballer.

export type FightPose = 'idle' | 'windup' | 'strike' | 'guard' | 'hurt' | 'hit' | 'block' | 'ko'

export interface PoseAngles {
  rArm: number
  lArm: number
  rElbow: number
  lElbow: number
  rLeg: number
  lLeg: number
  rKnee: number
  lKnee: number
  /** Nghiêng thân: âm = ngả ra sau. */
  torsoLean: number
  /** Xoay thân quanh trục dọc. */
  torsoTwist: number
  headPitch: number
  /** Dịch cả người dọc trục đấu, dương = về phía đối thủ (đơn vị thế giới). */
  bodyShift: number
  /** 0 = đứng, 1 = đã ngã hẳn (chỉ dùng cho 'ko'). */
  fall: number
  /** Hạ trọng tâm (đơn vị thế giới). */
  crouch: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))
const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3
const decay = (elapsed: number, tau: number) => Math.exp(-elapsed / tau)

function base(phase: number): PoseAngles {
  const bob = Math.sin(phase * 2) * 0.5 + 0.5
  return {
    rArm: -0.95 + bob * 0.06, lArm: -0.8 - bob * 0.05, rElbow: -1.25, lElbow: -1.35,
    rLeg: 0.35, lLeg: -0.3, rKnee: 0.25, lKnee: 0.15,
    torsoLean: 0.06, torsoTwist: 0, headPitch: 0.05, bodyShift: 0, fall: 0, crouch: 0.05 + bob * 0.04,
  }
}

/**
 * @param pose tư thế hiện tại
 * @param elapsedMs thời gian kể từ lúc vào tư thế này
 * @param phase pha nhịp thở (tăng đều theo thời gian), dùng cho trạng thái chờ
 */
export function fightPose(pose: FightPose, elapsedMs: number, phase = 0): PoseAngles {
  const p = base(phase)
  const e = Math.max(0, elapsedMs)
  switch (pose) {
    case 'windup': {
      const k = easeOut(e / 380)
      p.rArm = lerp(p.rArm, 0.75, k)
      p.rElbow = lerp(p.rElbow, -0.6, k)
      p.torsoTwist = -0.35 * k
      p.torsoLean = 0.06 - 0.12 * k
      p.bodyShift = -0.18 * k
      p.crouch += 0.1 * k
      return p
    }
    case 'strike': {
      const thrust = easeOut(e / 90)
      p.rArm = lerp(0.75, -1.6, thrust)
      p.rElbow = lerp(-0.6, -0.05, thrust)
      p.torsoTwist = 0.35 * thrust
      p.torsoLean = 0.18 * thrust
      p.bodyShift = 0.55 * Math.sin(Math.min(1, e / 240) * Math.PI)
      return p
    }
    case 'guard':
    case 'block': {
      p.rArm = -1.75
      p.lArm = -1.7
      p.rElbow = -1.55
      p.lElbow = -1.55
      p.crouch = 0.14
      p.torsoLean = 0.14
      if (pose === 'block') p.bodyShift = -0.14 * decay(e, 110)
      return p
    }
    case 'hurt':
    case 'hit': {
      const k = decay(e, 200)
      p.headPitch = -0.55 * k
      p.torsoLean = -0.45 * k
      p.bodyShift = -0.5 * decay(e, 170)
      p.rArm = lerp(-0.95, 0.5, k)
      p.lArm = lerp(-0.8, 0.4, k)
      p.rElbow = -0.5
      p.lElbow = -0.5
      return p
    }
    case 'ko': {
      const fall = easeOut(e / 650)
      p.fall = fall
      p.rArm = lerp(-0.95, 0.3, fall)
      p.lArm = lerp(-0.8, 0.25, fall)
      p.rElbow = lerp(-1.25, -0.2, fall)
      p.lElbow = lerp(-1.35, -0.2, fall)
      p.headPitch = -0.4 * fall
      p.bodyShift = -0.9 * fall
      p.crouch = 0
      p.rLeg = lerp(0.35, 0.1, fall)
      p.lLeg = lerp(-0.3, -0.1, fall)
      return p
    }
    default:
      return p
  }
}
