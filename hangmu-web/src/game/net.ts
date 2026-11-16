// Tầng mạng + trạng thái thế giới của client. Hành vi dựng theo client gốc đã capture:
// kết nối lại có cửa sổ, kiểm tra sức khỏe, đồng bộ tick qua ping, trễ nội suy tự thích ứng,
// dự đoán người chơi khác bằng hướng đi, hàng chờ, chat có ack, mời / nói chuyện riêng.
// Thuật toán dự đoán là bản viết lại theo cùng ý tưởng, không giống từng dòng với bản gốc.
import { TrapClient } from './trap.ts'
import {
  CHAT_MAX_CHARS,
  CHAT_MIN_INTERVAL_MS,
  INVITE_RANGE,
  TICK_HZ,
  byteToHeading,
  decodeBinary,
  decodeDir,
  encodeDir,
  encodeMove,
  encodePing,
  headingToByte,
  sanitizeChat,
  tickDiff,
  validNumber,
} from './protocol.ts'
import type { InviteKind, MoveRecord, RosterRow } from './protocol.ts'
import { audio } from './audio.ts'
import { parseBoard } from './board.ts'
import { DuelClient } from './duel.ts'
import { noticeQueue } from './noticeStore.ts'
import { parseNotice } from './notices.ts'
import { RageClient } from './rage.ts'
import { DEFAULT_LOOK_CODE, normalizeLookCode } from '../../shared/look.mjs'
import { SIM_DT, SPAWN_X, SPAWN_Z, copyBody, lerpBody, makeBody, stepSim } from './sim.ts'
import type { SimBody } from './sim.ts'
import { pickTarget } from './targeting.ts'

export type Phase = 'idle' | 'connecting' | 'queued' | 'inCave' | 'closed'

/** Lời đấm do server phát: "đã 👊 <tên>". */
const PUNCH_PREFIX = 'đã 👊'
export interface ChatMsg {
  id: number
  name: string
  text: string
  self: boolean
  state: 'pending' | 'sent' | 'failed'
  clientId?: number
  system?: boolean
  /** Dòng hoạt động (ai đấm ai...) hiện ở mục "Hoạt động" thay vì khung chat. */
  activity?: boolean
}
export interface TalkMsg {
  key: number
  mine: boolean
  text: string
  pending?: boolean
  failed?: boolean
}
export interface Conversation {
  id: number
  peer: number
  name: string
  messages: TalkMsg[]
  ended: null | { byMe: boolean; reason: 'end' | 'left' | 'idle' }
}
export interface Poll {
  id: number
  q: string
  options: string[]
}

export interface NetState {
  phase: Phase
  error?: string
  position?: number
  inRoom?: number
  waiting?: number
  capacity?: number
  retryIn?: number
  unstable: boolean
  reconnectUntil: number
  chat: ChatMsg[]
  notice: string | null
  poll?: Poll
  pollVoted: boolean
  /** Danh sách video / nhạc cho màn hình hội trường (thông điệp `board`). */
  boardVideos: string[]
  boardMusic: string[]
  punched?: { by: string; seq: number }
  asking: null | { target: number; kind: InviteKind; name: string; until: number }
  invite: null | { id: number; kind: InviteKind; from: number; name: string; until: number }
  toast: string | null
  cooldowns: Record<number, number>
  conv: Conversation | null
}

export interface Actor {
  index: number
  name: string
  number: number | null
  /** Mã ngoại hình (shared/look.mjs). Đổi giữa chừng khi người đó đổi trang phục: Hang.tsx dựng lại nhân vật. */
  look: number
  bot: boolean
  local: boolean
  prev: SimBody
  curr: SimBody
  draw: SimBody
  input: { mx: number; mz: number }
  tick: number
  queue: MoveRecord[]
  blendX: number
  blendZ: number
}

// Hằng số thời gian (ms) theo client gốc.
const PING_EVERY = 5000
const UNSTABLE_AFTER = 7000
const DEAD_AFTER = 15_000
const HIDDEN_LEAVE = 3_600_000
const RECONNECT_WINDOW = 25_000
const RECONNECT_STEPS = [0, 1000, 2000, 2000]
const ATTEMPT_TIMEOUT = 4000
const MIN_SEND_GAP = 100
const KEEPALIVE_SEND = 1000
const SETTLE_SEND = 250
const MIN_DELAY = 3
/** Khớp EMOTE_MIN_INTERVAL_MS của server (5,5 s ≥ thời gian ăn mừng) với một chút dư để không bị server bỏ. */
const EMOTE_COOLDOWN_MS = 5600
/** Thời gian hồi của cú đấm phía client (hoạt hình + gửi), bằng thời gian hồi server + 150 ms như bản gốc. */
const PUNCH_ANIM_COOLDOWN_MS = 1650
const MAX_DELAY = 10
const DEFAULT_DELAY = 5
const MAX_CATCHUP = 45
const RESYNC_TICKS = 4
const QUEUE_MAX = 32
const CHAT_KEEP = 50
const BLEND_TAU = 0.25
const TAB_KEY = 'hangmu.tab'
const MAX_ACTORS = 500

const OTHER_TAB = 'Bạn đã vào hang ở tab khác.'
const DROP_TEXT: Record<string, string> = {
  rate: 'Bạn gửi nhanh quá, chờ một chút rồi gửi tiếp.',
  duplicate: 'Bạn vừa gửi câu này rồi.',
  busy: 'Hang đang chat rất đông, tin chưa gửi được. Thử lại sau giây lát.',
  invalid: 'Tin nhắn trống hoặc quá dài.',
}

const INITIAL: NetState = {
  phase: 'idle', unstable: false, reconnectUntil: 0, chat: [], notice: null, pollVoted: false, boardVideos: [], boardMusic: [],
  asking: null, invite: null, toast: null, cooldowns: {}, conv: null,
}

function tabId(): string {
  try {
    let id = localStorage.getItem(TAB_KEY)
    if (!id) {
      id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
      localStorage.setItem(TAB_KEY, id)
    }
    return id
  } catch {
    return Math.random().toString(36).slice(2, 12)
  }
}

export function wsUrl(): string {
  const api = (window as unknown as { __ENV__?: { apiUrl?: string } }).__ENV__?.apiUrl?.replace(/\/+$/, '')
  if (api) return `${api.replace(/^http/, 'ws')}/ws`
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
}

