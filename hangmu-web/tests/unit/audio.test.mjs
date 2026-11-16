import test from 'node:test'
import assert from 'node:assert/strict'
import { sleep } from '../helpers/server.mjs'

// ---- AudioContext giả: chỉ đếm các nút được tạo và ghi lại tham số ----
let contexts = []
class Param {
  constructor(value = 0) {
    this.value = value
  }
  setValueAtTime(v) { this.value = v }
  exponentialRampToValueAtTime() {}
  linearRampToValueAtTime() {}
  setTargetAtTime(v) { this.value = v }
  cancelScheduledValues() {}
}
class FakeNode {
  connect(node) { return node }
}
class FakeContext {
  constructor() {
    this.currentTime = 0
    this.sampleRate = 8000
    this.destination = new FakeNode()
    this.counts = { osc: 0, src: 0, gain: 0, filter: 0, started: 0 }
    this.resumed = 0
    contexts.push(this)
  }
  createGain() { this.counts.gain += 1; const n = new FakeNode(); n.gain = new Param(1); this.gains = this.gains ?? []; this.gains.push(n); return n }
  createOscillator() { this.counts.osc += 1; const n = new FakeNode(); n.frequency = new Param(440); n.start = () => (this.counts.started += 1); n.stop = () => {}; return n }
  createBufferSource() { this.counts.src += 1; const n = new FakeNode(); n.playbackRate = new Param(1); n.start = () => (this.counts.started += 1); n.stop = () => {}; return n }
  createBiquadFilter() { this.counts.filter += 1; const n = new FakeNode(); n.frequency = new Param(); n.Q = new Param(); return n }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) } }
  resume() { this.resumed += 1; return Promise.resolve() }
}

const store = new Map()
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }

let version = 0
/** Mỗi test lấy một bản engine mới (module có trạng thái) bằng cách import với query khác nhau. */
async function fresh({ muted = false } = {}) {
  contexts = []
  store.clear()
  if (muted) store.set('hangmu.muted', '1')
  globalThis.AudioContext = FakeContext
  version += 1
  return (await import(`../../src/game/audio.ts?v=${version}`)).audio
}
const total = (ctx) => ctx.counts.osc + ctx.counts.src
const NAMES = ['join', 'punch', 'hit', 'block', 'bell', 'ko', 'throw', 'splat', 'ui', 'invite', 'notify', 'cheer']

test('chưa mở khóa thì phát không làm gì và không tạo AudioContext', async () => {
  const audio = await fresh()
  audio.play('punch')
  audio.startMusic()
  assert.equal(contexts.length, 0)
  assert.equal(audio.unlocked, false)
})

test('unlock tạo đúng một AudioContext và resume; gọi lại không tạo thêm', async () => {
  const audio = await fresh()
  audio.unlock()
  audio.unlock()
  assert.equal(contexts.length, 1)
  assert.ok(contexts[0].resumed >= 2, 'resume được gọi mỗi lần mở khóa (iOS cần)')
  assert.equal(audio.unlocked, true)
})

test('mọi hiệu ứng đều tạo âm và không ném lỗi', async () => {
  const audio = await fresh()
  audio.unlock()
  const ctx = contexts[0]
  for (const name of NAMES) {
    const before = total(ctx)
    audio.play(name)
    assert.ok(total(ctx) > before, `"${name}" không tạo nguồn âm nào`)
  }
  assert.ok(ctx.counts.started >= NAMES.length)
})

test('hiệu ứng lạ hoặc ngữ cảnh hỏng không làm sập game', async () => {
  const audio = await fresh()
  audio.unlock()
  audio.play('khong-ton-tai')
  contexts[0].createOscillator = () => { throw new Error('hỏng') }
  audio.play('punch') // phải bị nuốt lỗi
  globalThis.AudioContext = class { constructor() { throw new Error('không hỗ trợ') } }
  const other = await fresh()
  globalThis.AudioContext = class { constructor() { throw new Error('không hỗ trợ') } }
  other.unlock()
  assert.equal(other.unlocked, false)
})

