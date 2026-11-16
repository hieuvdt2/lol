// Thông báo nhỏ (toast) trong hang: ai vừa vào hang / vào group Telegram, kết quả giao lưu võ thuật, lời mời vào Telegram.
// Hành vi theo bản gốc: hàng đợi tối đa 3, gộp cùng loại (nhớ tối đa 2 tên + "và N anh em khác"), từ 10 người trở lên thì
// báo gộp "🔥 N anh em vừa vào hang!", mỗi thông báo hiện 4,2 giây, cách nhau 0,5 giây, chờ quá 15 giây thì bỏ,
// tạm dừng khi tab ẩn hoặc đang có việc quan trọng chiếm màn hình. Câu chữ là của bản gốc (chuỗi giao diện), phần mã viết mới.
import type { EndResult } from './duel.ts'

export type NoticeKind = 'tele_join' | 'room_join' | 'tele_invite' | 'duel_result' | 'trap_result'
export type TrapResult = 'win' | 'draw' | 'quit'
export interface Notice {
  kind: NoticeKind
  names: string[]
  more: number
  result?: EndResult
  hp?: [number, number]
  variant?: number
  /** Bẫy Độc Noxus: kết quả và số mạng còn lại [người thắng, người thua] */
  trap?: TrapResult
  lives?: [number, number]
}
export interface Segment {
  text: string
  bold?: boolean
}

export const SHOW_MS = 6000 // hiện lâu hơn bản gốc (4,2 s) để mọi người kịp thấy
export const GAP_MS = 500
export const EXPIRE_MS = 15_000
export const RETRY_MS = 500
export const MAX_QUEUE = 3
export const BATCH_FROM = 10
export const MAX_NAMES = 2

export const NOTICE_ICON: Record<NoticeKind, string> = { tele_join: '✈', room_join: '👋', tele_invite: '📣', duel_result: '🥊', trap_result: '🍄' }

const RESULTS: readonly EndResult[] = ['ko', 'big', 'close', 'draw', 'quit']
const isResult = (v: unknown): v is EndResult => typeof v === 'string' && (RESULTS as readonly string[]).includes(v)
const goodName = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && Array.from(v).length <= 40

/** Kiểm tra thông báo từ server; sai định dạng thì null (bỏ qua, không hiện gì). */
export function parseNotice(m: Record<string, unknown>): Notice | null {
  const kind = m.kind
  if (kind === 'duel_result') {
    if (!Array.isArray(m.names) || m.names.length !== 2 || !isResult(m.result)) return null
    const names = m.names.filter(goodName)
    if (names.length !== 2) return null
    const hp = Array.isArray(m.hp) && m.hp.length === 2 && m.hp.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000) ? ([m.hp[0], m.hp[1]] as [number, number]) : undefined
    return { kind, names, more: 0, result: m.result, ...(hp ? { hp } : {}) }
  }
  if (kind === 'trap_result') {
    if (!Array.isArray(m.names) || m.names.length !== 2) return null
    const names = m.names.filter(goodName)
    if (names.length !== 2 || (m.result !== 'win' && m.result !== 'draw' && m.result !== 'quit')) return null
    const lives = Array.isArray(m.lives) && m.lives.length === 2 && m.lives.every((n) => Number.isInteger(n) && n >= 0 && n <= 9) ? ([m.lives[0], m.lives[1]] as [number, number]) : undefined
    return { kind, names, more: 0, trap: m.result, ...(lives ? { lives } : {}) }
  }
  if (kind === 'tele_invite') {
    const variant = Number.isInteger(m.variant) ? Math.abs(m.variant as number) : 0
    return { kind, names: [], more: 0, variant }
  }
  if (kind !== 'tele_join' && kind !== 'room_join') return null
  if (!Array.isArray(m.names) || m.names.length > 2) return null
  const names = m.names.filter(goodName)
  const more = m.more
  if (names.length !== m.names.length || typeof more !== 'number' || !Number.isInteger(more) || more < 0 || more > 100_000 || names.length + more === 0) return null
  return { kind, names, more }
}

const INVITE_LINES: Segment[][] = [
  [{ text: 'Vào ' }, { text: 'group Tele HangMu', bold: true }, { text: ' để trò chuyện cùng anh em ngoài hang!' }],
  [{ text: 'Không muốn lỡ tin của hang? Vào ' }, { text: 'group Tele HangMu', bold: true }, { text: ' nhé!' }],
  [{ text: 'Rủ anh em xem giải cùng trong ' }, { text: 'group Tele HangMu', bold: true }],
  [{ text: 'Anh em đang trò chuyện trong ' }, { text: 'group Tele HangMu', bold: true }, { text: ' 🔴' }],
]

