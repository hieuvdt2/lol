// Chạy NetClient thật (TypeScript) với server thật; chỉ giả lập window/document/localStorage.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { sleep, startServer, until } from '../helpers/server.mjs'

const store = new Map()
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {}, pointerLockElement: null }
globalThis.window = globalThis
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}

let server
let NetClient
const clients = []
before(async () => {
  server = await startServer({ CAPACITY: '50', BOTS: '1', DUEL_COUNTDOWN_MS: '400', RESUME_GRACE_MS: '10000', MAX_SPEED: '1000' }) // MAX_SPEED lớn: bài ngồi ghế dịch chuyển tức thời
  globalThis.location = { protocol: 'http:', host: `127.0.0.1:${server.port}` }
  ;({ NetClient } = await import('../../src/game/net.ts'))
})
after(async () => {
  for (const c of clients) c.dispose()
  await server.stop()
})

/** Tab id được đọc lúc socket mở, nên đặt trước khi connect và chờ vào hang xong. */
async function join(name, tab, number = null) {
  store.set('hangmu.tab', tab)
  const c = new NetClient()
  clients.push(c)
  c.connect(name, number)
  await until(() => c.getState().phase === 'inCave', { label: `${name} (${tab}) vào hang; phase=${c.getState().phase} error=${c.getState().error}` })
  return c
}
/** Chạy vòng lặp khung hình ~60Hz cho các client; trả hàm dừng. */
function drive(entries) {
  const timer = setInterval(() => {
    for (const [c, input] of entries) c.frame(1 / 60, input.mx, input.mz, false)
  }, 1000 / 60)
  return () => clearInterval(timer)
}
const still = { mx: 0, mz: 0 }
const state = (c) => c.getState()
const dist = (a, b) => Math.hypot(a.draw.x - b.draw.x, a.draw.z - b.draw.z)

test('vào hang: có người chơi local và bot, đã đồng bộ tick', async () => {
  const a = await join('Alice', 'nc-a', 7)
  assert.ok(a.local && a.local.name === 'Alice' && a.local.number === 7)
  assert.ok([...a.actors.values()].some((x) => x.bot))
  assert.ok(a.serverTickNow() > 0)
})

test('thấy người khác di chuyển bằng dự đoán, sai lệch nhỏ', async () => {
  const a = await join('Mover1', 'nc-m1')
  const b = await join('Mover2', 'nc-m2')
  const bobInput = { mx: 1, mz: 0 }
  const stop = drive([[a, still], [b, bobInput]])
  const seen = () => [...a.actors.values()].find((x) => x.name === 'Mover2')
  await until(() => seen() && b.local.draw.x > 6, { label: 'Mover2 đi được 6 đơn vị' })
  await sleep(300)
  assert.ok(seen().draw.x > 2, `A thấy Mover2 đã đi: x=${seen().draw.x}`)
  assert.ok(dist(seen(), b.local) < 4, `sai lệch ${dist(seen(), b.local).toFixed(2)}`)
  bobInput.mx = 0
  await sleep(500)
  assert.ok(dist(seen(), b.local) < 2, 'dừng lại thì hội tụ về vị trí thật')
  stop()
})

test('chat: ack chuyển trạng thái sent, người khác thấy tin và bong bóng, giới hạn tốc độ phía client', async () => {
  const a = await join('ChatA', 'nc-ca')
  const b = await join('ChatB', 'nc-cb')
  assert.equal(a.sendChat('Glory glory!'), true)
  await until(() => state(a).chat.some((m) => m.self && m.state === 'sent' && m.text === 'Glory glory!'), { label: 'ack' })
  await until(() => state(b).chat.some((m) => m.text === 'Glory glory!'), { label: 'B nhận chat' })
  assert.ok([...b.bubbles.values()].some((x) => x.text === 'Glory glory!'))
  assert.equal(a.sendChat('liền sau đó'), false, 'bị chặn vì chưa đủ 1.5s')
  assert.match(state(a).notice ?? '', /nhanh quá/)
})

