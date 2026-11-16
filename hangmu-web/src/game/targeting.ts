// Chọn người bị đấm — theo hàm chọn mục tiêu của bản gốc: gần nhất trong tầm; trong "vùng sát" thì đủ mọi hướng,
// ngoài vùng sát chỉ nhận người nằm trong hình nón phía trước mặt.

/** Tầm tối đa của một cú đấm phía client. */
export const PUNCH_REACH = 1.8
/** Trong khoảng này thì mọi hướng đều trúng. */
export const PUNCH_CLOSE = 0.9
/** cos của nửa góc nón (acos 0,34 ≈ 70°). */
export const PUNCH_CONE_COS = 0.34

export interface Candidate {
  id: number
  x: number
  z: number
}

/**
 * @param heading hướng mặt của người đấm (rad, 0 = +z)
 * @returns id mục tiêu hoặc null
 */
export function pickTarget(heading: number, me: { x: number; z: number }, candidates: Iterable<Candidate>, reach = PUNCH_REACH, close = PUNCH_CLOSE, coneCos = PUNCH_CONE_COS): number | null {
  const fx = Math.sin(heading)
  const fz = Math.cos(heading)
  let best: number | null = null
  let bestSq = Infinity
  const reachSq = reach * reach
  for (const c of candidates) {
    const dx = c.x - me.x
    const dz = c.z - me.z
    const sq = dx * dx + dz * dz
    if (sq > reachSq || sq >= bestSq) continue
    const d = Math.sqrt(sq)
    if (d > close && (dx * fx + dz * fz) / d < coneCos) continue
    best = c.id
    bestSq = sq
  }
  return best
}

export interface Facing {
  x: number
  z: number
  /** rad, 0 = +z, hướng nhìn = (sin, cos) */
  heading: number
}

/**
 * Đòn đến từ hướng nào so với mặt người bị đấm: `front` +1 = người đấm ở phía trước, −1 = sau lưng;
 * `side` +1 = bên trái, −1 = bên phải (trái của nhân vật là +x khi mặt hướng +z). Hai người trùng vị trí → đòn từ phía trước.
 */
export function hitDirection(victim: Facing, attacker: { x: number; z: number }): { front: number; side: number } {
  const dx = attacker.x - victim.x
  const dz = attacker.z - victim.z
  const d = Math.hypot(dx, dz)
  if (d < 1e-6) return { front: 1, side: 0 }
  const front = (dx * Math.sin(victim.heading) + dz * Math.cos(victim.heading)) / d
  const side = (dx * Math.cos(victim.heading) - dz * Math.sin(victim.heading)) / d
  return { front, side }
}

/** Góc (rad, đã chuẩn hoá về −π..π, kẹp ±max) cần xoay thêm từ `heading` để mặt hướng về `to`. Dùng để người đấm xoay thân về phía mục tiêu khi ra đòn. */
export function turnToward(from: { x: number; z: number }, heading: number, to: { x: number; z: number }, max: number): number {
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (dx * dx + dz * dz < 1e-8) return 0
  let diff = Math.atan2(dx, dz) - heading
  diff = Math.atan2(Math.sin(diff), Math.cos(diff))
  return Math.max(-max, Math.min(max, diff))
}
