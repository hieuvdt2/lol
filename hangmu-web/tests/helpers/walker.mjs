// Người đi bộ TRUNG THỰC cho các bài đo tải: đi bằng đúng mô phỏng chung (shared/world.mjs, có va chạm với ghế/lửa/hình nộm)
// nên vị trí báo lên server luôn hợp lệ. Trước khi server kiểm tra va chạm, các bài đo cho người đi thẳng xuyên ghế;
// giờ làm vậy sẽ bị server sửa liên tục (correction) và làm sai lệch số đo.
import { SIM_DT, makeBody, resolveCollisions, stepBody } from '../../shared/world.mjs'

/** Điểm ngẫu nhiên ở chỗ trống (không nằm trong vật cản) với bán kính trong [minR, maxR]. */
export function randomClearPoint(minR = 3, maxR = 40) {
  let point = { x: 0, z: 30 }
  for (let tries = 0; tries < 60; tries += 1) {
    const a = Math.random() * Math.PI * 2
    const r = minR + Math.random() * (maxR - minR)
    point = { x: Math.sin(a) * r, z: Math.cos(a) * r }
    const fixed = { ...point }
    resolveCollisions(fixed)
    if (Math.hypot(fixed.x - point.x, fixed.z - point.z) < 1e-6) break
  }
  return point
}

/** @param {number} x @param {number} z */
export function createWalker(x = 0, z = 36) {
  const body = makeBody(x, z, 0)
  return {
    body,
    get x() {
      return body.x
    },
    get z() {
      return body.z
    },
    /** Đi về phía `goal` trong `dt` giây (mặc định 0,1 s) ở 6 đơn vị/giây. Trả về true nếu còn đang đi. */
    advance(goal, dt = 0.1) {
      const dx = goal.x - body.x
      const dz = goal.z - body.z
      const d = Math.hypot(dx, dz)
      const moving = d > 0.4
      const input = moving ? { mx: (dx / d) * 0.75, mz: (dz / d) * 0.75 } : { mx: 0, mz: 0 }
      for (let t = 0; t < dt - 1e-9; t += SIM_DT) stepBody(body, input, SIM_DT)
      return moving
    },
  }
}
