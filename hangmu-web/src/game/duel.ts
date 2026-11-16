import { audio } from './audio.ts'

// Client của gói `duel` (giao lưu võ thuật). Hình dạng message khớp client gốc.
// Giao diện ở đây là lớp phủ 2D, chưa dựng sàn đấu 3D như bản gốc.
export type DuelPhase = 'idle' | 'countdown' | 'fight' | 'ended'
export type Pose = 'idle' | 'windup' | 'strike' | 'guard' | 'hurt' | 'hit' | 'block' | 'ko'

export interface DuelRules {
  hp: number
  dmg: number
  windupMs: number
  blockMs: number
  blockCdMs: number
  punchCdMs: number
}
export const DEFAULT_RULES: DuelRules = { hp: 100, dmg: 15, windupMs: 500, blockMs: 400, blockCdMs: 600, punchCdMs: 800 }

export type EndResult = 'ko' | 'big' | 'close' | 'draw' | 'quit'
export const RESULT_TITLE: Record<EndResult, string> = {
  ko: 'HẠ ĐO VÁN',
  big: 'HẾT GIỜ · THẮNG ĐẬM',
  close: 'HẾT GIỜ · THẮNG SÁT NÚT',
  draw: 'HẾT GIỜ · HOÀ',
  quit: 'BỎ CUỘC',
}

export const TAUNTS: Record<string, string> = {
  start: 'Cậy mày học lớp 7 mày đánh được tao à?',
  cornered: 'Chó cậy gần nhà!',
  blocked: 'À thế làm sao mà à?',
  stubborn: 'Lớp 1 đến lớp 5 tao còn chưa sợ!',
}

export interface DuelEnd {
  result: EndResult
  won: boolean | null
  winner: string
  loser: string
  hpWinner: number
  hpLoser: number
  hits: number
  blocks: number
  closeAt: number
}

export interface DuelView {
  phase: DuelPhase
  peer: number
  peerName: string
  myName: string
  rules: DuelRules
  roundMs: number
  goAt: number
  endAt: number
  hpMe: number
  hpPeer: number
  opp: Pose
  me: Pose
  hurtSeq: number
  taunt: null | { key: string; who: string; text: string; seq: number }
  confirmQuit: boolean
  end: DuelEnd | null
  blockReady: number
  punchReady: number
  rank: Array<{ name: string; wins: number }>
}

const IDLE: DuelView = {
  phase: 'idle', peer: -1, peerName: '', myName: '', rules: DEFAULT_RULES, roundMs: 30_000, goAt: 0, endAt: 0,
  hpMe: 100, hpPeer: 100, opp: 'idle', me: 'idle', hurtSeq: 0, taunt: null, confirmQuit: false, end: null,
  blockReady: 0, punchReady: 0, rank: [],
}

export interface DuelHost {
  selfIndex: () => number
  nameOf: (index: number) => string | undefined
  standStill: (peer: number) => void
  send: (g: string, d: Record<string, unknown>) => boolean
  notify: (text: string) => void
}

const CLOSE_AFTER_MS = 6000
const TAUNT_MS = 2600

const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback

function hpOf(list: unknown, index: number): number | null {
  if (!Array.isArray(list)) return null
  for (const row of list) if (Array.isArray(row) && row[0] === index && typeof row[1] === 'number') return Math.max(0, row[1])
  return null
}