test('mời → chat riêng → kết thúc; đang chat riêng thì không đấm / mời được', async () => {
  const a = await join('TalkA', 'nc-ta')
  const b = await join('TalkB', 'nc-tb')
  const stop = drive([[a, still], [b, still]])
  await sleep(300) // đợi vị trí được gửi lên server
  assert.equal(a.ask('talk', b.selfIndex), true)
  await until(() => state(b).invite?.kind === 'talk', { label: 'B nhận lời mời' })
  b.answer(true)
  await until(() => state(a).conv && state(b).conv, { label: 'cả hai vào chat riêng' })
  assert.equal(a.punch(), false)
  assert.equal(a.sendDm('xin chào'), true)
  await until(() => state(b).conv.messages.some((m) => !m.mine && m.text === 'xin chào'), { label: 'B nhận DM' })
  await until(() => state(a).conv.messages.some((m) => m.mine && !m.pending), { label: 'DM đã ack' })
  b.endTalk()
  await until(() => state(a).conv?.ended?.byMe === false, { label: 'A thấy kết thúc' })
  assert.equal(a.punch(), false, 'chưa đóng khung thì vẫn bị khóa')
  a.dismissTalk()
  assert.equal(state(a).conv, null)
  stop()
})

test('người đang bận: ask bị từ chối ngay ở client kèm thông báo', async () => {
  const a = await join('BusyA', 'nc-ba')
  const b = await join('BusyB', 'nc-bb')
  const c = await join('BusyC', 'nc-bc')
  const stop = drive([[a, still], [b, still], [c, still]])
  await sleep(300)
  assert.equal(b.ask('talk', c.selfIndex), true)
  await until(() => state(c).invite, { label: 'C nhận mời' })
  c.answer(true)
  await until(() => state(b).conv && state(c).conv, { label: 'B,C đang chat riêng' })
  await until(() => a.ask('talk', b.selfIndex) === false && /đang bận/.test(state(a).toast ?? ''), { label: 'A bị báo bận' })
  stop()
})

test('duel hoàn chỉnh: mời, đếm ngược, đòn trúng, bỏ cuộc, xếp hạng; ném đồ', async () => {
  const a = await join('DuelA', 'nc-da')
  const b = await join('DuelB', 'nc-db')
  const stop = drive([[a, still], [b, still]])
  await sleep(300)
  assert.equal(a.ask('duel', b.selfIndex), true)
  await until(() => state(b).invite?.kind === 'duel', { label: 'B nhận lời mời duel' })
  b.answer(true)
  await until(() => a.duel.getSnapshot().phase === 'countdown' && b.duel.getSnapshot().phase === 'countdown', { label: 'đếm ngược' })
  assert.equal(a.duel.getSnapshot().peerName, 'DuelB')
  assert.equal(a.ask('talk', b.selfIndex), false, 'đang duel thì không mời được')
  await until(() => a.duel.getSnapshot().phase === 'fight', { label: 'vào trận' })

  a.duel.punch()
  await until(() => b.duel.getSnapshot().opp === 'windup', { label: 'B thấy gồng tay' })
  await until(() => b.duel.getSnapshot().hpMe === 85 && a.duel.getSnapshot().hpPeer === 85, { label: 'máu về 85' })
  const readyAt = a.duel.getSnapshot().punchReady
  a.duel.punch()
  assert.equal(a.duel.getSnapshot().punchReady, readyAt, 'đang hồi thì không đấm tiếp')

  a.duel.askQuit()
  assert.equal(a.duel.getSnapshot().confirmQuit, true)
  a.duel.quit()
  await until(() => b.duel.getSnapshot().phase === 'ended' && a.duel.getSnapshot().phase === 'ended', { label: 'kết thúc' })
  const endB = b.duel.getSnapshot().end
  const endA = a.duel.getSnapshot().end
  assert.deepEqual([endB.won, endA.won, endA.result], [true, false, 'quit'])
  await until(() => b.duel.getSnapshot().rank[0]?.name === 'DuelB', { label: 'bảng xếp hạng' })
  // kết quả hiện thành thông báo (toast) trong hàng đợi chung, không còn là dòng chat hệ thống
  const { noticeQueue } = await import('../../src/game/noticeStore.ts')
  await until(() => noticeQueue.getSnapshot()?.kind === 'duel_result', { label: 'thông báo kết quả võ thuật' })
  const shown = noticeQueue.getSnapshot()
  assert.deepEqual([shown.names, shown.result], [['DuelB', 'DuelA'], 'quit'])
  assert.ok(!state(a).chat.some((m) => m.system && /DuelB/.test(m.text)), 'không đẩy thêm vào chat')
  noticeQueue.reset()
  b.duel.close()
  assert.equal(b.duel.getSnapshot().phase, 'idle')

  a.rage.setSlot(1)
  a.rage.setItem(2)
  assert.equal(a.rage.throwAt(), true)
  await until(() => a.rage.getSnapshot().today === 1, { label: 'bộ đếm ném đồ' })
  a.rage.relabel(0, 9)
  await until(() => b.rage.getSnapshot().labels[0] === 9, { label: 'nhãn tới B' })
  stop()
})