/** Nội dung chính của thông báo, tách đoạn để in đậm tên. */
export function noticeSegments(n: Notice): Segment[] {
  if (n.kind === 'duel_result') {
    const [a, b] = [n.names[0] ?? 'Một anh em', n.names[1] ?? 'một anh em']
    const A: Segment = { text: a, bold: true }
    const B: Segment = { text: b, bold: true }
    switch (n.result) {
      case 'ko': return [A, { text: ' đã đấm vỡ mồm ' }, B]
      case 'big': return [A, { text: ' đã đấm ' }, B, { text: ' bầm dập' }]
      case 'close': return [A, { text: ' thắng ' }, B, { text: ' sát nút' }]
      case 'draw': return [A, { text: ' và ' }, B, { text: ' bất phân thắng bại' }]
      default: return [B, { text: ' bỏ chạy, ' }, A, { text: ' thắng' }]
    }
  }
  if (n.kind === 'trap_result') {
    const A: Segment = { text: n.names[0] ?? 'Một anh em', bold: true }
    const B: Segment = { text: n.names[1] ?? 'một anh em', bold: true }
    if (n.trap === 'draw') return [A, { text: ' và ' }, B, { text: ' hoà nhau ở ' }, { text: 'Bẫy Độc Noxus', bold: true }]
    if (n.trap === 'quit') return [B, { text: ' bỏ chạy khỏi bãi nấm, ' }, A, { text: ' thắng ' }, { text: 'Bẫy Độc Noxus', bold: true }]
    return [A, { text: ' thắng ' }, { text: 'Bẫy Độc Noxus', bold: true }, { text: ' trước ' }, B]
  }
  if (n.kind === 'tele_invite') return INVITE_LINES[(n.variant ?? 0) % INVITE_LINES.length]!
  const total = n.names.length + n.more
  const tele = n.kind === 'tele_join'
  if (total >= BATCH_FROM) return [{ text: '🔥 ' }, { text: String(total), bold: true }, { text: tele ? ' anh em vừa vào group Tele!' : ' anh em vừa vào hang!' }]
  const tail: Segment = { text: tele ? ' đã tham gia Tele HangMu.online' : ' vừa mới vào hang, ae giao lưu tí nhỉ' }
  const [a, b] = n.names
  if (a === undefined) return [{ text: String(n.more), bold: true }, { text: ' anh em' }, tail]
  if (n.more > 0) return [{ text: a, bold: true }, ...(b ? [{ text: ', ' }, { text: b, bold: true }] : []), { text: ' và ' }, { text: String(n.more), bold: true }, { text: ' anh em khác' }, tail]
  return b ? [{ text: a, bold: true }, { text: ' và ' }, { text: b, bold: true }, tail] : [{ text: a, bold: true }, tail]
}

/** Dòng phụ dưới nội dung chính. */
export function noticeSub(n: Notice, titleOf: (r: EndResult) => string): string {
  if (n.kind === 'duel_result' && n.result) {
    const hp = n.hp ? ` · ${n.hp[0]} – ${n.hp[1]}` : ''
    if (n.result === 'quit') return `Bỏ cuộc giữa trận${hp}`
    const title = titleOf(n.result).toLowerCase()
    return `${title.replace(/^\p{L}/u, (c) => c.toUpperCase())}${hp}`
  }
  if (n.kind === 'trap_result') return n.lives ? `Còn ${n.lives[0]} ❤ · ${n.names[1] ?? 'đối thủ'} còn ${n.lives[1]} ❤` : 'Đứng gần ai đó bấm 🍄 (phím B) để thách đấu'
  switch (n.kind) {
    case 'tele_join': return 'Vào cùng anh em → nút ✈ phía trên'
    case 'room_join': return '' // lời rủ giao lưu đã nằm trong câu chính
    case 'tele_invite': return 'Bấm nút ✈ phía trên để vào group'
    default: return 'Lại gần ai đó để giao lưu võ thuật (phím V / nút 🥊)'
  }
}

/** Gộp hai thông báo cùng loại: nhớ tối đa MAX_NAMES tên đầu, phần dư tính vào `more`. */
export function mergeNotices(a: Notice, b: Notice): Notice {
  const all = [...a.names, ...b.names]
  const names = all.slice(0, MAX_NAMES)
  return { kind: a.kind, names, more: a.more + b.more + (all.length - names.length) }
}