test('tắt tiếng: không tạo nguồn âm, lưu lựa chọn, báo cho giao diện, bật lại thì phát tiếp', async () => {
  const audio = await fresh()
  audio.unlock()
  const ctx = contexts[0]
  let notified = 0
  audio.subscribe(() => (notified += 1))
  audio.setMuted(true)
  assert.equal(audio.getMuted(), true)
  assert.equal(store.get('hangmu.muted'), '1')
  const before = total(ctx)
  audio.play('hit')
  assert.equal(total(ctx), before, 'đang tắt tiếng thì không được tạo âm')
  audio.toggleMuted()
  assert.equal(audio.getMuted(), false)
  assert.equal(store.get('hangmu.muted'), '0')
  audio.play('hit')
  assert.ok(total(ctx) > before)
  assert.equal(notified, 2)
})

test('lựa chọn tắt tiếng đã lưu được áp dụng từ lúc khởi động', async () => {
  const audio = await fresh({ muted: true })
  assert.equal(audio.getMuted(), true)
  audio.unlock()
  const before = total(contexts[0])
  audio.play('bell')
  assert.equal(total(contexts[0]), before)
})

test('nhạc nền: lập lịch liên tục, dừng thì thôi, bắt đầu hai lần không nhân đôi', async () => {
  const audio = await fresh()
  audio.unlock()
  const ctx = contexts[0]
  const base = total(ctx)
  audio.startMusic()
  const afterFirst = total(ctx)
  assert.ok(afterFirst > base, 'bắt đầu là lập lịch ngay các nhịp đầu')
  audio.startMusic() // lần hai: bỏ qua
  assert.equal(total(ctx), afterFirst)
  ctx.currentTime += 1 // thời gian trôi: bộ lập lịch phải thêm nhịp mới
  await sleep(200)
  const running = total(ctx)
  assert.ok(running > afterFirst, 'bộ lập lịch tiếp tục thêm nhịp khi thời gian trôi')
  audio.intenseMusic()
  audio.stopMusic()
  await sleep(200)
  const stopped = total(ctx)
  ctx.currentTime += 5
  await sleep(200)
  assert.equal(total(ctx), stopped, 'đã dừng thì không lập lịch thêm')
  audio.stopMusic() // dừng lần hai không lỗi
})

test('yêu cầu phát nhạc trước khi mở khóa được nhớ và bắt đầu ngay khi mở khóa', async () => {
  const audio = await fresh()
  audio.startMusic()
  assert.equal(contexts.length, 0)
  audio.unlock()
  assert.ok(total(contexts[0]) > 0, 'nhạc phải bắt đầu sau khi mở khóa')
  audio.stopMusic()
})

test('đang tắt tiếng thì không phát nhạc; bật lại thì nhạc tiếp tục nếu trận vẫn diễn ra', async () => {
  const audio = await fresh()
  audio.unlock()
  audio.setMuted(true)
  const ctx = contexts[0]
  const base = total(ctx)
  audio.startMusic()
  assert.equal(total(ctx), base, 'tắt tiếng: không lập lịch nhạc')
  audio.setMuted(false)
  assert.ok(total(ctx) > base, 'bật tiếng lại giữa trận: nhạc tiếp tục')
  audio.stopMusic()
})

// ---------- âm lượng ----------
const { masterGain, clampVolume, DEFAULT_VOLUME } = await import('../../src/game/audio.ts')

test('masterGain: mức mặc định 35 = độ lớn hiện tại (0,55); tăng đơn điệu; có trần; 0 là im', () => {
  assert.equal(DEFAULT_VOLUME, 35)
  assert.ok(Math.abs(masterGain(35) - 0.55) < 1e-9)
  assert.equal(masterGain(0), 0)
  let prev = -1
  for (let v = 0; v <= 100; v += 5) {
    const g = masterGain(v)
    assert.ok(g >= prev, `đơn điệu tại ${v}`)
    prev = g
  }
  assert.ok(masterGain(100) <= 1.2 + 1e-9, 'có trần để không vỡ tiếng')
  assert.equal(masterGain(500), masterGain(100))
  assert.equal(masterGain(-5), 0)
})

test('clampVolume: làm tròn, kẹp 0–100, rác về mặc định', () => {
  assert.equal(clampVolume(49.6), 50)
  assert.equal(clampVolume(-1), 0)
  assert.equal(clampVolume(101), 100)
  assert.equal(clampVolume(NaN), 35)
  assert.equal(clampVolume(Infinity), 35)
})

