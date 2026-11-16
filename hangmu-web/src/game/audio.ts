// Âm thanh tổng hợp bằng WebAudio: không dùng file âm thanh nào, nên không có vấn đề bản quyền và không tốn băng thông.
// Trình duyệt chỉ cho phát sau một thao tác của người dùng, nên `unlock()` phải được gọi từ sự kiện chạm/phím đầu tiên.

export type SfxName = 'join' | 'punch' | 'hit' | 'block' | 'bell' | 'ko' | 'throw' | 'splat' | 'ui' | 'invite' | 'notify' | 'cheer'

// Khoá lưu trữ giống bản gốc: `hangmu.muted` ('1' | '0') và `hangmu.volume` (0–100, mặc định 35).
const MUTED_KEY = 'hangmu.muted'
const VOLUME_KEY = 'hangmu.volume'
const LEGACY_KEY = 'hangmu.sound' // bản trước của bản dựng lại: 'off' | 'on'
export const DEFAULT_VOLUME = 35
const MASTER = 0.55 // độ lớn tại âm lượng mặc định
const MASTER_MAX = 1.2
const MUSIC_GAIN = 0.3
const LOOKAHEAD_S = 0.25
const SCHEDULER_MS = 60

type ContextCtor = new () => AudioContext

function contextCtor(): ContextCtor | null {
  const g = globalThis as unknown as { AudioContext?: ContextCtor; webkitAudioContext?: ContextCtor }
  return g.AudioContext ?? g.webkitAudioContext ?? null
}

interface Bus {
  ctx: AudioContext
  master: GainNode
  sfx: GainNode
  music: GainNode
  noise: AudioBuffer
}

export const clampVolume = (v: number): number => (Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : DEFAULT_VOLUME)

/** Độ lớn tổng (gain) cho một mức âm lượng 0–100: mức mặc định đúng bằng MASTER, tối đa MASTER_MAX. */
export const masterGain = (volume: number): number => Math.min(MASTER_MAX, (MASTER * clampVolume(volume)) / DEFAULT_VOLUME)

function readSettings(): { muted: boolean; volume: number } {
  try {
    const rawVolume = localStorage.getItem(VOLUME_KEY)
    const volume = rawVolume === null ? DEFAULT_VOLUME : clampVolume(Number(rawVolume))
    const muted = localStorage.getItem(MUTED_KEY) === '1' || (localStorage.getItem(MUTED_KEY) === null && localStorage.getItem(LEGACY_KEY) === 'off')
    return { muted, volume }
  } catch {
    return { muted: false, volume: DEFAULT_VOLUME }
  }
}

// ---------- phần tử dựng âm ----------
interface ToneOptions {
  type?: OscillatorType
  freq: number
  freqEnd?: number
  start: number
  dur: number
  gain: number
  attack?: number
}

function tone(bus: Bus, out: AudioNode, o: ToneOptions): void {
  const { ctx } = bus
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.freq, o.start)
  if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), o.start + o.dur)
  const attack = o.attack ?? 0.005
  env.gain.setValueAtTime(0.0001, o.start)
  env.gain.exponentialRampToValueAtTime(o.gain, o.start + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, o.start + o.dur)
  osc.connect(env)
  env.connect(out)
  osc.start(o.start)
  osc.stop(o.start + o.dur + 0.05)
}

interface NoiseOptions {
  start: number
  dur: number
  gain: number
  filter?: BiquadFilterType
  freq?: number
  freqEnd?: number
  q?: number
}

function noise(bus: Bus, out: AudioNode, o: NoiseOptions): void {
  const { ctx } = bus
  const src = ctx.createBufferSource()
  src.buffer = bus.noise
  const filter = ctx.createBiquadFilter()
  filter.type = o.filter ?? 'lowpass'
  filter.frequency.setValueAtTime(o.freq ?? 2000, o.start)
  if (o.freqEnd !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), o.start + o.dur)
  filter.Q.value = o.q ?? 0.7
  const env = ctx.createGain()
  env.gain.setValueAtTime(o.gain, o.start)
  env.gain.exponentialRampToValueAtTime(0.0001, o.start + o.dur)
  src.connect(filter)
  filter.connect(env)
  env.connect(out)
  src.start(o.start)
  src.stop(o.start + o.dur + 0.05)
}

/** Thời gian tiếng reo khán đài kéo dài (giây): lên nhanh, giữ, rồi nhỏ dần. */
export const ROAR_SECONDS = 8.5