export class DuelClient {
  private view: DuelView = IDLE
  private listeners = new Set<() => void>()
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private myImpactAt = 0
  private blockUntil = 0
  private host: DuelHost
  constructor(host: DuelHost) {
    this.host = host
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.view
  get active(): boolean {
    return this.view.phase === 'countdown' || this.view.phase === 'fight' || this.view.phase === 'ended'
  }

  private set(patch: Partial<DuelView>) {
    this.view = { ...this.view, ...patch }
    this.listeners.forEach((fn) => fn())
  }
  private later(ms: number, fn: () => void) {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      fn()
    }, ms)
    this.timers.add(timer)
  }
  private clearTimers() {
    this.timers.forEach(clearTimeout)
    this.timers.clear()
    this.myImpactAt = 0
    this.blockUntil = 0
  }
  private poseOpp(pose: Pose, resetMs?: number) {
    this.set({ opp: pose })
    if (resetMs) this.later(resetMs, () => this.view.opp === pose && this.set({ opp: 'idle' }))
  }
  private poseMe(pose: Pose, resetMs?: number) {
    this.set({ me: pose })
    if (resetMs) this.later(resetMs, () => this.view.me === pose && this.set({ me: 'idle' }))
  }

  onMessage(d: Record<string, unknown>) {
    const now = performance.now()
    const me = this.host.selfIndex()
    const v = this.view
    switch (d.a) {
      case 'rank': {
        const top = Array.isArray(d.top) ? d.top : []
        const rank = top
          .filter((r): r is [string, number] => Array.isArray(r) && typeof r[0] === 'string' && r[0].length > 0 && Number.isInteger(r[1]) && (r[1] as number) > 0)
          .slice(0, 8)
          .map(([name, wins]) => ({ name: name.slice(0, 40), wins }))
        this.set({ rank })
        return
      }
      case 'start': {
        const peer = typeof d.peer === 'number' ? d.peer : -1
        if (peer < 0) return
        const r = (d.rules ?? {}) as Record<string, unknown>
        const rules: DuelRules = {
          hp: clamp(r.hp, 1, 1000, DEFAULT_RULES.hp),
          dmg: clamp(r.dmg, 1, 1000, DEFAULT_RULES.dmg),
          windupMs: clamp(r.windupMs, 50, 5000, DEFAULT_RULES.windupMs),
          blockMs: clamp(r.blockMs, 50, 5000, DEFAULT_RULES.blockMs),
          blockCdMs: clamp(r.blockCdMs, 0, 10_000, DEFAULT_RULES.blockCdMs),
          punchCdMs: clamp(r.punchCdMs, 0, 10_000, DEFAULT_RULES.punchCdMs),
        }
        this.clearTimers()
        this.host.standStill(peer)
        if (document.pointerLockElement) document.exitPointerLock()
        this.view = {
          ...IDLE, rank: v.rank, phase: 'countdown', peer,
          peerName: typeof d.name === 'string' && d.name ? d.name.slice(0, 40) : (this.host.nameOf(peer) ?? 'Đối thủ'),
          myName: this.host.nameOf(me) ?? 'Bạn', rules, roundMs: clamp(d.roundMs, 1000, 600_000, 30_000),
          goAt: now + clamp(d.countdownMs, 0, 30_000, 5000), hpMe: rules.hp, hpPeer: rules.hp,
        }
        this.listeners.forEach((fn) => fn())
        audio.play('bell')
        audio.startMusic()
        return
      }
      case 'go': {
        if (v.phase !== 'countdown') return
        const ms = clamp(d.roundMs, 1000, 600_000, v.roundMs)
        this.set({ phase: 'fight', endAt: now + ms })
        audio.play('bell')
        this.later(Math.max(0, ms - 10_000), () => audio.intenseMusic())
        return
      }
      case 'windup':
        if (v.phase !== 'fight' || d.by !== v.peer) return
        this.poseOpp('windup')
        this.later(clamp(d.impactInMs, 0, 5000, v.rules.windupMs), () => this.view.opp === 'windup' && this.poseOpp('strike', 260))
        return
      case 'guard':
        if (v.phase === 'fight' && d.by === v.peer) this.poseOpp('guard', clamp(d.ms, 50, 5000, 400))
        return
      case 'result': {
        if (v.phase !== 'fight') return
        const blocked = d.blocked === true
        const hpMe = hpOf(d.hp, me) ?? v.hpMe
        const hpPeer = hpOf(d.hp, v.peer) ?? v.hpPeer
        if (d.target === me) {
          if (blocked) {
            this.poseMe('block', 300)
            audio.play('block')
          } else {
            audio.play('hit')
            this.set({ hurtSeq: v.hurtSeq + 1 })
            this.poseMe('hit', 260)
            navigator.vibrate?.(60)
          }
        } else if (d.target === v.peer) {
          if (blocked) {
            this.poseOpp('guard', 300)
            audio.play('block')
          } else {
            this.poseOpp('hurt', 320)
            audio.play('punch')
          }
        }
        this.set({ hpMe, hpPeer })
        return
      }
      case 'taunt': {
        const key = typeof d.key === 'string' && d.key in TAUNTS ? d.key : null
        if (!key || (v.phase !== 'fight' && v.phase !== 'countdown')) return
        const seq = Date.now()
        this.set({ taunt: { key, who: d.by === v.peer ? v.peerName : v.myName, text: TAUNTS[key]!, seq } })
        this.later(TAUNT_MS, () => this.view.taunt?.seq === seq && this.set({ taunt: null }))
        return
      }
      case 'end': {
        if (v.phase === 'idle' || v.phase === 'ended') return
        this.clearTimers()
        audio.stopMusic()
        audio.play(typeof d.reason === 'string' && d.reason === 'ko' ? 'ko' : 'bell')
        const winner = typeof d.winner === 'number' ? d.winner : null
        const hpMe = hpOf(d.hp, me) ?? v.hpMe
        const hpPeer = hpOf(d.hp, v.peer) ?? v.hpPeer
        const won = winner === null ? null : winner === me
        const [wName, lName, wHp, lHp] = won === false ? [v.peerName, v.myName, hpPeer, hpMe] : [v.myName, v.peerName, hpMe, hpPeer]
        const reason = typeof d.reason === 'string' ? d.reason : 'time'
        const stat = (Array.isArray(d.stats) ? d.stats : []).find((s): s is unknown[] => Array.isArray(s) && s[0] === me)
        const diff = Math.abs(hpMe - hpPeer)
        const result: EndResult = reason === 'quit' || reason === 'left' ? 'quit' : reason === 'ko' ? 'ko' : winner === null ? 'draw' : diff >= 40 ? 'big' : 'close'
        this.set({
          phase: 'ended', confirmQuit: false, hpMe, hpPeer, opp: won === true && reason === 'ko' ? 'ko' : 'idle', me: won === false && reason === 'ko' ? 'ko' : 'idle',
          end: { result, won, winner: wName, loser: lName, hpWinner: wHp, hpLoser: lHp, hits: typeof stat?.[1] === 'number' ? stat[1] : 0, blocks: typeof stat?.[2] === 'number' ? stat[2] : 0, closeAt: now + CLOSE_AFTER_MS },
        })
        this.later(CLOSE_AFTER_MS, () => this.close())
        return
      }
    }
  }

  block() {
    const v = this.view
    const t = performance.now()
    if (v.phase !== 'fight' || v.confirmQuit || t < v.blockReady || this.myImpactAt) return
    if (!this.host.send('duel', { a: 'block' })) return
    this.blockUntil = t + v.rules.blockMs
    this.set({ blockReady: t + v.rules.blockMs + v.rules.blockCdMs })
    this.poseMe('guard', v.rules.blockMs)
  }
  punch() {
    const v = this.view
    const t = performance.now()
    if (v.phase !== 'fight' || v.confirmQuit || t < v.punchReady || t < this.blockUntil || this.myImpactAt) return
    if (!this.host.send('duel', { a: 'punch' })) return
    this.myImpactAt = t + v.rules.windupMs
    this.set({ punchReady: this.myImpactAt + v.rules.punchCdMs })
    this.poseMe('windup')
    this.later(v.rules.windupMs, () => {
      this.myImpactAt = 0
      if (this.view.phase === 'fight') this.poseMe('strike', 220)
    })
  }
  askQuit() {
    if (this.view.phase === 'countdown' || this.view.phase === 'fight') this.set({ confirmQuit: true })
    else if (this.view.phase === 'ended') this.close()
  }
  cancelQuit() {
    if (this.view.confirmQuit) this.set({ confirmQuit: false })
  }
  quit() {
    this.host.send('duel', { a: 'quit' })
    this.set({ confirmQuit: false })
  }
  close() {
    if (this.view.phase !== 'ended') return
    this.clearTimers()
    this.view = { ...IDLE, rank: this.view.rank }
    this.listeners.forEach((fn) => fn())
  }
  /** Mất kết nối giữa trận: server xử thua. */
  connectionLost() {
    if (this.view.phase !== 'countdown' && this.view.phase !== 'fight') return
    const name = this.view.peerName
    this.reset()
    this.host.notify(`Mất kết nối giữa trận giao lưu võ thuật — bị xử thua, ${name} thắng.`)
  }
  reset() {
    this.clearTimers()
    audio.stopMusic()
    this.view = { ...IDLE }
    this.listeners.forEach((fn) => fn())
  }
}
