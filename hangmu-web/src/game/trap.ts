// Client của trò "Bẫy Độc Noxus" (luật: shared/trap.mjs, server: hangmu-server.mjs). Giữ trạng thái để lớp phủ TrapOverlay vẽ.
import { audio } from './audio.ts'
import { TRAP, cellOf, rowOf } from '../../shared/trap.mjs'

export type TrapPhase = 'idle' | 'place' | 'walk' | 'ended'
export type TrapEndReason = 'goal' | 'dead' | 'draw' | 'quit' | 'left'

export interface Lane {
  /** hàng kế tiếp phải bước (0..rows; = rows là đã tới đích) */
  row: number
  lives: number
  /** ô đã đi qua an toàn */
  path: number[]
  /** nấm đã dẫm phải (lộ ra) */
  hits: number[]
}

export interface TrapStepView {
  me: boolean
  row: number
  col: number
  hit: boolean
}

export interface TrapView {
  phase: TrapPhase
  peer: number
  peerName: string
  /** hạn chót của giai đoạn / lượt hiện tại (performance.now) */
  deadline: number
  /** độ dài giai đoạn / lượt hiện tại (ms), để vẽ thanh thời gian */
  span: number
  /** nấm đang chọn để cắm (chưa gửi) */
  draft: number[]
  /** đã gửi cách cắm nấm */
  placed: boolean
  foePlaced: boolean
  /** nấm mình đã cắm trên đường đối thủ (server xác nhận) */
  mine: number[]
  me: Lane
  foe: Lane
  round: number
  /** cột mình đã chọn trong lượt này */
  myPick: number | null
  foeLocked: boolean
  /** lượt vừa lật (để hiệu ứng), seq tăng mỗi lượt */
  last: { seq: number; steps: TrapStepView[] }
  /** đang xem kết quả lượt vừa lật: chưa cho chọn tiếp */
  revealUntil: number
  confirmQuit: boolean
  end: null | { won: boolean | null; reason: TrapEndReason; trapsOnMe: number[] }
}

const lane = (): Lane => ({ row: 0, lives: TRAP.lives, path: [], hits: [] })
const IDLE: TrapView = {
  phase: 'idle', peer: -1, peerName: '', deadline: 0, span: 1, draft: [], placed: false, foePlaced: false, mine: [],
  me: lane(), foe: lane(), round: 0, myPick: null, foeLocked: false, last: { seq: 0, steps: [] }, revealUntil: 0,
  confirmQuit: false, end: null,
}
/** Thời gian xem kết quả lượt trước khi chọn tiếp (ms, phía giao diện). */
export const REVEAL_VIEW_MS = 1200

export interface TrapHost {
  selfIndex: () => number
  nameOf: (index: number) => string | undefined
  standStill: (peer: number) => void
  send: (g: string, d: Record<string, unknown>) => boolean
  notify: (text: string) => void
}

const pairOf = (list: unknown, index: number): number | null => {
  if (!Array.isArray(list)) return null
  for (const row of list) if (Array.isArray(row) && row[0] === index && typeof row[1] === 'number') return row[1]
  return null
}
const cells = (v: unknown): number[] => (Array.isArray(v) ? v.filter((c): c is number => Number.isInteger(c) && c >= 0 && c < TRAP.rows * TRAP.cols) : [])

/**
 * Bấm một ô khi giấu nấm: trả về cách cắm mới, hoặc lý do không cho.
 * Bấm lại nấm = nhổ lên; hàng đã đủ nấm thì nấm chuyển sang ô vừa bấm (2 ô mỗi hàng: bấm ô kia là đổi bên).
 */
export function draftToggle(draft: number[], cell: number): { draft: number[] } | { why: string } {
  if (draft.includes(cell)) return { draft: draft.filter((c) => c !== cell) }
  const sameRow = draft.filter((c) => rowOf(c) === rowOf(cell))
  if (sameRow.length >= TRAP.maxPerRow) {
    const moved = sameRow[0]!
    return { draft: [...draft.filter((c) => c !== moved), cell] }
  }
  if (draft.length >= TRAP.mushrooms) return { why: `Chỉ có ${TRAP.mushrooms} nấm — bấm vào nấm đã cắm để nhổ lên.` }
  return { draft: [...draft, cell] }
}