test('âm lượng: mặc định 35; đặt thì lưu khoá hangmu.volume và đổi gain tổng ngay trên bus đang chạy', async () => {
  const audio = await fresh()
  assert.equal(audio.getVolume(), 35)
  audio.unlock()
  const master = contexts[0].gains[0] // nút gain đầu tiên được tạo là master
  assert.ok(Math.abs(master.gain.value - 0.55) < 1e-9, `mặc định ${master.gain.value}`)
  audio.setVolume(80)
  assert.ok(Math.abs(master.gain.value - masterGain(80)) < 1e-9, `đổi ngay: ${master.gain.value}`)
  audio.setMuted(true)
  assert.equal(master.gain.value, 0)
  audio.setMuted(false)
  assert.ok(Math.abs(master.gain.value - masterGain(80)) < 1e-9, 'bật lại về đúng mức đã chọn')
  assert.equal(audio.getVolume(), 80)
  assert.equal(store.get('hangmu.volume'), '80')
  assert.equal(audio.getMuted(), false)
})

test('âm lượng 0 = im (như tắt tiếng); kéo lên lại thì tự bỏ im; bật tiếng khi đang 0 thì về mức mặc định', async () => {
  const audio = await fresh()
  audio.unlock()
  audio.setVolume(0)
  assert.equal(audio.getMuted(), true)
  const ctx = contexts[0]
  const before = total(ctx)
  audio.play('punch')
  assert.equal(total(ctx), before, 'im: không phát')
  audio.setVolume(40)
  assert.equal(audio.getMuted(), false)
  audio.play('punch')
  assert.ok(total(ctx) > before)
  audio.setVolume(0)
  audio.setMuted(false)
  assert.equal(audio.getVolume(), 35)
  assert.equal(audio.getMuted(), false)
})

test('đang tắt tiếng (âm lượng > 0) mà kéo thanh âm lượng thì tự bỏ tắt tiếng', async () => {
  const audio = await fresh()
  audio.setMuted(true)
  assert.equal(audio.getMuted(), true)
  audio.setVolume(50)
  assert.equal(audio.getMuted(), false)
  assert.equal(store.get('hangmu.muted'), '0')
})

test('đọc khoá cũ: hangmu.sound=off vẫn là tắt tiếng; khoá mới ưu tiên; âm lượng rác về mặc định', async () => {
  contexts = []
  store.clear()
  store.set('hangmu.sound', 'off')
  globalThis.AudioContext = FakeContext
  version += 1
  const legacy = (await import(`../../src/game/audio.ts?v=${version}`)).audio
  assert.equal(legacy.getMuted(), true, 'di chuyển từ khoá cũ')
  store.clear()
  store.set('hangmu.sound', 'off')
  store.set('hangmu.muted', '0')
  version += 1
  const modern = (await import(`../../src/game/audio.ts?v=${version}`)).audio
  assert.equal(modern.getMuted(), false, 'khoá mới thắng khoá cũ')
  store.clear()
  store.set('hangmu.volume', 'hỏng')
  version += 1
  const junk = (await import(`../../src/game/audio.ts?v=${version}`)).audio
  assert.equal(junk.getVolume(), 35)
  store.set('hangmu.volume', '70')
  store.set('hangmu.muted', '1')
  version += 1
  const saved = (await import(`../../src/game/audio.ts?v=${version}`)).audio
  assert.deepEqual([saved.getVolume(), saved.getMuted()], [70, true])
})

test('người nghe (subscribe) được báo khi đổi âm lượng hoặc tắt tiếng', async () => {
  const audio = await fresh()
  let n = 0
  const off = audio.subscribe(() => (n += 1))
  audio.setVolume(50)
  audio.setMuted(true)
  assert.equal(n, 2)
  off()
  audio.setVolume(60)
  assert.equal(n, 2)
})

test('tiếng khán đài (cheer): chỉ một tiếng tại một thời điểm — phát lại thì tiếng cũ bị tắt; tắt tiếng thì không phát', async () => {
  const audio = await fresh()
  audio.unlock()
  const ctx = contexts[0]
  const stops = []
  const original = ctx.createBufferSource.bind(ctx)
  ctx.createBufferSource = () => { const n = original(); const stop = n.stop; n.stop = (when) => { stops.push(when); return stop(when) }; return n }
  audio.play('cheer')
  const first = stops.length
  assert.ok(first >= 3, 'ba dải tần')
  audio.play('cheer')
  assert.ok(stops.length > first + 3, 'tiếng cũ được dừng khi có tiếng mới')
  audio.setMuted(true)
  const before = total(ctx)
  audio.play('cheer')
  assert.equal(total(ctx), before)
})