test('mất kết nối được nối lại giữ nguyên chỉ số; người khác không thấy rời', async () => {
  const a = await join('ResumeA', 'nc-ra')
  const w = await join('Witness', 'nc-rw')
  const stop = drive([[a, still], [w, still]])
  const index = a.selfIndex
  store.set('hangmu.tab', 'nc-ra') // lần kết nối lại đọc tab id từ localStorage
  const oldSocket = a.ws
  oldSocket.close()
  // Phải thấy socket MỚI được tạo; nếu chỉ chờ phase === 'inCave' thì điều kiện đúng ngay trước khi sự kiện đóng kịp chạy.
  await until(() => a.ws && a.ws !== oldSocket && state(a).phase === 'inCave' && state(a).reconnectUntil === 0, { timeout: 12000, label: 'socket mới đã nối lại' })
  assert.equal(a.selfIndex, index)
  assert.ok(w.actors.has(index), 'Witness chưa bao giờ thấy ResumeA rời')
  stop()
})

test('vào hang từ tab khác thì tab cũ bị đóng kèm lý do', async () => {
  const first = await join('SameTab', 'nc-same')
  await join('SameTab', 'nc-same')
  await until(() => state(first).phase === 'closed', { label: 'tab cũ đóng' })
  assert.match(state(first).error ?? '', /tab khác/)
})

/** Chạy A ở 60Hz thật, ghi lại chuyển động vẽ ra của một người khác: trả mảng { v: vận tốc vẽ, step: đoạn dịch, dt }. */
async function watchActor(a, find, ms, { onFrame } = {}) {
  const frames = []
  let last = performance.now()
  let prev = null
  const timer = setInterval(() => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    onFrame?.(now)
    a.frame(dt, 0, 0, false)
    const actor = find()
    if (!actor) return
    if (prev) {
      const dx = actor.draw.x - prev.x
      const dz = actor.draw.z - prev.z
      frames.push({ dx, dz, step: Math.hypot(dx, dz), dt, v: Math.hypot(dx, dz) / dt })
    }
    prev = { x: actor.draw.x, z: actor.draw.z }
  }, 1000 / 60)
  await sleep(ms)
  clearInterval(timer)
  return frames
}

test('MƯỢT: người khác liên tục đổi hướng thì hình vẽ không nhảy vọt hay lùi giật (đo ở 60Hz)', async () => {
  const a = await join('SmoothA', 'nc-sa')
  const b = await join('SmoothB', 'nc-sb')
  const bobInput = { mx: 1, mz: 0 }
  // B tự chạy vòng lặp riêng và đổi hướng mỗi 250 ms (giống người chơi bẻ lái/lách)
  const dirs = [{ mx: 1, mz: 0 }, { mx: 0.7, mz: 0.7 }, { mx: 0, mz: 1 }, { mx: -0.7, mz: 0.7 }, { mx: -1, mz: 0 }, { mx: -0.7, mz: -0.7 }, { mx: 0, mz: -1 }, { mx: 0.7, mz: -0.7 }]
  let k = 0
  const driveB = setInterval(() => b.frame(1 / 60, bobInput.mx, bobInput.mz, false), 1000 / 60)
  const turn = setInterval(() => Object.assign(bobInput, dirs[(k += 1) % dirs.length]), 250)
  await sleep(600)
  const seen = () => [...a.actors.values()].find((x) => x.name === 'SmoothB')
  const frames = await watchActor(a, seen, 4000)
  clearInterval(driveB)
  clearInterval(turn)
  const moving = frames.filter((f) => f.dt > 0)
  assert.ok(moving.length > 150, `chỉ đo được ${moving.length} khung`)
  const maxV = Math.max(...moving.map((f) => f.v))
  const spikes = moving.filter((f) => f.v > 8 * 1.6).length
  // Tốc độ tối đa của nhân vật là 8; vọt quá 1,6 lần là nhìn thấy giật (đo trước khi sửa: nhiều khung > 3 lần).
  assert.ok(spikes <= moving.length * 0.02, `${spikes}/${moving.length} khung vọt quá 12,8 đv/s (cao nhất ${maxV.toFixed(1)})`)
  assert.ok(maxV < 8 * 2.5, `khung nhanh nhất ${maxV.toFixed(1)} đv/s`)
})

