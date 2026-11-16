// Vùng tương tác: đi tới một vùng thì hiện gợi ý "Nhấn E để ...", bấm E để vào chi tiết vùng đó.
// Hội trường đá (50 ghế, có bằng chứng từ bản gốc, mặt về màn hình) và Phòng chờ (sofa, do bản dựng lại tự thêm).
import { GATES, GATE_RANGE, SEATS, SEAT_RANGE, SEAT_TAKEN, floorHeight, inHall, inLounge } from './world.ts'
import type { Gate, Seat } from './world.ts'

export interface Point {
  x: number
  z: number
}
export type ZoneHit =
  | { kind: 'gate'; gate: Gate; enter: boolean; label: string }
  | { kind: 'hall-seat' | 'lounge-seat' | 'stand-seat'; seat: Seat; distance: number; label: string }
  | { kind: 'hall-full' | 'lounge-full'; label: string }
  | { kind: 'hall' | 'lounge'; label: string }

export const HALL_LABEL = 'Hội trường đá'
export const LOUNGE_LABEL = 'Phòng chờ'
export const STAND_LABEL = 'Khán đài'
const labelOf = (zone: Seat['zone']): string => (zone === 'lounge' ? LOUNGE_LABEL : zone === 'stand' ? STAND_LABEL : HALL_LABEL)

/** Cửa gần nhất trong tầm bấm E, kèm chiều đi (true = từ ngoài vào trong). */
export function gateNear(me: Point, range = GATE_RANGE): { gate: Gate; enter: boolean; distance: number } | null {
  let best: { gate: Gate; enter: boolean; distance: number } | null = null
  for (const gate of GATES) {
    for (const [end, enter] of [[gate.outside, true], [gate.inside, false]] as const) {
      const distance = Math.hypot(end.x - me.x, end.z - me.z)
      if (distance <= range && (!best || distance < best.distance)) best = { gate, enter, distance }
    }
  }
  return best
}

/** Đầu cửa mà người chơi tới khi đi qua (kèm độ cao sàn ở đó). */
export function gateDestination(gate: Gate, enter: boolean): { x: number; z: number; y: number; heading: number } {
  const to = enter ? gate.inside : gate.outside
  return { x: to.x, z: to.z, y: floorHeight(to.x, to.z), heading: to.heading }
}

/** Ghế trống gần nhất trong tầm với (ghế có người khác ngồi/đứng sát thì bỏ qua), tính cả ghế hội trường và ghế phòng chờ. */
export function freeSeatNear(me: Point, others: Iterable<Point>, range = SEAT_RANGE): { seat: Seat; distance: number } | null {
  const taken = [...others]
  let best: { seat: Seat; distance: number } | null = null
  for (const seat of SEATS) {
    const distance = Math.hypot(seat.x - me.x, seat.z - me.z)
    if (distance > range || (best && distance >= best.distance)) continue
    if (taken.some((o) => Math.hypot(o.x - seat.x, o.z - seat.z) < SEAT_TAKEN)) continue
    best = { seat, distance }
  }
  return best
}

/** Vùng đang đứng trong: có ghế trống trong tầm → có thể ngồi; trong khu ghế nhưng hết chỗ gần → gợi ý; ngoài mọi khu → null. */
export function zoneAt(me: Point, others: Iterable<Point>): ZoneHit | null {
  const door = gateNear(me)
  if (door) return { kind: 'gate', gate: door.gate, enter: door.enter, label: door.gate.label }
  const near = freeSeatNear(me, others)
  if (near) return { kind: `${near.seat.zone}-seat`, seat: near.seat, distance: near.distance, label: labelOf(near.seat.zone) } as ZoneHit
  const zone: Seat['zone'] | null = inHall(me.x, me.z) ? 'hall' : inLounge(me.x, me.z) ? 'lounge' : null
  if (!zone) return null
  const anySeat = SEATS.some((s) => s.zone === zone && Math.hypot(s.x - me.x, s.z - me.z) <= SEAT_RANGE)
  return { kind: anySeat ? `${zone}-full` : zone, label: labelOf(zone) } as ZoneHit
}

/** Câu gợi ý theo vùng. */
export function zonePrompt(hit: ZoneHit, touch: boolean): string {
  const key = touch ? '🪑' : 'E'
  switch (hit.kind) {
    case 'gate': return hit.enter ? `${hit.label}: bấm ${key} để vào` : `${hit.label}: bấm ${key} để ra ngoài`
    case 'hall-seat':
    case 'lounge-seat':
    case 'stand-seat': return `${hit.label}: bấm ${key} để ngồi`
    case 'hall-full':
    case 'lounge-full': return `${hit.label}: ghế gần đây đã có người`
    case 'lounge': return `${hit.label}: đến gần một ghế sofa rồi bấm ${key} để ngồi`
    default: return `${hit.label}: đến gần một ghế đá rồi bấm ${key} để ngồi`
  }
}

/** Chỗ đứng khi đứng dậy: hội trường bước ra hành lang trước hàng ghế; phòng chờ bước ra trước sofa. */
export function standUpSpot(seat: Seat): Point {
  return { x: seat.exit.x, z: seat.exit.z }
}