export class NetClient {
  private state: NetState = INITIAL
  private listeners = new Set<() => void>()
  readonly actors = new Map<number, Actor>()
  readonly bubbles = new Map<number, { text: string; until: number }>()
  private people = new Map<number, { name: string; number: number | null; look: number; bot: boolean }>()
  selfIndex = -1
  punchAnimAt = -Infinity
  /** Lần ăn mừng gần nhất của từng người (chỉ số → mốc thời gian), để hoạt hình chạy đúng một lần mỗi sự kiện. */
  readonly emotedAt = new Map<number, number>()
  /** Ai đang ngồi ghế hội trường nào (chỉ số người → chỉ số ghế), theo server. */
  readonly seats = new Map<number, number>()
  private lastEmoteSent = -Infinity
  punchedAt = -Infinity
  punchHitAt = -Infinity
  /** Chỉ số người mà cú đấm gần nhất của mình trúng (để hoạt hình người bị đấm). */
  punchHitTarget = -1
  /** Mục tiêu của lần vung tay gần nhất của mình: chỉ số người, hoặc −1 nếu đấm hụt (không có ai trong tầm). */
  punchTargetIndex = -1
  /** Người vừa đấm mình (chỉ số), để người bị đấm phản ứng theo hướng đòn. −1 nếu chưa có. */
  punchedBy = -1
  /** Cú vung tay của người khác (chỉ số người đấm → mốc thời gian + mục tiêu, −1 = hụt). */
  readonly swings = new Map<number, { at: number; target: number }>()
  /** Người khác bị trúng đòn (chỉ số người bị đấm → mốc thời gian + người đấm). */
  readonly hurts = new Map<number, { at: number; by: number }>()

  private ws: WebSocket | null = null
  private name = ''
  private number: number | null = null
  private look = DEFAULT_LOOK_CODE
  private intentionalClose = false
  private retryAttempt = 0
  private retryTimer?: ReturnType<typeof setTimeout>
  private reconnectAttempt = 0
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private healthTimer?: ReturnType<typeof setInterval>
  private hiddenTimer?: ReturnType<typeof setTimeout>
  private toastTimer?: ReturnType<typeof setTimeout>
  private noticeTimer?: ReturnType<typeof setTimeout>
  private keepLocal = false
  private resumedVoted = false
  private lastHeard = 0
  private lastPing = 0
  private lastCheck = 0
  private tickHz = TICK_HZ
  private baseLocal = 0
  private baseTick = 0
  private bestRtt = Infinity
  private recordsSeen = 0
  private ages: number[] = []
  private delayTicks = DEFAULT_DELAY
  private lastDir = -1
  private lastSent = 0
  private settleAt = 0
  private acc = 0
  private chatSeq = 0
  private msgId = 1
  private dmSeq = 0
  private msgKey = 0
  private punchSeq = 0
  private lastChatAt = -Infinity
  private waitUntil = 0
  private engaged = new Map<number, string>()
  readonly duel = new DuelClient({
    selfIndex: () => this.selfIndex,
    nameOf: (i) => this.people.get(i)?.name,
    standStill: (peer) => this.standStill(peer),
    send: (g, d) => this.sendJson({ t: 'game', g, d }),
    notify: (text) => this.pushNotice(text),
  })
  readonly rage = new RageClient((g, d) => this.sendJson({ t: 'game', g, d }))
  /** Trò Bẫy Độc Noxus (mời bằng kind 'trap'). */
  readonly trap = new TrapClient({
    selfIndex: () => this.selfIndex,
    nameOf: (i) => this.people.get(i)?.name,
    standStill: (peer) => this.standStill(peer),
    send: (g, d) => this.sendJson({ t: 'game', g, d }),
    notify: (text) => this.pushNotice(text),
  })
  /** Đang trong một trò hai người (võ hoặc bẫy độc): khoá di chuyển, đấm, mời. */
  get gaming(): boolean {
    return this.duel.active || this.trap.active
  }