test('MƯỢT: bot di chuyển khớp mô hình dự đoán của client — tốc độ vẽ ổn định, không kéo giật', async () => {
  const a = await join('BotWatch', 'nc-bw')
  await sleep(1500)
  const bot = () => [...a.actors.values()].find((x) => x.bot)
  const frames = await watchActor(a, bot, 5000)
  const moving = frames.filter((f) => f.v > 1.5)
  assert.ok(moving.length > 40, `bot chỉ đi ${moving.length} khung (bot nghỉ nhiều?)`)
  // Bot trượt dọc ghế/hình nộm thì tốc độ đổi dần theo mô phỏng chung; lỗi cũ (server đi một kiểu, client dự đoán kiểu khác) làm tốc độ vẽ
  // nhảy cóc giữa các khung: đo độ nhảy tốc độ giữa hai khung liền kề thay vì độ lệch chuẩn (không phụ thuộc đường đi cụ thể của bot).
  const jumps = frames.slice(1).map((f, i) => Math.abs(f.v - frames[i].v)).sort((x, y) => x - y)
  const p95 = jumps[Math.floor(jumps.length * 0.95)]
  assert.ok(p95 < 3, `độ nhảy tốc độ giữa hai khung (phân vị 95) ${p95.toFixed(2)} đv/s (trước khi sửa: hàng chục)`)
  assert.ok(Math.max(...moving.map((f) => f.v)) < 8, `tốc độ vẽ cao nhất ${Math.max(...moving.map((f) => f.v)).toFixed(1)} (bot chỉ đi ≈ 3,4)`)
})

test('ăn mừng: gửi emote thì cả hai client ghi nhận mốc ăn mừng của người gửi; gửi dồn bị chặn ở client', async () => {
  const a = await join('EmoteA', 'nc-ea')
  const b = await join('EmoteB', 'nc-eb')
  const stop = drive([[a, still], [b, still]])
  const ai = a.local.index
  assert.equal(a.emote(), true)
  assert.equal(a.emote(), false, 'thời gian hồi phía client')
  await until(() => a.emotedAt.has(ai) && b.emotedAt.has(ai), { label: 'cả hai nhận emote' })
  assert.ok(!b.emotedAt.has(b.local.index))
  stop()
})

test('ngồi ghế: người khác thấy mình ngồi (seats), vị trí không bị đẩy khỏi ghế, đứng dậy thì cả hai cùng biết; ghế đã có người thì bị từ chối', async () => {
  const { HALL_SEATS } = await import('../../shared/world.mjs')
  const { standUpSpot } = await import('../../src/game/zones.ts')
  const seat = HALL_SEATS[26]
  const a = await join('SeatA', 'nc-sa2')
  const b = await join('SeatB', 'nc-sb2')
  const stop = drive([[a, still], [b, still]])
  // A tới sát ghế (dịch chuyển phía client rồi báo một bản tin di chuyển hợp lệ), B đứng nguyên ở chỗ vào
  const park = (c, x, z) => { for (const body of [c.local.curr, c.local.prev, c.local.draw]) { body.x = x; body.z = z; body.vx = body.vz = 0 } }
  await sleep(250)
  park(a, seat.x, seat.z + 0.705)
  await sleep(500)
  a.sitAt(seat, Math.PI)
  assert.equal(a.seated, true)
  await until(() => b.seats.get(a.local.index) === 26, { label: 'B thấy A ngồi ghế 26' })
  await sleep(600) // B chạy mô phỏng người khác một lúc: không được đẩy A ra khỏi hộp ghế
  const seen = [...b.actors.values()].find((x) => x.index === a.local.index)
  assert.ok(Math.hypot(seen.curr.x - seat.x, seen.curr.z - seat.z) < 0.05, `B thấy A ở (${seen.curr.x.toFixed(2)}, ${seen.curr.z.toFixed(2)}), ghế ở (${seat.x}, ${seat.z})`)
  assert.ok(Math.hypot(seen.draw.vx, seen.draw.vz) < 0.01)
  // B thử ngồi cùng ghế → bị từ chối, B vẫn đứng
  park(b, seat.x + 0.2, seat.z + 0.705)
  await sleep(500)
  b.sitAt(seat, Math.PI)
  await until(() => !b.seated, { label: 'server từ chối B, client thoát trạng thái ngồi' })
  assert.equal(b.seats.has(b.local.index), false)
  // A đứng dậy
  a.standUpAt(standUpSpot(seat))
  await until(() => !b.seats.has(a.local.index) && !a.seats.has(a.local.index), { label: 'cả hai biết A đã đứng dậy' })
  assert.equal(a.seated, false)
  stop()
})

