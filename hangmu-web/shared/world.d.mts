export interface Body { x: number; y: number; z: number; vx: number; vz: number; heading: number }
export interface Input { mx: number; mz: number }
export interface Point { x: number; z: number }
export interface Obstacle { x: number; y: number; z: number; angle: number; hw?: number; hd?: number }
export interface Seat { x: number; z: number; y: number; bench: number; heading: number; exit: Point; zone: 'hall' | 'lounge' | 'stand' }
export interface Gate { id: string; label: string; outside: Point & { heading: number }; inside: Point & { heading: number } }
export const SIM_HZ: number
export const SIM_DT: number
export const MOVE_SPEED: number
export const ACCEL: number
export const TURN_RATE: number
export const MAX_SUBSTEP: number
export const PLAYER_RADIUS: number
export const CAVE_RADIUS: number
export const WALK_RADIUS: number
export const PODIUM_RADIUS: number
export const PODIUM_HEIGHT: number
export const SPAWN_X: number
export const SPAWN_Z: number
export const RING_SLOTS: number
export const RING_RADIUS: number
export const DUMMY_RADIUS: number
export const STAGE: { z: number; halfW: number; halfD: number }
export const BENCH: { length: number; depth: number; height: number; spacing: number }
export const HALL: { capacity: number; zone: { x0: number; x1: number; z0: number; z1: number }; rows: number[]; columns: number[] }
export const HALL_BENCHES: Point[]
export const HALL_SEATS: Seat[]
export const SEAT_EXIT: number
export const LOUNGE: { zone: { x0: number; x1: number; z0: number; z1: number }; center: Point }
export const SOFA: { depth: number; height: number; seatSpacing: number; exit: number; seatForward: number }
export const LOUNGE_SOFAS: Array<{ x: number; z: number; angle: number; seats: number; length: number }>
export const LOUNGE_TABLE: { x: number; z: number; angle: number; hw: number; hd: number; height: number }
export const LOUNGE_SCREEN: { x: number; z: number; halfW: number; halfD: number; width: number; height: number; bottom: number }
export const LOUNGE_WALL_HEIGHT: number
export const LOUNGE_WALLS: Obstacle[]
export const LOUNGE_SEATS: Array<Seat & { sofa: number }>
export const STAND_SEATS_PER_BENCH: number[]
export const STAND_SEAT_EXIT: number
export const STAND_SEATS: Seat[]
export const PODIUM_LAYOUT: { chairR: number; deskR: number; panelR: number; stationStep: number; sideAngles: number[]; pedestal: number; deskHalfW: number; deskHalfD: number }
export const PODIUM_STATIONS: Array<{ angle: number; side: number }>
export const GATE_RANGE: number
export const GATES: Gate[]
export const SEATS: Seat[]
export function inLounge(x: number, z: number): boolean
export const STANDS: { inner: number; tiers: number; width: number; rise: number }
export const STANDS_OUTER: number
export const STANDS_TOP: number
export const STAND_BENCH: { length: number; depth: number; height: number; spacing: number }
export const STAND_BENCH_REACH: number
export const STAND_BENCHES: Obstacle[]
export const STAND_WALLS: Obstacle[]
export const STAND_GAPS: ReadonlyArray<readonly [number, number]>
export const AISLE_ANGLES: number[]
export const AISLE_HALF: number
export function inStandGap(angle: number): boolean
export const BENCH_OBSTACLES: Obstacle[]
export function slotAngle(i: number): number
export function slotXZ(i: number): Point
export function floorHeight(x: number, z: number): number
export function pushOutOfBox(p: Point, cx: number, cz: number, angle: number, halfW: number, halfD: number): void
export function resolveCollisions(p: Point): void
export function wrapAngle(a: number): number
export function makeBody(x: number, z: number, heading?: number): Body
export function copyBody(to: Body, from: Body): void
export function stepBody(body: Body, input: Input, dt?: number): void
export function inHall(x: number, z: number): boolean
