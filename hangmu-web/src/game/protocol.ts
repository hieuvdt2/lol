// Giao thức socket Hang MU. Các hằng số và layout byte khớp với bundle client gốc đã capture.

export const TICK_HZ = 30
export const POS_SCALE = 256
export const DIR_STEPS = 32
export const DIR_MAG_STEPS = 7
export const CHAT_MAX_CHARS = 200
export const CHAT_MIN_INTERVAL_MS = 1500
export const PUNCH_RANGE = 2.5
export const PUNCH_COOLDOWN_MS = 1500
export const INVITE_RANGE = 6
export const BOARD_MAX_IDS = 200

export const OP = { MOVE: 1, PING: 2, WELCOME: 128, MOVES: 129, CORRECTION: 130, PONG: 131 } as const

const TAU = Math.PI * 2

export interface MoveRecord {
  index: number
  tick: number
  x: number
  z: number
  heading: number
  dir: number
}

export type Decoded =
  | { op: 'welcome'; entries: Omit<MoveRecord, 'tick'>[] }
  | { op: 'moves'; serverTick: number; records: MoveRecord[] }
  | { op: 'correction'; x: number; z: number }
  | { op: 'pong'; clientTime: number; serverTick: number }

const scale = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * POS_SCALE)))

export function headingToByte(rad: number): number {
  return ((Math.round((rad / TAU) * 256) % 256) + 256) % 256
}

export function byteToHeading(byte: number): number {
  const rad = (byte / 256) * TAU
  return rad > Math.PI ? rad - TAU : rad
}

/** mag(3 bit) << 5 | góc(5 bit). 0 nghĩa là đứng yên. */
export function encodeDir(mx: number, mz: number): number {
  const mag = Math.round(Math.min(1, Math.hypot(mx, mz)) * DIR_MAG_STEPS)
  if (mag === 0) return 0
  const angle = ((Math.round((Math.atan2(mx, mz) / TAU) * DIR_STEPS) % DIR_STEPS) + DIR_STEPS) % DIR_STEPS
  return (mag << 5) | angle
}

export function decodeDir(byte: number, out: { mx: number; mz: number }): { mx: number; mz: number } {
  const mag = byte >> 5
  if (mag === 0) {
    out.mx = 0
    out.mz = 0
    return out
  }
  const angle = ((byte & 31) / DIR_STEPS) * TAU
  const length = mag / DIR_MAG_STEPS
  out.mx = Math.sin(angle) * length
  out.mz = Math.cos(angle) * length
  return out
}

export function encodeMove(x: number, z: number, heading: number, dir: number, tick: number): ArrayBuffer {
  const buffer = new ArrayBuffer(9)
  const view = new DataView(buffer)
  view.setUint8(0, OP.MOVE)
  view.setInt16(1, scale(x), true)
  view.setInt16(3, scale(z), true)
  view.setUint8(5, heading & 255)
  view.setUint8(6, dir & 255)
  view.setUint16(7, tick & 65535, true)
  return buffer
}

export function encodePing(clientTime: number): ArrayBuffer {
  const buffer = new ArrayBuffer(5)
  const view = new DataView(buffer)
  view.setUint8(0, OP.PING)
  view.setUint32(1, clientTime >>> 0, true)
  return buffer
}

export function decodeBinary(data: ArrayBuffer): Decoded | null {
  const view = new DataView(data)
  if (view.byteLength < 1) return null
  try {
    switch (view.getUint8(0)) {
      case OP.WELCOME: {
        const count = view.getUint16(1, true)
        const entries: Omit<MoveRecord, 'tick'>[] = []
        for (let i = 0, o = 3; i < count; i += 1, o += 8) {
          entries.push({
            index: view.getUint16(o, true),
            x: view.getInt16(o + 2, true) / POS_SCALE,
            z: view.getInt16(o + 4, true) / POS_SCALE,
            heading: view.getUint8(o + 6),
            dir: view.getUint8(o + 7),
          })
        }
        return { op: 'welcome', entries }
      }
      case OP.MOVES: {
        const serverTick = view.getUint16(1, true)
        const count = view.getUint16(3, true)
        const records: MoveRecord[] = []
        for (let i = 0, o = 5; i < count; i += 1, o += 10) {
          records.push({
            index: view.getUint16(o, true),
            tick: view.getUint16(o + 2, true),
            x: view.getInt16(o + 4, true) / POS_SCALE,
            z: view.getInt16(o + 6, true) / POS_SCALE,
            heading: view.getUint8(o + 8),
            dir: view.getUint8(o + 9),
          })
        }
        return { op: 'moves', serverTick, records }
      }
      case OP.CORRECTION:
        return { op: 'correction', x: view.getInt16(1, true) / POS_SCALE, z: view.getInt16(3, true) / POS_SCALE }
      case OP.PONG:
        return { op: 'pong', clientTime: view.getUint32(1, true), serverTick: view.getUint16(5, true) }
      default:
        return null
    }
  } catch {
    return null
  }
}

/** Khoảng cách tick có dấu, quấn quanh 16 bit. */
export function tickDiff(a: number, b: number): number {
  const d = (((Math.round(a) - Math.round(b)) % 65536) + 65536) % 65536
  return d >= 32768 ? d - 65536 : d
}

// ---- chuẩn hóa chat (cùng quy tắc với server) ----
const invisible = (c: number) =>
  c <= 31 || (c >= 127 && c <= 159) || c === 173 || c === 847 || c === 4447 || c === 4448 ||
  c === 6068 || c === 6069 || c === 6158 || (c >= 8203 && c <= 8207) || (c >= 8232 && c <= 8238) ||
  (c >= 8288 && c <= 8292) || (c >= 8294 && c <= 8297) || c === 10240 || c === 12644 ||
  c === 65279 || c === 65440 || (c >= 917504 && c <= 917631)

export function sanitizeChat(raw: string, max = CHAT_MAX_CHARS): string {
  const text = Array.from(raw.replace(/[\n\t]/g, ' '))
    .filter((ch) => !invisible(ch.codePointAt(0) ?? 0))
    .join('')
    .normalize('NFC')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(text).slice(0, max).join('')
}

// ---- message JSON ----
export interface RosterRow {
  i: number
  name: string
  n: number | null
  /** Mã ngoại hình (shared/look.mjs); server cũ không gửi → mặc định. */
  k?: number
  b: boolean
  x?: number
  z?: number
  heading?: number
}

export type InviteKind = 'talk' | 'duel' | 'trap'

export const validNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99 ? v : null