/**
 * Tiếng khán đài reo (hiện chưa nơi nào gọi, để dành cho khoảnh khắc ăn mừng): nhiễu lọc thành ba dải tần (giọng người đông) rung nhẹ theo ba LFO chậm,
 * lên trong 0,35 s, giữ tới ~3 s, rồi tắt dần. Dải tần/LFO là lựa chọn của bản dựng lại. Mỗi lần chỉ một tiếng reo: gọi lại thì tiếng cũ tắt.
 */
function roar(bus: Bus, t: number): void {
  const { ctx } = bus
  activeRoar?.()
  const out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, t)
  out.gain.linearRampToValueAtTime(0.55, t + 0.35)
  out.gain.setValueAtTime(0.55, t + 3.2)
  out.gain.exponentialRampToValueAtTime(0.001, t + ROAR_SECONDS)
  out.connect(bus.sfx)
  const nodes: Array<{ stop(when?: number): void }> = []
  for (const band of [{ freq: 420, q: 0.9, gain: 0.9, wobble: 2.1 }, { freq: 900, q: 1.1, gain: 0.7, wobble: 3.3 }, { freq: 1900, q: 1.4, gain: 0.35, wobble: 4.7 }]) {
    const src = ctx.createBufferSource()
    src.buffer = bus.noise
    src.loop = true
    src.playbackRate.value = 0.9 + Math.random() * 0.2
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = band.freq
    filter.Q.value = band.q
    const level = ctx.createGain()
    level.gain.value = band.gain
    const lfo = ctx.createOscillator()
    lfo.frequency.value = band.wobble
    const depth = ctx.createGain()
    depth.gain.value = band.gain * 0.25
    lfo.connect(depth)
    depth.connect(level.gain)
    src.connect(filter)
    filter.connect(level)
    level.connect(out)
    src.start(t, Math.random() * 0.8)
    lfo.start(t)
    src.stop(t + ROAR_SECONDS + 0.1)
    lfo.stop(t + ROAR_SECONDS + 0.1)
    nodes.push(src, lfo)
  }
  const cancel = () => {
    if (activeRoar !== cancel) return
    activeRoar = null
    try {
      out.gain.cancelScheduledValues(ctx.currentTime)
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
      for (const n of nodes) n.stop(ctx.currentTime + 0.3)
    } catch {
      /* đã dừng */
    }
  }
  activeRoar = cancel
}
let activeRoar: (() => void) | null = null

const SFX: Record<SfxName, (bus: Bus, t: number) => void> = {
  cheer: roar,
  join(bus, t) {
    tone(bus, bus.sfx, { freq: 392, start: t, dur: 0.35, gain: 0.35, attack: 0.02 })
    tone(bus, bus.sfx, { freq: 587, start: t + 0.12, dur: 0.5, gain: 0.3, attack: 0.02 })
    tone(bus, bus.sfx, { type: 'triangle', freq: 784, start: t + 0.24, dur: 0.6, gain: 0.18, attack: 0.02 })
  },
  punch(bus, t) {
    tone(bus, bus.sfx, { freq: 150, freqEnd: 55, start: t, dur: 0.14, gain: 0.7 })
    noise(bus, bus.sfx, { start: t, dur: 0.08, gain: 0.5, filter: 'bandpass', freq: 1800, q: 0.9 })
  },
  hit(bus, t) {
    tone(bus, bus.sfx, { freq: 110, freqEnd: 40, start: t, dur: 0.22, gain: 0.9 })
    noise(bus, bus.sfx, { start: t, dur: 0.16, gain: 0.7, filter: 'lowpass', freq: 3000, freqEnd: 300 })
  },
  block(bus, t) {
    tone(bus, bus.sfx, { type: 'square', freq: 880, freqEnd: 660, start: t, dur: 0.07, gain: 0.25 })
    noise(bus, bus.sfx, { start: t, dur: 0.05, gain: 0.4, filter: 'highpass', freq: 3500 })
  },
  bell(bus, t) {
    for (const [ratio, gain] of [[1, 0.4], [2.76, 0.22], [5.4, 0.12]] as const) {
      tone(bus, bus.sfx, { freq: 660 * ratio, start: t, dur: 1.3, gain, attack: 0.004 })
    }
  },
  ko(bus, t) {
    tone(bus, bus.sfx, { type: 'sawtooth', freq: 320, freqEnd: 60, start: t, dur: 0.9, gain: 0.35 })
    noise(bus, bus.sfx, { start: t, dur: 0.4, gain: 0.5, filter: 'lowpass', freq: 2500, freqEnd: 200 })
    tone(bus, bus.sfx, { freq: 90, freqEnd: 35, start: t + 0.05, dur: 0.6, gain: 0.8 })
  },
  throw(bus, t) {
    noise(bus, bus.sfx, { start: t, dur: 0.28, gain: 0.35, filter: 'bandpass', freq: 500, freqEnd: 2600, q: 1.2 })
  },
  splat(bus, t) {
    noise(bus, bus.sfx, { start: t, dur: 0.22, gain: 0.7, filter: 'lowpass', freq: 1400, freqEnd: 180 })
    tone(bus, bus.sfx, { freq: 200, freqEnd: 70, start: t, dur: 0.12, gain: 0.5 })
  },
  ui(bus, t) {
    tone(bus, bus.sfx, { type: 'triangle', freq: 720, start: t, dur: 0.06, gain: 0.2 })
  },
  invite(bus, t) {
    tone(bus, bus.sfx, { freq: 988, start: t, dur: 0.18, gain: 0.3 })
    tone(bus, bus.sfx, { freq: 1319, start: t + 0.14, dur: 0.3, gain: 0.3 })
  },
  notify(bus, t) {
    tone(bus, bus.sfx, { type: 'triangle', freq: 523, start: t, dur: 0.16, gain: 0.18 })
  },
}