export class TrapClient {
  private view: TrapView = IDLE
  private listeners = new Set<() => void>()
  private host: TrapHost
  constructor(host: TrapHost) {
    this.host = host
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.view
  /** Đang trong trận (kể cả màn kết quả): khoá di chuyển, đấm, mời. */
  get active(): boolean {
    return this.view.phase !== 'idle'
  }
  private set(patch: Partial<TrapView>) {
    this.view = { ...this.view, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  onMessage(d: Record<string, unknown>) {
    const me = this.host.selfIndex()
    const now = performance.now()
    switch (d.a) {
      case 'start': {
        const peer = Number(d.peer)
        const ms = Number(d.placeMs) || TRAP.placeMs
        this.host.standStill(peer)
        audio.play('bell')
        this.view = { ...IDLE, me: lane(), foe: lane(), phase: 'place', peer, peerName: this.host.nameOf(peer) ?? String(d.name ?? 'Đối thủ'), deadline: now + ms, span: ms }
        this.listeners.forEach((fn) => fn())
        break
      }
      case 'placeRejected':
        this.set({ placed: false })
        this.host.notify('Cách cắm nấm chưa hợp lệ, cắm lại nhé.')
        break
      case 'ready':
        if (Number(d.by) === me) this.set({ placed: true })
        else this.set({ foePlaced: true })
        break
      case 'walk': {
        const ms = Number(d.turnMs) || TRAP.turnMs
        const mine = cells(d.mine)
        audio.play('ui')
        this.set({ phase: 'walk', round: 1, mine, draft: mine, placed: true, foePlaced: true, deadline: now + ms, span: ms, myPick: null, foeLocked: false })
        break
      }
      case 'locked':
        if (Number(d.by) !== me) this.set({ foeLocked: true })
        break
      case 'round': {
        if (this.view.phase !== 'walk') break
        const steps: TrapStepView[] = []
        const next = { me: { ...this.view.me, path: [...this.view.me.path], hits: [...this.view.me.hits] }, foe: { ...this.view.foe, path: [...this.view.foe.path], hits: [...this.view.foe.hits] } }
        let iHit = false
        if (Array.isArray(d.steps)) {
          for (const s of d.steps) {
            if (!Array.isArray(s)) continue
            const [p, row, col, hit] = s as [number, number, number, number]
            const mine = p === me
            const target = mine ? next.me : next.foe
            const cell = cellOf(row, col)
            if (hit) target.hits.push(cell)
            else target.path.push(cell)
            if (mine && hit) iHit = true
            steps.push({ me: mine, row, col, hit: !!hit })
          }
        }
        for (const [key, idx] of [['me', me], ['foe', this.view.peer]] as const) {
          next[key].lives = pairOf(d.lives, idx) ?? next[key].lives
          next[key].row = pairOf(d.rows, idx) ?? next[key].row
        }
        audio.play(iHit ? 'hit' : 'ui')
        const ms = Number(d.turnMs)
        this.set({
          ...next,
          round: Number(d.round) || this.view.round + 1,
          myPick: null,
          foeLocked: false,
          last: { seq: this.view.last.seq + 1, steps },
          revealUntil: now + REVEAL_VIEW_MS,
          ...(ms > 0 ? { deadline: now + ms, span: ms } : {}),
        })
        break
      }
      case 'end': {
        const winner = d.winner === null || d.winner === undefined ? null : Number(d.winner)
        const reason = (['goal', 'dead', 'draw', 'quit', 'left'] as const).find((r) => r === d.reason) ?? 'goal'
        let trapsOnMe: number[] = []
        if (Array.isArray(d.boards)) for (const b of d.boards) if (Array.isArray(b) && b[0] === me) trapsOnMe = cells(b[1])
        const won = winner === null ? null : winner === me
        audio.play(won ? 'cheer' : won === false ? 'ko' : 'bell')
        this.set({
          phase: 'ended',
          confirmQuit: false,
          me: { ...this.view.me, lives: pairOf(d.lives, me) ?? this.view.me.lives },
          foe: { ...this.view.foe, lives: pairOf(d.lives, this.view.peer) ?? this.view.foe.lives },
          end: { won, reason, trapsOnMe },
        })
        break
      }
    }
  }

  /** Bấm một ô trên đường đối thủ lúc giấu nấm: cắm / nhổ. Trả về lý do nếu không cho. */
  toggleDraft(cell: number): string | null {
    const v = this.view
    if (v.phase !== 'place' || v.placed) return null
    const next = draftToggle(v.draft, cell)
    if ('why' in next) return next.why
    this.set({ draft: next.draft })
    return null
  }
  clearDraft() {
    if (this.view.phase === 'place' && !this.view.placed) this.set({ draft: [] })
  }
  confirmPlace(): boolean {
    const v = this.view
    if (v.phase !== 'place' || v.placed || v.draft.length !== TRAP.mushrooms) return false
    if (!this.host.send('trap', { a: 'place', cells: v.draft })) return false
    this.set({ placed: true, mine: [...v.draft].sort((a, b) => a - b) })
    return true
  }
  /** Chọn cột ở hàng kế tiếp. */
  step(col: number): boolean {
    const v = this.view
    if (!Number.isInteger(col) || col < 0 || col >= TRAP.cols) return false
    if (v.phase !== 'walk' || v.myPick !== null || performance.now() < v.revealUntil || v.me.row >= TRAP.rows) return false
    if (v.me.hits.includes(cellOf(v.me.row, col))) return false
    if (!this.host.send('trap', { a: 'step', col })) return false
    this.set({ myPick: col })
    return true
  }
  askQuit() {
    if (this.view.phase === 'place' || this.view.phase === 'walk') this.set({ confirmQuit: true })
  }
  cancelQuit() {
    this.set({ confirmQuit: false })
  }
  quit() {
    this.host.send('trap', { a: 'quit' })
    this.set({ confirmQuit: false })
  }
  close() {
    if (this.view.phase !== 'ended') return
    this.view = IDLE
    this.listeners.forEach((fn) => fn())
  }
  connectionLost() {
    if (this.view.phase !== 'place' && this.view.phase !== 'walk') return
    const name = this.view.peerName
    this.reset()
    this.host.notify(`Mất kết nối giữa trận Bẫy Độc Noxus — bị xử thua, ${name} thắng.`)
  }
  reset() {
    this.view = IDLE
    this.listeners.forEach((fn) => fn())
  }
}