test('đấm chi tiết: trúng → mục tiêu/người bị đấm/người xem đều biết; đấm hụt → người xem vẫn thấy cú vung, không ai bị trúng', async () => {
  const a = await join('SwingA', 'nc-sw-a')
  const b = await join('SwingB', 'nc-sw-b')
  const c = await join('SwingC', 'nc-sw-c')
  const stop = drive([[a, still], [b, still], [c, still]])
  // dịch chuyển phía client; đứng yên thì client không gửi gì nên ép gửi một bản tin vị trí (lastDir = −1 → coi như đổi hướng)
  const park = (cl, x, z, heading = 0) => {
    for (const body of [cl.local.curr, cl.local.prev, cl.local.draw]) { body.x = x; body.z = z; body.vx = body.vz = 0; body.heading = heading }
    cl.lastDir = -1
  }
  await sleep(300)
  // xa chỗ vào hang: các bài trước còn để người chơi đứng dồn ở đó, sẽ chen vào việc chọn mục tiêu
  const home = { x: 14, z: 28 }
  park(a, home.x, home.z, Math.PI) // quay mặt về −z (về phía giữa hang, +z là ra rìa)
  park(b, home.x, home.z - 1) // ngay trước mặt A
  park(c, home.x + 3, home.z - 3)
  await until(() => a.punchTarget()?.index === b.selfIndex, { label: 'A thấy B trong tầm đấm' })
  await sleep(400) // để server biết vị trí mới
  assert.equal(a.punchTargetIndex, -1)
  assert.equal(a.punch(), true)
  assert.equal(a.punchTargetIndex, b.selfIndex, 'đòn nhắm vào B')
  await until(() => b.punchedBy === a.selfIndex, { label: 'B biết ai đấm mình' })
  await until(() => c.swings.get(a.selfIndex)?.target === b.selfIndex, { label: 'C thấy A vung trúng B' })
  await until(() => c.hurts.get(b.selfIndex)?.by === a.selfIndex, { label: 'C thấy B bị đấm bởi A' })
  assert.equal(a.hurts.get(b.selfIndex)?.by, a.selfIndex, 'A thấy B bị đấm do mình')
  assert.ok(a.swings.get(a.selfIndex) === undefined, 'cú vung của chính mình không đi qua đường tin của người khác')
  const hurtAt = b.punchedAt
  // đấm hụt: B bị đẩy ra xa khỏi tầm
  park(b, home.x, home.z - 8)
  await until(() => a.punchTarget() === null, { label: 'A không còn ai trong tầm' })
  await sleep(1700) // hết thời gian hồi của hoạt hình (1,65 s) và của server (1,5 s)
  const before = c.swings.get(a.selfIndex).at
  assert.equal(a.punch(), true, 'vẫn vung được dù không có ai')
  assert.equal(a.punchTargetIndex, -1, 'hụt')
  await until(() => c.swings.get(a.selfIndex).at > before, { label: 'C thấy cú vung hụt' })
  assert.equal(c.swings.get(a.selfIndex).target, -1)
  assert.equal(b.punchedAt, hurtAt, 'không ai bị trúng')
  const hurtsAfter = c.hurts.get(b.selfIndex).at
  await sleep(300)
  assert.equal(c.hurts.get(b.selfIndex).at, hurtsAfter, 'đấm hụt không tạo phản ứng bị đấm')
  stop()
})