// ---------- nhạc nền duel (tự soạn, vòng lặp 8 nhịp ~ 132 BPM) ----------
const BASS = [55, 55, 65.4, 55, 82.4, 55, 49, 55] // A1 A1 C2 A1 E2 A1 G1 A1
const ARP = [220, 261.6, 329.6, 261.6, 392, 329.6, 293.7, 261.6]
const STEP_S = 60 / 132 / 2

class Music {
  private bus: Bus
  private timer: ReturnType<typeof setInterval> | null = null
  private nextTime = 0
  private step = 0
  private intenseMode = false
  constructor(bus: Bus) {
    this.bus = bus
  }
  get running(): boolean {
    return this.timer !== null
  }
  start(): void {
    if (this.timer) return
    this.step = 0
    this.intenseMode = false
    this.nextTime = this.bus.ctx.currentTime + 0.05
    const { music } = this.bus
    music.gain.cancelScheduledValues(this.bus.ctx.currentTime)
    music.gain.setValueAtTime(0.0001, this.bus.ctx.currentTime)
    music.gain.exponentialRampToValueAtTime(MUSIC_GAIN, this.bus.ctx.currentTime + 0.6)
    this.timer = setInterval(() => this.schedule(), SCHEDULER_MS)
    this.schedule()
  }
  intense(): void {
    this.intenseMode = true
  }
  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    const { ctx, music } = this.bus
    music.gain.cancelScheduledValues(ctx.currentTime)
    music.gain.setValueAtTime(Math.max(0.0001, music.gain.value), ctx.currentTime)
    music.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
  }
  private schedule(): void {
    const { ctx, music } = this.bus
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      this.playStep(this.step % 8, this.nextTime, music)
      this.step += 1
      this.nextTime += STEP_S * (this.intenseMode ? 0.88 : 1)
    }
  }
  private playStep(i: number, t: number, out: AudioNode): void {
    const bus = this.bus
    if (i === 0 || i === 4) tone(bus, out, { freq: 130, freqEnd: 45, start: t, dur: 0.18, gain: 0.9 })
    if (i === 2 || i === 6) noise(bus, out, { start: t, dur: 0.12, gain: 0.45, filter: 'bandpass', freq: 1900, q: 0.8 })
    noise(bus, out, { start: t, dur: 0.03, gain: this.intenseMode || i % 2 === 1 ? 0.18 : 0.08, filter: 'highpass', freq: 7000 })
    tone(bus, out, { type: 'sawtooth', freq: BASS[i]!, start: t, dur: STEP_S * 0.9, gain: 0.32, attack: 0.01 })
    if (this.intenseMode || i % 2 === 0) {
      tone(bus, out, { type: 'square', freq: ARP[i]! * (this.intenseMode ? 2 : 1), start: t, dur: STEP_S * 0.5, gain: 0.07, attack: 0.005 })
    }
  }
}

/** WAV im lặng mono 8 kHz 8-bit dài 1 giây, tạo một lần rồi dùng lại. */
let silentUrl: string | null = null
function silentWavUrl(): string {
  if (silentUrl) return silentUrl
  const rate = 8000
  const bytes = new Uint8Array(44 + rate).fill(128) // 128 = mức im lặng của PCM 8-bit
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => [...value].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + rate, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  text(36, 'data')
  view.setUint32(40, rate, true)
  silentUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
  return silentUrl
}