const sticky = (k: NoticeKind): boolean => k === 'duel_result' || k === 'trap_result'

export interface ShownNotice extends Notice {
  id: number
}
interface Queued extends Notice {
  at: number
}
export interface QueueDeps {
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (h: unknown) => void
  isHidden?: () => boolean
  /** Có việc quan trọng hơn đang chiếm màn hình (ví dụ một hộp thoại toàn màn hình) thì chờ. */
  isBusy?: () => boolean
}

/** Hàng đợi hiển thị từng thông báo một. */
export class NoticeQueue {
  current: ShownNotice | null = null
  private shown: Queued | null = null
  private queue: Queued[] = []
  private seq = 0
  private holders = new Set<symbol>()
  private timer: unknown
  private listeners = new Set<() => void>()
  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (h: unknown) => void
  private readonly isHidden: () => boolean
  private readonly isBusy: () => boolean

  constructor(deps: QueueDeps = {}) {
    this.now = deps.now ?? (() => performance.now())
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
    this.isHidden = deps.isHidden ?? (() => typeof document !== 'undefined' && document.hidden)
    this.isBusy = deps.isBusy ?? (() => false)
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  getSnapshot = (): ShownNotice | null => this.current
  get length(): number {
    return this.queue.length
  }

  push(n: Notice): void {
    const at = sticky(n.kind) ? -1 : this.queue.findIndex((q) => q.kind === n.kind)
    if (at >= 0) {
      const existing = this.queue[at]!
      this.queue[at] = { ...mergeNotices(existing, n), at: existing.at }
    } else {
      if (this.queue.length >= MAX_QUEUE) {
        const drop = this.queue.findIndex((q) => q.kind !== 'duel_result')
        this.queue.splice(drop >= 0 ? drop : 0, 1)
      }
      const item: Queued = { ...n, at: this.now() }
      if (n.kind === 'duel_result') {
        // kết quả võ thuật chen lên trước các loại khác (nhưng sau các kết quả đã chờ)
        const firstOther = this.queue.findIndex((q) => q.kind !== 'duel_result')
        this.queue.splice(firstOther >= 0 ? firstOther : this.queue.length, 0, item)
      } else this.queue.push(item)
    }
    this.pump()
  }

  /** Tạm dừng hiển thị (thông báo đang hiện được trả về hàng đợi). Trả về hàm nhả. */
  hold(): () => void {
    const token = Symbol('notice-hold')
    this.holders.add(token)
    if (this.current) {
      if (this.timer !== undefined) this.clearTimer(this.timer)
      this.timer = undefined
      const shown = this.shown
      if (shown) {
        const at = sticky(shown.kind) ? -1 : this.queue.findIndex((q) => q.kind === shown.kind)
        if (at >= 0) this.queue[at] = { ...mergeNotices(shown, this.queue[at]!), at: shown.at }
        else this.queue.unshift(shown)
      }
      this.current = null
      this.shown = null
      this.emit()
    }
    return () => {
      if (this.holders.delete(token)) this.pump()
    }
  }

  reset(): void {
    if (this.timer !== undefined) this.clearTimer(this.timer)
    this.timer = undefined
    this.queue = []
    this.shown = null
    if (this.current) {
      this.current = null
      this.emit()
    }
  }

  /** Thử hiện thông báo kế tiếp (gọi khi tab hiện lại). */
  pump = (): void => {
    if (this.current || this.timer !== undefined) return
    const t = this.now()
    this.queue = this.queue.filter((q) => t - q.at <= EXPIRE_MS)
    if (this.queue.length === 0 || this.isHidden()) return
    if (this.holders.size > 0 || this.isBusy()) {
      this.timer = this.setTimer(() => {
        this.timer = undefined
        this.pump()
      }, RETRY_MS)
      return
    }
    const item = this.queue.shift()!
    this.shown = item
    this.current = { kind: item.kind, names: item.names, more: item.more, ...(item.result ? { result: item.result } : {}), ...(item.hp ? { hp: item.hp } : {}), ...(item.variant !== undefined ? { variant: item.variant } : {}), id: ++this.seq }
    this.emit()
    this.timer = this.setTimer(() => {
      this.current = null
      this.shown = null
      this.emit()
      this.timer = this.setTimer(() => {
        this.timer = undefined
        this.pump()
      }, GAP_MS)
    }, SHOW_MS)
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn()
  }
}