  // ---------- store ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = () => this.state
  private set(patch: Partial<NetState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  /** Số liệu cho bảng thông số (?debug=1): ping tốt nhất, trễ nội suy, tổng số bản ghi vị trí đã nhận. */
  debugInfo(): { rtt: number | null; delayTicks: number; records: number; actors: number } {
    return { rtt: Number.isFinite(this.bestRtt) ? this.bestRtt : null, delayTicks: this.delayTicks, records: this.recordsSeen, actors: this.actors.size }
  }

  get local(): Actor | undefined {
    return this.actors.get(this.selfIndex)
  }
  get live(): boolean {
    return this.state.phase === 'inCave' && this.state.reconnectUntil === 0
  }
  serverTickNow(): number {
    return this.baseTick + ((performance.now() - this.baseLocal) * this.tickHz) / 1000
  }
  renderTick(): number {
    return this.serverTickNow() - this.delayTicks
  }

  // ---------- vòng đời ----------
  connect(name: string, number: number | null, look: number = DEFAULT_LOOK_CODE) {
    this.look = normalizeLookCode(look)
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('pagehide', this.onPageGone)
    this.name = name
    this.number = number
    this.retryAttempt = 0
    this.open(false)
  }

  leave(reason?: string) {
    this.intentionalClose = true
    const socket = this.ws
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'leave' }))
    this.teardown()
    this.set({ phase: 'closed', ...(reason ? { error: reason } : {}) })
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('pagehide', this.onPageGone)
    this.intentionalClose = true
    this.teardown()
    clearTimeout(this.toastTimer)
    clearTimeout(this.noticeTimer)
  }

  private open(reconnecting: boolean) {
    if (reconnecting) this.closeSocket()
    else this.teardown()
    this.intentionalClose = false
    if (!reconnecting) this.set({ phase: 'connecting', error: undefined })
    const socket = new WebSocket(wsUrl())
    socket.binaryType = 'arraybuffer'
    this.ws = socket
    if (reconnecting) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = setTimeout(() => {
        if (this.ws === socket && this.state.reconnectUntil) {
          this.closeSocket()
          this.nextAttempt()
        }
      }, ATTEMPT_TIMEOUT)
    }
    socket.onopen = () => {
      socket.send(
        JSON.stringify({ t: 'enter', name: this.name, ...(this.number === null ? {} : { number: this.number }), look: this.look, tab: tabId() }),
      )
      this.lastHeard = performance.now()
      this.lastPing = 0
      this.lastCheck = performance.now()
      this.healthTimer = setInterval(() => this.checkHealth(), 1000)
      this.checkHealth()
    }
    socket.onmessage = (event) => {
      this.lastHeard = performance.now()
      if (this.state.unstable) this.set({ unstable: false })
      if (typeof event.data === 'string') {
        try {
          this.onJson(JSON.parse(event.data) as Record<string, unknown>)
        } catch {
          /* bỏ message hỏng */
        }
      } else this.onBinary(event.data as ArrayBuffer)
    }
    socket.onclose = () => {
      if (this.ws !== socket) return
      const phase = this.state.phase
      if (this.state.reconnectUntil) {
        this.closeSocket()
        this.nextAttempt()
      } else if (phase === 'inCave' && !this.intentionalClose && !this.retryTimer) {
        this.startReconnect()
      } else {
        this.teardown()
        if (this.intentionalClose || phase === 'closed' || this.retryTimer) return
        this.set({
          phase: 'closed',
          error: phase === 'connecting' ? 'Không vào được hang. Kiểm tra mạng rồi thử lại.' : 'Mất kết nối với hang. Bấm "Vào hang" để vào lại.',
        })
      }
    }
  }

  private closeSocket() {
    clearInterval(this.healthTimer)
    this.healthTimer = undefined
    const socket = this.ws
    if (!socket) return
    this.ws = null
    socket.onclose = socket.onmessage = socket.onopen = null
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close()
  }

  private teardown() {
    this.closeSocket()
    clearTimeout(this.hiddenTimer)
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    this.stopReconnect()
    this.resetSession()
  }

  private resetSession() {
    this.actors.clear()
    this.emotedAt.clear()
    this.swings.clear()
    this.hurts.clear()
    this.punchedBy = -1
    this.punchTargetIndex = -1
    this.seats.clear()
    this.bubbles.clear()
    this.people.clear()
    this.selfIndex = -1
    this.keepLocal = false
    this.ages = []
    this.delayTicks = DEFAULT_DELAY
    this.bestRtt = Infinity
    this.lastDir = -1
    this.acc = 0
    this.engaged.clear()
    this.duel.reset()
    this.trap.reset()
    this.rage.reset()
    this.state = { ...INITIAL, phase: this.state.phase, error: this.state.error }
    this.listeners.forEach((fn) => fn())
  }

  private startReconnect() {
    this.closeSocket()
    this.duel.connectionLost()
    this.trap.connectionLost()
    const until = performance.now() + RECONNECT_WINDOW
    this.reconnectAttempt = 0
    for (const a of this.actors.values()) if (!a.local) a.input.mx = a.input.mz = 0
    window.addEventListener('online', this.onOnline)
    this.set({ unstable: false, reconnectUntil: until })
    this.nextAttempt()
  }

  private nextAttempt() {
    clearTimeout(this.reconnectTimer)
    const left = this.state.reconnectUntil - performance.now()
    if (left <= 0) {
      this.intentionalClose = true
      this.teardown()
      this.set({ phase: 'closed', error: 'Mất kết nối với hang, đã thử kết nối lại nhưng không được. Bấm "Vào hang" để vào lại.' })
      return
    }
    const step = RECONNECT_STEPS[Math.min(this.reconnectAttempt, RECONNECT_STEPS.length - 1)] ?? 2000
    const wait = Math.min(step * (0.7 + Math.random() * 0.6), left)
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => this.open(true), wait)
  }

  private stopReconnect() {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    window.removeEventListener('online', this.onOnline)
    if (this.state.reconnectUntil) this.state = { ...this.state, reconnectUntil: 0 }
  }

  private onOnline = () => {
    if (this.state.reconnectUntil && this.ws?.readyState !== WebSocket.OPEN) this.open(true)
  }
  private onPageGone = () => {
    const socket = this.ws
    if (socket && socket.readyState === WebSocket.OPEN && this.state.phase === 'inCave') {
      this.intentionalClose = true
    }
  }
  private onVisibility = () => {
    clearTimeout(this.hiddenTimer)
    if (!document.hidden && this.state.reconnectUntil && this.ws?.readyState !== WebSocket.OPEN) this.open(true)
    const phase = this.state.phase
    if (document.hidden && (phase === 'inCave' || phase === 'queued')) {
      this.hiddenTimer = setTimeout(() => this.leave('Bạn đã rời hang vì ẩn tab quá 1 tiếng.'), HIDDEN_LEAVE)
    }
  }

  private scheduleRetry(afterSec: number) {
    this.intentionalClose = true
    this.teardown()
    const delay = Math.max(afterSec, 2 ** Math.min(this.retryAttempt, 5)) * (0.7 + Math.random() * 0.6)
    this.retryAttempt += 1
    this.set({ phase: 'connecting', retryIn: Math.ceil(delay) })
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      this.open(false)
    }, delay * 1000)
  }

  private ping() {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.lastPing = performance.now()
    this.ws.send(encodePing(Math.floor(this.lastPing) >>> 0))
  }

  private checkHealth() {
    const phase = this.state.phase
    if (phase !== 'connecting' && phase !== 'queued' && phase !== 'inCave') return
    const t = performance.now()
    if (t - this.lastCheck > 3000) this.lastHeard = t // tab bị đóng băng: không tính là im lặng
    this.lastCheck = t
    if (t - this.lastPing >= PING_EVERY) this.ping()
    const silent = t - this.lastHeard
    if (silent > DEAD_AFTER) {
      if (this.state.reconnectUntil) {
        this.closeSocket()
        this.nextAttempt()
        return
      }
      if (phase === 'inCave') return this.startReconnect()
      this.intentionalClose = true
      this.teardown()
      this.set({ phase: 'closed', error: 'Mất kết nối với hang (mạng không phản hồi). Bấm "Vào hang" để vào lại.' })
    } else if (silent > UNSTABLE_AFTER && !this.state.unstable && !this.state.reconnectUntil && phase !== 'connecting') {
      this.set({ unstable: true })
    }
  }

  // ---------- message JSON ----------
  private onJson(m: Record<string, unknown>) {
    const inCave = this.state.phase === 'inCave'
    switch (m.t) {
      case 'queued': {
        if (this.state.reconnectUntil) {
          if (Number(m.inRoom) < (this.state.capacity ?? Infinity)) {
            this.set({ position: Number(m.position), reconnectUntil: performance.now() + RECONNECT_WINDOW })
            break
          }
          this.stopReconnect()
          this.resetSession()
        }
        this.set({ phase: 'queued', position: Number(m.position), inRoom: Number(m.inRoom), waiting: Number(m.waiting) })
        break
      }
      case 'admitted':
        return this.onAdmitted(m)
      case 'join': {
        if (!inCave || Number(m.i) === this.selfIndex) break
        const index = Number(m.i)
        this.people.set(index, { name: String(m.name ?? 'Ẩn danh'), number: validNumber(m.n), look: normalizeLookCode(m.k), bot: m.b === true })
        this.bubbles.delete(index)
        this.addActor(index, Number(m.x ?? SPAWN_X), Number(m.z ?? SPAWN_Z), Math.PI, false)
        break
      }
      case 'look': {
        // ai đó đổi trang phục ngay trong hang
        const index = Number(m.i)
        const look = normalizeLookCode(m.k)
        const person = this.people.get(index)
        if (person) person.look = look
        const actor = this.actors.get(index)
        if (actor) actor.look = look
        if (index === this.selfIndex) this.look = look
        break
      }
      case 'leave': {
        const index = Number(m.i)
        this.people.delete(index)
        this.bubbles.delete(index)
        this.actors.delete(index)
        if (this.state.conv?.peer === index && !this.state.conv.ended) this.set({ conv: { ...this.state.conv, ended: { byMe: false, reason: 'left' } } })
        if (this.state.asking?.target === index) this.set({ asking: null })
        break
      }
      case 'rejected':
        this.intentionalClose = true
        this.teardown()
        this.set({
          phase: 'closed',
          error:
            m.reason === 'invalid_name' ? 'Tên không hợp lệ (1–30 ký tự).'
            : m.reason === 'other_tab' ? OTHER_TAB
            : m.reason === 'banned' ? 'Bạn đang bị cấm vào hang. Thử lại sau.'
            : m.reason === 'kicked' ? 'Bạn đã được mời ra khỏi hang.'
            : 'Hang và hàng chờ đều đã đầy. Thử lại sau ít phút.',
        })
        break
      case 'replaced':
        this.intentionalClose = true
        this.teardown()
        this.set({ phase: 'closed', error: OTHER_TAB })
        break
      case 'busy':
        if (this.state.reconnectUntil) {
          this.closeSocket()
          this.nextAttempt()
        } else this.scheduleRetry(Number(m.retryAfter) || 2)
        break
      case 'chat':
        if (Array.isArray(m.m)) this.onChatRows(m.m as unknown[])
        break
      case 'chatAck':
        this.onChatAck(Number(m.id), String(m.text ?? ''))
        break
      case 'chatDropped':
        this.onChatDropped(String(m.reason ?? 'busy'), m.id === undefined ? undefined : Number(m.id))
        break
      case 'sys':
        if (typeof m.text === 'string') {
          for (const line of m.text.split('\n').slice(0, 30)) if (line.trim()) this.pushChat({ name: '⚙ Hệ thống', text: line, self: false, state: 'sent', system: true })
        }
        break
      case 'seat': {
        const who = Number(m.i)
        const bench = Number(m.b)
        if (!inCave || !Number.isInteger(who)) break
        if (Number.isInteger(bench) && bench >= 0) this.seats.set(who, bench)
        else {
          this.seats.delete(who)
          if (who === this.selfIndex) this.seat = null // server buộc đứng dậy (chat riêng, đấu võ...)
        }
        break
      }
      case 'seats': {
        if (!inCave || !Array.isArray(m.on)) break
        for (const row of m.on as unknown[]) if (Array.isArray(row) && Number.isInteger(row[0]) && Number.isInteger(row[1]) && (row[1] as number) >= 0) this.seats.set(row[0] as number, row[1] as number)
        break
      }
      case 'seatDenied':
        if (inCave) this.seat = null // ghế đã có người hoặc ở quá xa: ở lại chỗ cũ, giao diện sẽ tự thoát trạng thái ngồi
        break
      case 'emote': {
        const who = Number(m.i)
        if (inCave && Number.isInteger(who) && this.actors.has(who)) this.emotedAt.set(who, performance.now())
        break
      }
      case 'swing': {
        // Cú vung tay của người khác (trúng hoặc hụt). Của mình thì đã chạy ngay lúc bấm F nên bỏ qua.
        const who = Number(m.i)
        if (!inCave || !Number.isInteger(who) || who === this.selfIndex || !this.actors.has(who)) break
        const target = Number.isInteger(m.target) ? Number(m.target) : -1
        const at = performance.now()
        this.swings.set(who, { at, target })
        if (target >= 0 && target !== this.selfIndex) this.hurts.set(target, { at, by: who })
        break
      }
      case 'punched':
        if (!inCave) break
        this.punchedAt = performance.now()
        this.punchedBy = Number(m.by)
        audio.play('hit')
        this.set({ punched: { by: this.people.get(Number(m.by))?.name ?? 'ai đó', seq: ++this.punchSeq } })
        break
      case 'punchHit': {
        this.punchHitAt = performance.now()
        this.punchHitTarget = Number(m.target)
        this.hurts.set(this.punchHitTarget, { at: this.punchHitAt, by: this.selfIndex })
        audio.play('punch')
        const who = this.people.get(Number(m.target))?.name
        const text = typeof m.text === 'string' && m.text.length <= 200 ? m.text : who ? `đã 👊 ${who}` : null
        if (text) this.pushChat({ name: this.people.get(this.selfIndex)?.name ?? this.name, text, self: true, state: 'sent', ...(text.startsWith(PUNCH_PREFIX) ? { activity: true } : {}) })
        break
      }
      case 'notice':
        if (inCave) this.onNotice(m)
        break
      case 'poll': {
        if (!inCave || !Number.isInteger(m.id) || typeof m.q !== 'string' || !Array.isArray(m.options)) break
        const options = (m.options as unknown[]).filter((o): o is string => typeof o === 'string' && o.length > 0 && o.length <= 60)
        if (options.length < 2 || options.length > 6 || options.length !== m.options.length) break
        const poll = { id: Number(m.id), q: m.q.slice(0, 200), options }
        if (poll.id !== this.state.poll?.id) this.set({ poll, pollVoted: this.resumedVoted })
        else if (this.resumedVoted && !this.state.pollVoted) this.set({ pollVoted: true })
        this.resumedVoted = false
        break
      }
      case 'board': {
        if (!inCave) break
        const board = parseBoard(m)
        const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])
        if (!same(board.videos, this.state.boardVideos) || !same(board.music, this.state.boardMusic)) this.set({ boardVideos: board.videos, boardMusic: board.music })
        break
      }
      case 'pollClosed':
        if (inCave && this.state.poll?.id === Number(m.id)) this.set({ poll: undefined, pollVoted: false })
        break
      case 'inviteAsked': {
        const asking = this.state.asking
        if (asking && asking.target === m.target) this.set({ asking: { ...asking, until: performance.now() + this.ttl(m.ms) } })
        break
      }
      case 'inviteDeclined':
        this.onInviteDeclined(m)
        break
      case 'invite': {
        if (m.kind !== 'talk' && m.kind !== 'duel' && m.kind !== 'trap') break
        const id = Number(m.id)
        if (this.state.conv || this.state.asking || this.gaming) {
          this.sendJson({ t: 'inviteAnswer', id, accept: false })
          break
        }
        audio.play('invite')
        this.set({
          invite: { id, kind: m.kind, from: Number(m.from), name: this.people.get(Number(m.from))?.name ?? String(m.name ?? 'Ai đó'), until: performance.now() + this.ttl(m.ms) },
        })
        break
      }
      case 'inviteGone':
        if (this.state.invite?.id === m.id) this.set({ invite: null })
        break
      case 'talkOpen': {
        if (!inCave) break
        this.standStill(Number(m.peer))
        audio.play('ui')
        this.set({
          asking: null, invite: null,
          conv: { id: Number(m.id), peer: Number(m.peer), name: this.people.get(Number(m.peer))?.name ?? String(m.name ?? 'Ai đó'), messages: [], ended: null },
        })
        break
      }
      case 'talkClosed': {
        const conv = this.state.conv
        if (!inCave || !conv || conv.id !== m.id || conv.ended) break
        this.set({ conv: { ...conv, ended: { byMe: m.by !== conv.peer, reason: m.reason === 'left' || m.reason === 'idle' ? m.reason : 'end' } } })
        break
      }
      case 'dm': {
        const conv = this.state.conv
        if (conv && !conv.ended && typeof m.text === 'string') this.pushTalk({ key: --this.msgKey, mine: false, text: m.text.slice(0, 400) })
        break
      }
      case 'dmAck':
      case 'dmDropped': {
        const conv = this.state.conv
        if (!conv) break
        const ok = m.t === 'dmAck'
        this.set({
          conv: {
            ...conv,
            messages: conv.messages.map((x) =>
              x.mine && x.key === m.id ? (ok ? { ...x, pending: false, text: typeof m.text === 'string' ? m.text : x.text } : { ...x, pending: false, failed: true }) : x,
            ),
          },
        })
        break
      }
      case 'game': {
        if (!inCave || typeof m.d !== 'object' || m.d === null) break
        if (m.g === 'duel') this.duel.onMessage(m.d as Record<string, unknown>)
        else if (m.g === 'trap') {
          if ((m.d as Record<string, unknown>).a === 'start') this.set({ asking: null, invite: null })
          this.trap.onMessage(m.d as Record<string, unknown>)
        }
        else if (m.g === 'rage') this.rage.onMessage(m.d as Record<string, unknown>)
        break
      }
      case 'engaged': {
        if (Array.isArray(m.on)) {
          for (const row of m.on as unknown[]) {
            if (Array.isArray(row) && Number.isInteger(row[0]) && typeof row[1] === 'string' && row[1].length <= 16) this.engaged.set(row[0] as number, row[1])
          }
        }
        if (Array.isArray(m.off)) for (const i of m.off as unknown[]) if (Number.isInteger(i)) this.engaged.delete(i as number)
        break
      }
      default:
        break // [TODO] cờ `admin` của 'sys' (chế độ chat của quản trị)
    }
  }

  private ttl(ms: unknown): number {
    return typeof ms === 'number' && ms >= 1000 && ms <= 300_000 ? ms : 20_000
  }

  private onAdmitted(m: Record<string, unknown>) {
    const reconnecting = this.state.reconnectUntil > 0
    const resumed = reconnecting && m.resumed === true && this.selfIndex === Number(m.selfIndex)
    if (reconnecting) {
      this.stopReconnect()
      if (!resumed) this.resetSession()
    }
    this.keepLocal = resumed
    if (resumed) {
      this.duel.reset()
      this.trap.reset()
    }
    this.resumedVoted = m.resumed === true && m.pollVoted === true
    this.retryAttempt = 0
    this.selfIndex = Number(m.selfIndex)
    this.tickHz = Number(m.tickHz) || TICK_HZ
    this.baseLocal = performance.now()
    this.baseTick = Number(m.serverTick) || 0
    const roster = (Array.isArray(m.roster) ? m.roster : []) as RosterRow[]
    this.people = new Map(roster.map((r) => [Number(r.i), { name: String(r.name ?? 'Ẩn danh'), number: validNumber(r.n), look: normalizeLookCode(r.k), bot: r.b === true }]))
    if (!resumed) {
      this.actors.clear()
    this.emotedAt.clear()
    this.swings.clear()
    this.hurts.clear()
    this.punchedBy = -1
    this.punchTargetIndex = -1
    this.seats.clear()
      this.bubbles.clear()
    }
    this.set({ ...(reconnecting ? {} : { boardVideos: [], boardMusic: [] }), phase: 'inCave', inRoom: roster.length, capacity: Number(m.capacity) || undefined, error: undefined, position: undefined })
    if (!reconnecting) audio.play('join')
    if (reconnecting) this.pushNotice(resumed ? 'Đã kết nối lại với hang.' : 'Đã vào lại hang (chỗ cũ đã hết hạn giữ).')
    this.ping()
  }

  private onNotice(m: Record<string, unknown>) {
    const notice = parseNotice(m)
    if (notice) noticeQueue.push(notice)
  }

  // ---------- nhị phân ----------
  private onBinary(data: ArrayBuffer) {
    const msg = decodeBinary(data)
    if (!msg || this.state.phase !== 'inCave') return
    switch (msg.op) {
      case 'welcome': {
        const dir = { mx: 0, mz: 0 }
        for (const e of msg.entries) {
          const self = e.index === this.selfIndex
          if (self && this.keepLocal && this.local) {
            this.correct(this.local, e.x, e.z)
            continue
          }
          const actor = this.addActor(e.index, e.x, e.z, byteToHeading(e.heading), self)
          if (actor && !self) {
            decodeDir(e.dir, dir)
            actor.input.mx = dir.mx
            actor.input.mz = dir.mz
          }
        }
        this.keepLocal = false
        break
      }
      case 'moves': {
        const now = this.serverTickNow()
        for (const r of msg.records) {
          this.recordsSeen += 1
          this.ages.push(tickDiff(now, r.tick))
          this.queueRecord(r)
        }
        if (this.ages.length > 64) this.ages.splice(0, this.ages.length - 64)
        this.updateDelay()
        break
      }
      case 'correction':
        if (this.local) this.correct(this.local, msg.x, msg.z)
        this.lastDir = -1
        break
      case 'pong': {
        const t = performance.now()
        const rtt = (((Math.floor(t) >>> 0) - msg.clientTime) >>> 0) % 4294967295
        if (rtt <= this.bestRtt + 30) {
          this.bestRtt = Math.min(this.bestRtt, rtt)
          this.baseLocal = t
          this.baseTick = msg.serverTick + ((rtt / 2) * this.tickHz) / 1000
        }
        break
      }
    }
  }

  private updateDelay() {
    if (this.ages.length < 8) return
    const sorted = [...this.ages].sort((a, b) => a - b)
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? DEFAULT_DELAY
    const target = Math.max(MIN_DELAY, Math.min(MAX_DELAY, Math.ceil(p90) + 1))
    this.delayTicks += Math.sign(target - this.delayTicks)
  }

  // ---------- thế giới ----------
  private addActor(index: number, x: number, z: number, heading: number, local: boolean): Actor | null {
    const existing = this.actors.get(index)
    if (existing) return existing
    if (this.actors.size >= MAX_ACTORS) return null
    const info = this.people.get(index)
    const body = makeBody(x, z, heading)
    const actor: Actor = {
      index, name: info?.name ?? '', number: info?.number ?? null, look: info?.look ?? DEFAULT_LOOK_CODE, bot: info?.bot === true, local,
      prev: { ...body }, curr: { ...body }, draw: { ...body }, input: { mx: 0, mz: 0 },
      tick: Math.round(this.renderTick()) & 65535, queue: [], blendX: 0, blendZ: 0,
    }
    this.actors.set(index, actor)
    return actor
  }

  private correct(actor: Actor, x: number, z: number) {
    const dx = x - actor.curr.x
    const dz = z - actor.curr.z
    const bx = actor.blendX - dx
    const bz = actor.blendZ - dz
    const far = Math.hypot(bx, bz) > 6
    actor.blendX = far ? 0 : bx
    actor.blendZ = far ? 0 : bz
    for (const b of [actor.curr, actor.prev]) {
      b.x += dx
      b.z += dz
    }
  }

  private queueRecord(r: MoveRecord) {
    const actor = this.actors.get(r.index)
    if (!actor || actor.local) return
    const q = actor.queue
    let at = q.length
    while (at > 0 && tickDiff(q[at - 1]!.tick, r.tick) > 0) at -= 1
    q.splice(at, 0, r)
    if (q.length > QUEUE_MAX) q.shift()
  }

  private stepRemote(a: Actor) {
    a.tick = (a.tick + 1) & 65535
    if (this.seats.has(a.index)) {
      // Người đang ngồi: vị trí nằm trong hộp ghế nên KHÔNG chạy mô phỏng (va chạm sẽ đẩy họ ra khỏi ghế); lấy thẳng bản ghi mới nhất.
      let last: MoveRecord | undefined
      while (a.queue.length && tickDiff(a.tick, a.queue[0]!.tick) >= 0) last = a.queue.shift()
      if (last) {
        a.curr.x = last.x
        a.curr.z = last.z
        a.curr.heading = byteToHeading(last.heading)
      }
      a.curr.vx = a.curr.vz = 0
      a.input.mx = a.input.mz = 0
      return
    }
    stepSim(a.curr, a.input)
    while (a.queue.length && tickDiff(a.tick, a.queue[0]!.tick) >= 0) {
      const rec = a.queue.shift()!
      const body = makeBody(rec.x, rec.z, byteToHeading(rec.heading))
      body.vx = a.curr.vx
      body.vz = a.curr.vz
      const input = decodeDir(rec.dir, { mx: 0, mz: 0 })
      const age = Math.max(0, Math.min(MAX_CATCHUP, tickDiff(a.tick, rec.tick)))
      for (let i = 0; i < age; i += 1) stepSim(body, input)
      // Sai lệch giữa vị trí dự đoán (curr) và vị trí server vừa báo (body).
      // draw = nội suy(prev, curr, alpha) + blend. Nếu chỉ đặt curr = body rồi bù bằng blend thì đường đi của draw bị gãy ở khúc
      // prev→curr (phần sai lệch bị nội suy hết trong 1 tick thay vì lan ra BLEND_TAU) — nhìn thấy là giật khi người kia đổi hướng.
      // Dịch cả prev đi cùng một đoạn như curr thì đường đi của draw không đổi, sai lệch nằm hết trong blend và tan dần mượt.
      const ox = a.curr.x + a.blendX - body.x
      const oz = a.curr.z + a.blendZ - body.z
      if (Math.hypot(ox, oz) > 2) {
        a.blendX = a.blendZ = 0 // lệch quá xa: dịch thẳng tới vị trí mới
      } else {
        a.prev.x += body.x - a.curr.x
        a.prev.z += body.z - a.curr.z
        a.blendX = ox
        a.blendZ = oz
      }
      copyBody(a.curr, body)
      a.input.mx = input.mx
      a.input.mz = input.mz
    }
  }

  /** Gọi mỗi khung hình. `mx, mz` là hướng muốn đi (theo thế giới), `frozen` khi đang nói chuyện / ngồi. */
  frame(dtSec: number, mx: number, mz: number, frozen: boolean) {
    const me = this.local
    if (this.state.phase !== 'inCave' || !me) return
    const target = this.renderTick()
    for (const a of this.actors.values()) {
      if (a.local) continue
      const d = tickDiff(target, a.tick)
      if (d > RESYNC_TICKS) {
        for (let i = 0; i < Math.min(d, MAX_CATCHUP); i += 1) {
          copyBody(a.prev, a.curr)
          this.stepRemote(a)
        }
        a.tick = Math.round(target) & 65535
      } else if (d < -RESYNC_TICKS) a.tick = Math.round(target) & 65535
    }
    this.acc = Math.min(this.acc + dtSec, 0.25)
    const input = frozen || this.gaming || !this.live ? { mx: 0, mz: 0 } : { mx, mz }
    while (this.acc >= SIM_DT) {
      for (const a of this.actors.values()) {
        copyBody(a.prev, a.curr)
        if (a.local) {
          if (!this.seat) stepSim(a.curr, input)
        }
        else this.stepRemote(a)
      }
      this.acc -= SIM_DT
    }
    const alpha = this.acc / SIM_DT
    const decay = Math.exp(-dtSec / BLEND_TAU)
    for (const a of this.actors.values()) {
      lerpBody(a.draw, a.prev, a.curr, alpha)
      a.draw.x += a.blendX
      a.draw.z += a.blendZ
      if (a.blendX !== 0 || a.blendZ !== 0) {
        a.blendX *= decay
        a.blendZ *= decay
        if (Math.abs(a.blendX) < 0.001 && Math.abs(a.blendZ) < 0.001) a.blendX = a.blendZ = 0
      }
    }
    this.reportLocal(me, input)
    const t = performance.now()
    for (const [index, b] of this.bubbles) if (b.until < t) this.bubbles.delete(index)
    const s = this.state
    if (s.toast === null && !s.asking && !s.invite) return
    if (s.asking && s.asking.until < t) this.set({ asking: null })
    if (s.invite && s.invite.until < t) this.set({ invite: null })
  }

  private reportLocal(me: Actor, input: { mx: number; mz: number }) {
    const socket = this.ws
    if (!this.live || !socket || socket.readyState !== WebSocket.OPEN) return
    const now = performance.now()
    const dir = encodeDir(input.mx, input.mz)
    const changed = dir !== this.lastDir
    const settle = this.settleAt > 0 && now >= this.settleAt
    const keepalive = dir !== 0 && now - this.lastSent >= KEEPALIVE_SEND
    if ((!changed && !settle && !keepalive) || now - this.lastSent < MIN_SEND_GAP) return
    const tick = Math.floor((now * this.tickHz) / 1000) & 65535
    socket.send(encodeMove(me.curr.x, me.curr.z, headingToByte(me.curr.heading), dir, tick))
    this.lastSent = now
    this.lastDir = dir
    this.settleAt = changed ? now + SETTLE_SEND : 0
  }

  private standStill(peer?: number) {
    const me = this.local
    if (!me) return
    const other = peer === undefined ? undefined : this.actors.get(peer)
    if (other) me.curr.heading = me.prev.heading = Math.atan2(other.draw.x - me.curr.x, other.draw.z - me.curr.z)
    copyBody(me.prev, me.curr)
    me.curr.vx = me.curr.vz = me.prev.vx = me.prev.vz = 0
    this.lastDir = -1
  }

  // ---------- chat ----------
  private pushChat(m: Omit<ChatMsg, 'id'>) {
    const chat = [...this.state.chat, { ...m, id: this.msgId++ }]
    this.set({ chat: chat.length > CHAT_KEEP ? chat.slice(-CHAT_KEEP) : chat })
  }
  private pushNotice(text: string) {
    clearTimeout(this.noticeTimer)
    this.set({ notice: text })
    this.noticeTimer = setTimeout(() => this.set({ notice: null }), 4000)
  }
  private bubble(index: number, text: string) {
    this.bubbles.set(index, { text, until: performance.now() + Math.min(10_000, 5000 + text.length * 60) })
  }
  private onChatRows(rows: unknown[]) {
    for (const row of rows) {
      if (!Array.isArray(row)) continue
      const index = Number(row[0])
      const text = String(row[1] ?? '')
      if (index === this.selfIndex || !text) continue
      this.bubble(index, text)
      this.pushChat({ name: this.people.get(index)?.name ?? 'Ẩn danh', text, self: false, state: 'sent', ...(text.startsWith(PUNCH_PREFIX) ? { activity: true } : {}) })
    }
  }
  private onChatAck(id: number, text: string) {
    this.set({ chat: this.state.chat.map((m) => (m.self && m.clientId === id ? { ...m, text, state: 'sent' as const } : m)) })
  }
  private onChatDropped(reason: string, id?: number) {
    const chat = this.state.chat.slice()
    const at = id === undefined ? chat.findIndex((m) => m.self && m.state === 'pending') : chat.findIndex((m) => m.self && m.clientId === id)
    if (at >= 0) chat[at] = { ...chat[at]!, state: 'failed' }
    this.set({ chat })
    this.pushNotice(DROP_TEXT[reason] ?? DROP_TEXT.busy!)
  }

  /** Trả về false nếu tin bị chặn ở client. */
  sendChat(raw: string): boolean {
    const text = sanitizeChat(raw)
    if (!text || Array.from(raw).length > CHAT_MAX_CHARS * 2) return false
    const now = performance.now()
    if (now - this.lastChatAt < CHAT_MIN_INTERVAL_MS) {
      this.pushNotice(DROP_TEXT.rate!)
      return false
    }
    this.chatSeq = (this.chatSeq % 4_294_967_295) + 1
    if (!this.sendJson({ t: 'chat', text, id: this.chatSeq })) return false
    this.lastChatAt = now
    this.bubble(this.selfIndex, text)
    this.pushChat({ name: this.people.get(this.selfIndex)?.name ?? this.name, text, self: true, state: 'pending', clientId: this.chatSeq })
    return true
  }

  // ---------- đấm ----------
  nearest(maxDistance: number, humansOnly = false): { actor: Actor; distance: number } | null {
    const me = this.local
    if (!me) return null
    let best: { actor: Actor; distance: number } | null = null
    for (const a of this.actors.values()) {
      if (a.local || (humansOnly && a.bot)) continue
      const distance = Math.hypot(a.draw.x - me.draw.x, a.draw.z - me.draw.z)
      if (distance <= maxDistance && (!best || distance < best.distance)) best = { actor: a, distance }
    }
    return best
  }

  /**
   * Người sẽ bị đấm: gần nhất trong tầm 1,8; trong 0,9 thì đủ mọi hướng, xa hơn thì phải nằm trong hình nón phía trước mặt (±70°).
   * Bỏ qua người đang bận (chat riêng/võ thuật). Theo hàm chọn mục tiêu của bản gốc.
   */
  punchTarget(): Actor | null {
    const me = this.local
    if (!me) return null
    const candidates = [...this.actors.values()]
      .filter((a) => !a.local && !this.engaged.has(a.index))
      .map((a) => ({ id: a.index, x: a.curr.x + a.blendX, z: a.curr.z + a.blendZ }))
    const id = pickTarget(me.curr.heading, { x: me.curr.x + me.blendX, z: me.curr.z + me.blendZ }, candidates)
    return id === null ? null : (this.actors.get(id) ?? null)
  }

  punch(): boolean {
    const now = performance.now()
    // Thời gian hồi áp cho cả hoạt hình vung tay (như bản gốc), không chỉ cho đòn trúng.
    if (!this.live || now - this.punchAnimAt < PUNCH_ANIM_COOLDOWN_MS || this.state.conv || this.gaming) return false
    this.punchAnimAt = now
    audio.play('throw') // tiếng vung tay; tiếng trúng đòn do server xác nhận phát sau
    const target = this.punchTarget()
    this.punchTargetIndex = target?.index ?? -1
    // Bản gốc không báo gì lên server khi đấm hụt; `swing` là tin tự đặt để người khác cũng thấy cú vung hụt.
    if (!target) {
      this.sendJson({ t: 'swing' })
      return true // vung tay không trúng ai
    }
    return this.sendJson({ t: 'punch', target: target.index })
  }

  // ---------- ngồi ghế hội trường ----------
  private seat: { x: number; z: number } | null = null
  get seated(): boolean {
    return this.seat !== null
  }
  /** Ngồi vào ghế: dịch người chơi lên ghế, quay mặt về màn hình, đứng yên (không chạy va chạm) cho tới khi đứng dậy. */
  sitAt(seat: { x: number; z: number; y?: number; bench: number }, heading: number): void {
    const me = this.local
    if (!me || !this.live) return
    for (const b of [me.curr, me.prev, me.draw]) {
      b.x = seat.x
      b.z = seat.z
      if (seat.y !== undefined) b.y = seat.y // ngồi lên khán đài: lên đúng độ cao bậc (người ngồi không chạy mô phỏng nên y không tự theo sàn)
      b.vx = b.vz = 0
      b.heading = heading
    }
    me.blendX = me.blendZ = 0
    this.seat = { x: seat.x, z: seat.z }
    this.sendJson({ t: 'sit', bench: seat.bench }) // server kiểm tra (ghế trống, đủ gần) rồi báo cả hang
  }
  /** Đứng dậy ở chỗ `to` (trước hàng ghế). */
  standUpAt(to: { x: number; z: number }): void {
    const me = this.local
    this.seat = null
    if (!me) return
    for (const b of [me.curr, me.prev, me.draw]) {
      b.x = to.x
      b.z = to.z
      b.vx = b.vz = 0
    }
    this.sendJson({ t: 'stand' }) // server đặt người chơi ra hành lang trước ghế (cùng chỗ với `to`)
  }

  /** Đi qua cửa vào/ra một khu đặc biệt (bấm E ở cửa): dịch người chơi sang đầu kia, quay mặt theo hướng cửa, rồi báo server kiểm tra. */
  passGate(gate: { id: string }, to: { x: number; z: number; y?: number; heading: number }): void {
    const me = this.local
    if (!me || !this.live || this.seat) return
    for (const b of [me.curr, me.prev, me.draw]) {
      b.x = to.x
      b.z = to.z
      if (to.y !== undefined) b.y = to.y
      b.vx = b.vz = 0
      b.heading = to.heading
    }
    me.blendX = me.blendZ = 0
    this.sendJson({ t: 'gate', id: gate.id }) // server kiểm tra đang đứng gần cửa; sai thì lần báo vị trí kế tiếp bị kéo về
  }

  /** Đổi trang phục ngay trong hang: server chuẩn hoá rồi báo cả hang (kể cả mình) bằng {t:'look'}. */
  changeLook(look: number): boolean {
    if (!this.live) return false
    this.look = normalizeLookCode(look)
    return this.sendJson({ t: 'look', look: this.look })
  }

  /** Ăn mừng (phím G). Server chuyển cho cả hang; client chỉ gửi, hoạt hình chạy khi nhận lại (cả hai phía cùng một nguồn). */
  emote(): boolean {
    const now = performance.now()
    if (!this.live || now - this.lastEmoteSent < EMOTE_COOLDOWN_MS || this.state.conv || this.gaming) return false
    this.lastEmoteSent = now
    return this.sendJson({ t: 'emote' })
  }

  // ---------- mời / nói chuyện ----------
  private toast(text: string) {
    clearTimeout(this.toastTimer)
    this.set({ toast: text })
    this.toastTimer = setTimeout(() => this.set({ toast: null }), 3500)
  }

  private onInviteDeclined(m: Record<string, unknown>) {
    const asking = this.state.asking
    const target = Number(m.target)
    const name = asking?.name ?? this.people.get(target)?.name ?? 'Người đó'
    if (asking?.target === target) this.set({ asking: null })
    const wait = typeof m.waitMs === 'number' && m.waitMs > 0 ? Math.min(m.waitMs, 3_600_000) : 0
    if ((m.reason === 'declined' || m.reason === 'cooldown') && wait > 0) {
      this.set({ cooldowns: { ...this.state.cooldowns, [target]: performance.now() + wait } })
      return this.toast(`${name} vừa từ chối · mời lại sau ${Math.ceil(wait / 1000)}s`)
    }
    if (m.reason === 'wait') {
      this.waitUntil = performance.now() + (wait || 1000)
      return this.toast(wait >= 1500 ? `Chờ ${Math.ceil(wait / 1000)}s rồi hãy mời tiếp` : 'Chờ chút rồi hãy mời tiếp')
    }
    const text =
      m.reason === 'busy' ? `${name} đang bận`
      : m.reason === 'far' ? `Lại gần ${name} hơn chút nữa`
      : m.reason === 'gone' ? `${name} đã đi xa, chưa giao lưu được`
      : `${name} chưa trả lời`
    this.toast(text)
  }

  /** Mời người gần nhất. Duel chưa dựng ở server nên giao diện chỉ gọi 'talk'. */
  ask(kind: InviteKind, target: number): boolean {
    const now = performance.now()
    const actor = this.actors.get(target)
    if (!this.live || !actor || this.state.asking || this.state.conv || this.gaming || now < this.waitUntil) return false
    if (this.engaged.has(target)) {
      this.toast(`${actor.name} đang bận`)
      return false
    }
    if ((this.state.cooldowns[target] ?? 0) > now) return false
    if (this.nearest(INVITE_RANGE, true)?.actor.index !== target && !this.withinInvite(actor)) return false
    if (!this.sendJson({ t: 'inviteAsk', kind, target })) return false
    this.set({ asking: { target, kind, name: actor.name, until: now + 20_000 } })
    return true
  }
  private withinInvite(a: Actor): boolean {
    const me = this.local
    return !!me && Math.hypot(a.draw.x - me.draw.x, a.draw.z - me.draw.z) <= INVITE_RANGE
  }
  cancelAsk() {
    if (!this.state.asking) return
    this.sendJson({ t: 'inviteCancel' })
    this.set({ asking: null })
  }
  answer(accept: boolean) {
    const invite = this.state.invite
    if (!invite) return
    this.sendJson({ t: 'inviteAnswer', id: invite.id, accept })
    this.set({ invite: null })
  }

  private pushTalk(msg: TalkMsg) {
    const conv = this.state.conv
    if (conv) this.set({ conv: { ...conv, messages: [...conv.messages, msg].slice(-100) } })
  }
  sendDm(raw: string): boolean {
    const conv = this.state.conv
    const text = sanitizeChat(raw, 400)
    if (!conv || conv.ended || !text) return false
    const id = ++this.dmSeq
    if (!this.sendJson({ t: 'dm', text, id })) return false
    this.pushTalk({ key: id, mine: true, text, pending: true })
    return true
  }
  endTalk() {
    const conv = this.state.conv
    if (!conv || conv.ended) return
    this.sendJson({ t: 'talkEnd' })
    this.set({ conv: { ...conv, ended: { byMe: true, reason: 'end' } } })
  }
  dismissTalk() {
    this.set({ conv: null })
  }

  vote(option: number) {
    const poll = this.state.poll
    if (!poll || this.state.pollVoted) return
    if (this.sendJson({ t: 'vote', poll: poll.id, option })) this.set({ pollVoted: true })
  }

  private sendJson(value: unknown): boolean {
    const socket = this.ws
    if (!this.live || socket?.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(value))
    return true
  }
}
