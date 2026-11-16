export interface RoomStatus {
  inRoom: number
  capacity: number
  waiting: number
}

export interface SavedIdentity {
  name: string
  number: number | null
  /** Mã ngoại hình (đội, da, tóc, màu tóc), xem shared/look.mjs. */
  look: number
}

export interface LegalSection {
  title: string
  paragraphs?: string[]
  items?: string[]
}