// ---------- engine ----------
class AudioEngine {
  private bus: Bus | null = null
  private music: Music | null = null
  private muted = readSettings().muted
  private volume = readSettings().volume
  private listeners = new Set<() => void>()
  private pendingMusic = false

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  /** Đang im: tắt tiếng hoặc âm lượng 0 (giống `effectsSilent` của bản gốc). */
  getMuted = () => this.muted || this.volume === 0
  getVolume = () => this.volume
  private gain = () => (this.getMuted() ? 0 : masterGain(this.volume))
  get unlocked(): boolean {
    return this.bus !== null
  }

  /** Gọi từ một thao tác của người dùng (chạm/phím). Tạo AudioContext và mở khóa trên iOS/Safari. */
  unlock(): void {
    if (this.bus) {
      void this.bus.ctx.resume?.()
      return
    }
    const Ctor = contextCtor()
    if (!Ctor) return
    try {
      const ctx = new Ctor()
      const master = ctx.createGain()
      master.gain.value = this.gain()
      master.connect(ctx.destination)
      const sfx = ctx.createGain()
      sfx.connect(master)
      const music = ctx.createGain()
      music.gain.value = MUSIC_GAIN
      music.connect(master)
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
      this.bus = { ctx, master, sfx, music, noise: noiseBuffer }
      this.music = new Music(this.bus)
      void ctx.resume?.()
      this.keepAlivePlayback()
      if (this.pendingMusic) this.startMusic()
    } catch {
      this.bus = null
    }
  }

  /**
   * [Unverified] Trên iOS, WebAudio bị công tắc im lặng chặn trừ khi có một thẻ <audio> đang phát; phát một đoạn im lặng
   * lặp lại để chuyển sang kênh "phát media". Chưa kiểm chứng trên thiết bị thật. Chỉ bật trên iOS, và tệp phải có độ dài
   * thật: một tệp 0 giây phát lặp làm trình duyệt quay vòng liên tục và đứng luồng chính (đã gặp trong kiểm thử).
   */
  private keepAlivePlayback(): void {
    try {
      const nav = globalThis.navigator
      const ios = !!nav && (/iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1))
      if (!ios || typeof Audio === 'undefined') return
      const audio = new Audio(silentWavUrl())
      audio.loop = true
      audio.volume = 0.001
      void audio.play().catch(() => {})
    } catch {
      /* không có Audio: bỏ qua */
    }
  }

  play(name: SfxName): void {
    const bus = this.bus
    if (!bus || this.getMuted()) return
    try {
      SFX[name](bus, bus.ctx.currentTime + 0.005)
    } catch {
      /* âm thanh hỏng không được phép làm hỏng game */
    }
  }

  startMusic(): void {
    if (!this.bus || !this.music) {
      this.pendingMusic = true // sẽ phát ngay khi mở khóa được
      return
    }
    this.pendingMusic = true
    if (!this.getMuted()) this.music.start()
  }
  intenseMusic(): void {
    this.music?.intense()
  }
  stopMusic(): void {
    this.pendingMusic = false
    this.music?.stop()
  }

  private save(): void {
    try {
      localStorage.setItem(MUTED_KEY, this.muted ? '1' : '0')
      localStorage.setItem(VOLUME_KEY, String(this.volume))
    } catch {
      /* chế độ riêng tư: bỏ qua */
    }
  }
  private apply(): void {
    if (this.bus) {
      const { ctx, master } = this.bus
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setValueAtTime(this.gain(), ctx.currentTime)
      if (this.getMuted()) this.music?.stop()
      else if (this.pendingMusic) this.music?.start()
    }
    this.listeners.forEach((fn) => fn())
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    // bật tiếng lại khi âm lượng đang 0 thì về mức mặc định (nếu không, bấm "bật" mà vẫn im)
    if (!muted && this.volume === 0) this.volume = DEFAULT_VOLUME
    this.save()
    this.apply()
  }
  toggleMuted(): void {
    this.setMuted(!this.getMuted())
  }
  /** Đặt âm lượng 0–100. Kéo lên từ 0 thì tự bỏ tắt tiếng. */
  setVolume(volume: number): void {
    this.volume = clampVolume(volume)
    if (this.volume > 0) this.muted = false
    this.save()
    this.apply()
  }
}

export const audio = new AudioEngine()
