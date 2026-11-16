// Vị trí camera sau lưng người chơi (hàm thuần để kiểm thử).
// Trước đây khoảng cách camera thu theo từng nấc ×0,88 khi vướng (phòng chờ, khán đài...): người chơi chạy đi thì khoảng cách
// nhảy cả nấc trong một khung hình (0,6–1,7 m) → cảnh phía trước giật. Giờ tìm khoảng cách thoáng liên tục rồi lùi ra mượt.
import { cameraBlocked } from './cameraGuard.ts'

/** Bán kính ngang tối đa của camera (trong vách hang). */
export const CAMERA_MAX_RADIUS = 55.5
/** Khoảng cách gần nhất của camera tới người chơi (m). */
export const CAMERA_MIN_DISTANCE = 1.2
/** Tốc độ lùi camera ra khi hết vướng (1/s, kiểu hàm mũ)... */
const EASE_OUT_RATE = 5
/** ...nhưng không nhanh hơn ngần này (m/s): khoảng trống lớn (từ 4 m bật lên 14 m) mà lùi theo hàm mũ thì vẫn vọt 0,7 m một khung. */
const EASE_OUT_MAX_SPEED = 6

export interface RigInput {
  /** vị trí người chơi (chân) */
  px: number
  py: number
  pz: number
  yaw: number
  /** góc cúi đã kẹp (≥ −0,08) */
  pitchPos: number
  /** hệ số lùi theo tỉ lệ khung hình */
  scale: number
}

export const baseDistance = (input: RigInput): number => Math.cos(input.pitchPos) * 14 * input.scale

/** Vị trí camera ở khoảng cách `distance`: bị kéo gần thì hạ thấp cùng tỉ lệ (nhìn qua vai thay vì chúc xuống sàn), không vượt trần vòm. */
export function cameraSpot(input: RigInput, distance: number): { x: number; y: number; z: number } {
  const x = input.px + Math.sin(input.yaw) * distance
  const z = input.pz + Math.cos(input.yaw) * distance
  const ceiling = 30 * Math.sqrt(Math.max(0, 1 - (Math.hypot(x, z) / 58) ** 2))
  const ratio = distance / baseDistance(input)
  const y = Math.max(input.py + 1.2, Math.min(input.py + (4 + Math.sin(input.pitchPos) * 14 * input.scale) * ratio, ceiling - 0.7))
  return { x, y, z }
}

function clear(input: RigInput, distance: number): boolean {
  const c = cameraSpot(input, distance)
  return Math.hypot(c.x, c.z) <= CAMERA_MAX_RADIUS && !cameraBlocked(input.px, input.py + 1.6, input.pz, c.x, c.y, c.z)
}

/** Khoảng cách xa nhất (≤ khoảng cách chuẩn) mà camera không ra ngoài vòm, không chui vào khối đặc. Chia đôi nên đổi liên tục theo vị trí. */
export function clearDistance(input: RigInput): number {
  const base = baseDistance(input)
  if (clear(input, base)) return base
  // Chỗ vướng gần nhất tính từ người chơi: dò thô từ trong ra rồi chia đôi đoạn cuối (vướng có thể không đơn điệu, ví dụ vật thấp ở giữa).
  const steps = 12
  let lo = CAMERA_MIN_DISTANCE
  let hi = base
  for (let i = 1; i <= steps; i += 1) {
    const d = CAMERA_MIN_DISTANCE + ((base - CAMERA_MIN_DISTANCE) * i) / steps
    if (!clear(input, d)) {
      hi = d
      break
    }
    lo = d
  }
  if (lo === CAMERA_MIN_DISTANCE && !clear(input, lo)) return CAMERA_MIN_DISTANCE
  for (let i = 0; i < 10; i += 1) {
    const mid = (lo + hi) / 2
    if (clear(input, mid)) lo = mid
    else hi = mid
  }
  return lo
}

/** Vướng thì kéo vào ngay (không để camera xuyên vật); hết vướng thì lùi ra mượt. `current` < 0 nghĩa là chưa có (khung đầu). */
export function easeDistance(current: number, target: number, dt: number): number {
  if (current < 0 || target <= current) return target
  const step = Math.max(0, dt)
  return current + Math.min((target - current) * (1 - Math.exp(-EASE_OUT_RATE * step)), EASE_OUT_MAX_SPEED * step)
}
