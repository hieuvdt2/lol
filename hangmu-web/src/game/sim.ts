// Mô phỏng di chuyển của một người: dùng CHUNG một mã (shared/world.mjs) với server để client dự đoán người khác
// và bot trên server đi giống hệt nhau. Va chạm, hằng số và thứ tự xử lý theo bản gốc (xem shared/world.mjs).
import { SIM_DT, SIM_HZ, MOVE_SPEED, ACCEL, TURN_RATE, WALK_RADIUS, PODIUM_RADIUS, SPAWN_X, SPAWN_Z, copyBody, makeBody, stepBody, wrapAngle } from '../../shared/world.mjs'
import type { Body, Input } from '../../shared/world.mjs'

export { SIM_DT, SIM_HZ, MOVE_SPEED, ACCEL, TURN_RATE, WALK_RADIUS, PODIUM_RADIUS, SPAWN_X, SPAWN_Z, copyBody, makeBody }
export type SimBody = Body
export type SimInput = Input

export function stepSim(body: SimBody, input: SimInput, dt = SIM_DT): void {
  stepBody(body, input, dt)
}

/** Nội suy giữa hai trạng thái (hướng quay theo cung ngắn). */
export function lerpBody(out: SimBody, a: SimBody, b: SimBody, t: number): void {
  out.x = a.x + (b.x - a.x) * t
  out.y = a.y + (b.y - a.y) * t
  out.z = a.z + (b.z - a.z) * t
  out.vx = b.vx
  out.vz = b.vz
  out.heading = a.heading + wrapAngle(b.heading - a.heading) * t
}
