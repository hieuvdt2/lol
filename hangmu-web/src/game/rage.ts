import { audio } from './audio.ts'

// Client của gói `rage` (ném đồ vào các ô biệt danh). Server chỉ gửi {a:'state', labels, today}.
// Bản gốc ném trong cảnh 3D; ở đây là bảng điều khiển 2D, tọa độ (u, v) chọn ngẫu nhiên quanh tâm.
export const NICKNAMES = [
  'Ca Dic', 'Bủ Nô', 'Đa Lọt', 'Mắc Gai', 'Licha', 'Đờ Lít', 'Dô Rô', 'Lúc Sô',
  'Lam Men', 'Mai Nu', 'U Ga Tê', 'Mây Sơn', 'Cún Nha', 'Bờ Mô', 'Sét Cô', 'A Mát',
] as const
export const ITEMS = ['🍅 Cà chua', '🩴 Dép tổ ong', '🎂 Bánh kem', '📄 Giấy vo'] as const
export const SLOTS = 5
const DEFAULT_LABELS = [3, 1, 2, 0, 14]

export interface RageView {
  labels: number[]
  today: number
  item: number
  slot: number
  hits: Array<{ id: number; slot: number; item: number }>
}

export class RageClient {
  private view: RageView = { labels: DEFAULT_LABELS, today: 0, item: 0, slot: 2, hits: [] }
  private listeners = new Set<() => void>()
  private seq = 0
  private throwListeners = new Set<(t: { slot: number; item: number; u: number; v: number }) => void>()
  private send: (g: string, d: Record<string, unknown>) => boolean
  constructor(send: (g: string, d: Record<string, unknown>) => boolean) {
    this.send = send
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.view
  private set(patch: Partial<RageView>) {
    this.view = { ...this.view, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  onMessage(d: Record<string, unknown>) {
    if (d.a !== 'state') return
    const ok = Array.isArray(d.labels) && d.labels.length === SLOTS && d.labels.every((n) => Number.isInteger(n) && n >= 0 && n < NICKNAMES.length)
    this.set({
      labels: ok ? (d.labels as number[]) : this.view.labels,
      today: typeof d.today === 'number' && d.today >= 0 ? d.today : this.view.today,
    })
  }
  setItem(item: number) {
    if (item >= 0 && item < ITEMS.length) this.set({ item })
  }
  setSlot(slot: number) {
    if (slot >= 0 && slot < SLOTS) this.set({ slot })
  }
  /** Ném vào điểm (u, v) trên màn hình, tọa độ chuẩn hóa [-1, 1]; không truyền thì ngắm quanh tâm (nút "ném nhanh"). */
  throwAt(u?: number, v?: number): boolean {
    const { slot, item } = this.view
    const round = (n: number) => Math.round(n * 100) / 100
    const aimU = round(u ?? (Math.random() - 0.5) * 0.3)
    const aimV = round(v ?? (Math.random() - 0.5) * 0.3)
    const sent = this.send('rage', { a: 'throw', slot, item, u: aimU, v: aimV })
    if (!sent) return false
    for (const fn of this.throwListeners) fn({ slot, item, u: aimU, v: aimV })
    audio.play('throw')
    setTimeout(() => audio.play('splat'), 350)
    const id = ++this.seq
    this.set({ hits: [...this.view.hits.slice(-5), { id, slot, item }] })
    return true
  }
  /** Đăng ký nhận sự kiện mỗi lần ném thành công (để dựng quỹ đạo 3D). Trả về hàm hủy. */
  onThrow(fn: (t: { slot: number; item: number; u: number; v: number }) => void): () => void {
    this.throwListeners.add(fn)
    return () => this.throwListeners.delete(fn)
  }
  relabel(slot: number, nick: number) {
    this.send('rage', { a: 'label', slot, nick })
  }
  reset() {
    this.view = { labels: DEFAULT_LABELS, today: 0, item: 0, slot: 2, hits: [] }
    this.listeners.forEach((fn) => fn())
  }
}
