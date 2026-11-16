// Hình học hang phía client: địa hình, hội trường đá (ghế) và vùng bấm E. Số liệu nằm ở shared/world.mjs (dùng chung với server).
import { GATES, GATE_RANGE, HALL, HALL_SEATS, LOUNGE, SEATS, floorHeight, inHall, inLounge } from '../../shared/world.mjs'
import type { Gate, Seat } from '../../shared/world.mjs'

export { GATES, GATE_RANGE, HALL, HALL_SEATS, LOUNGE, SEATS, floorHeight, inHall, inLounge }
export type { Gate, Seat }
export const SEAT_RANGE = 1.6
/** Hai người cách nhau dưới mức này tại một ghế thì coi là ghế đã có người. */
export const SEAT_TAKEN = 0.5
