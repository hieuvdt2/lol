// Phần toán thuần của cảnh ném đồ (không phụ thuộc Three.js) để kiểm thử được.

export const RING_RADIUS = 5
export const SLOTS = 5

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Góc (rad) của ô `index` trên vòng; ô 0 nằm hướng +z, tăng dần theo chiều kim đồng hồ nhìn từ trên xuống. */
export function slotAngle(index: number, slots = SLOTS): number {
  return (index / slots) * Math.PI * 2
}

/** Vị trí chân hình nộm trên mặt phẳng ngang (y do hàm cao độ của hang quyết định). */
export function slotXZ(index: number, radius = RING_RADIUS, slots = SLOTS): { x: number; z: number } {
  const a = slotAngle(index, slots)
  return { x: Math.sin(a) * radius, z: Math.cos(a) * radius }
}

/** Camera đứng ngoài vòng, trên đường thẳng từ tâm qua ô, nhìn vào ngực hình nộm. */
export function rageCamera(index: number, groundAt: (x: number, z: number) => number, outward = 7.5, eye = 1.9, aim = 1.5): { position: Vec3; look: Vec3 } {
  const { x, z } = slotXZ(index)
  const a = slotAngle(index)
  const px = x + Math.sin(a) * outward
  const pz = z + Math.cos(a) * outward
  return {
    position: { x: px, y: groundAt(px, pz) + eye, z: pz },
    look: { x, y: groundAt(x, z) + aim, z },
  }
}

/** Đường cong bậc hai (Bézier) từ a tới b với điểm điều khiển nâng lên `lift` ở giữa: đồ ném bay thành vòng cung. */
export function arc(t: number, a: Vec3, b: Vec3, lift: number): Vec3 {
  const k = Math.min(1, Math.max(0, t))
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2 + lift
  const cz = (a.z + b.z) / 2
  const u = 1 - k
  return {
    x: u * u * a.x + 2 * u * k * cx + k * k * b.x,
    y: u * u * a.y + 2 * u * k * cy + k * k * b.y,
    z: u * u * a.z + 2 * u * k * cz + k * k * b.z,
  }
}

/** Tọa độ chạm/bấm trên khung vẽ -> tọa độ chuẩn hóa [-1, 1] (x sang phải, y lên trên), kẹp trong khung. */
export function aimToNdc(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { u: number; v: number } {
  const u = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1
  const v = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1)
  const clamp = (n: number) => Math.min(1, Math.max(-1, n))
  // `+ 0` chuẩn hóa -0 thành 0 (tâm khung cho v = -0).
  return { u: Math.round(clamp(u) * 100) / 100 + 0, v: Math.round(clamp(v) * 100) / 100 + 0 }
}

/** Lò xo tắt dần cho hình nộm lắc lư sau khi bị trúng. */
export function springStep(angle: number, velocity: number, dt: number, stiffness = 38, damping = 5.2): { angle: number; velocity: number } {
  const accel = -stiffness * angle - damping * velocity
  const v = velocity + accel * dt
  return { angle: angle + v * dt, velocity: v }
}

/** Độ mờ của vệt bẩn theo tuổi: đậm trong `hold` giây đầu rồi nhạt dần tới 0 ở `life` giây. */
export function splatOpacity(ageSec: number, hold = 8, life = 20): number {
  if (ageSec <= hold) return 1
  if (ageSec >= life) return 0
  return 1 - (ageSec - hold) / (life - hold)
}
