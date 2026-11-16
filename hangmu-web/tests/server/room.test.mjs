import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { sleep, startServer } from '../helpers/server.mjs'
import { closeAll, connect, moveBytes, pingBytes } from '../helpers/wsclient.mjs'

let server
before(async () => {
  server = await startServer({ CAPACITY: '50', BOTS: '2', RESUME_GRACE_MS: '1500' })
})
after(async () => {
  closeAll()
  await server.stop()
})

test('vào phòng: admitted có roster, welcome nhị phân, và người khác nhận join', async () => {
  const a = connect(server, 'Alice', { tab: 'r-a', number: 7 })
  const admitted = await a.admitted()
  assert.equal(admitted.tickHz, 30)
  assert.equal(admitted.capacity, 50)
  assert.ok(admitted.roster.length >= 3)
  assert.ok(admitted.roster.find((r) => r.name === 'Alice' && r.n === 7))
  await a.until(() => a.bin.some((b) => b[0] === 128), 'welcome op128')
  const b = connect(server, 'Bob', { tab: 'r-b' })
  await b.admitted()
  await a.until(() => a.all('join').some((j) => j.name === 'Bob'), 'Alice thấy Bob vào')
  a.close()
  b.close()
})

test('ping nhận pong với clientTime nguyên vẹn', async () => {
  const a = connect(server, 'Pinger', { tab: 'r-ping' })
  await a.admitted()
  a.sendBytes(pingBytes(424242))
  const pong = await a.until(() => a.bin.find((b) => b[0] === 131), 'pong')
  assert.equal(pong.readUInt32LE(1), 424242)
  a.close()
})

test('tên không hợp lệ bị từ chối', async () => {
  for (const name of ['', ' '.repeat(5), 'x'.repeat(31)]) {
    const c = connect(server, name)
    const rejected = await c.until(() => c.find('rejected'), `từ chối "${name.slice(0, 6)}"`)
    assert.equal(rejected.reason, 'invalid_name')
    c.close()
  }
})

test('chat: ack đã chuẩn hóa, người khác nhận, không dội lại người gửi', async () => {
  const a = connect(server, 'ChatA', { tab: 'c-a' })
  const b = connect(server, 'ChatB', { tab: 'c-b' })
  const me = (await a.admitted()).selfIndex
  await b.admitted()
  a.send({ t: 'chat', text: 'Glory  glory​!', id: 1 })
  const ack = await a.until(() => a.find('chatAck'), 'chatAck')
  assert.deepEqual([ack.id, ack.text], [1, 'Glory glory!'])
  await b.until(() => b.all('chat').some((m) => m.m.some(([i, t]) => i === me && t === 'Glory glory!')), 'B nhận chat')
  assert.ok(!a.all('chat').some((m) => m.m.some(([i]) => i === me)), 'không dội lại')
  a.close()
  b.close()
})

test('chat: giới hạn tốc độ, trùng lặp, và độ dài', async () => {
  const a = connect(server, 'Limit', { tab: 'c-l' })
  await a.admitted()
  a.send({ t: 'chat', text: 'một', id: 1 })
  a.send({ t: 'chat', text: 'hai', id: 2 })
  await a.until(() => a.all('chatDropped').some((m) => m.reason === 'rate' && m.id === 2), 'rate')
  await sleep(1600)
  a.send({ t: 'chat', text: 'một', id: 3 })
  await a.until(() => a.all('chatDropped').some((m) => m.reason === 'duplicate' && m.id === 3), 'duplicate')
  await sleep(1600)
  a.send({ t: 'chat', text: 'x'.repeat(201), id: 4 })
  await a.until(() => a.all('chatDropped').some((m) => m.reason === 'invalid' && m.id === 4), 'invalid')
  a.close()
})

test('di chuyển: bản ghi hợp lệ được phát đi, dịch chuyển tức thời bị sửa bằng correction', async () => {
  const a = connect(server, 'Mover', { tab: 'm-a' })
  const b = connect(server, 'Watcher', { tab: 'm-b' })
  await a.admitted()
  await b.admitted()
  a.sendBytes(moveBytes(1, 36))
  await b.until(() => b.bin.some((x) => x[0] === 129 && (x.length - 5) % 10 === 0), 'moves 10 byte/bản ghi')
  a.sendBytes(moveBytes(40, -30))
  const corr = await a.until(() => a.bin.find((x) => x[0] === 130), 'correction')
  assert.ok(Math.hypot(corr.readInt16LE(1) / 256, corr.readInt16LE(3) / 256 - 36) < 2, 'về lại vị trí cũ')
  a.close()
  b.close()
})

test('đấm: tầm, thời gian hồi, và gửi cho cả hai phía', async () => {
  const a = connect(server, 'Puncher', { tab: 'p-a' })
  const b = connect(server, 'Target', { tab: 'p-b' })
  const ai = (await a.admitted()).selfIndex
  const bi = (await b.admitted()).selfIndex
  a.send({ t: 'punch', target: bi })
  const hit = await a.until(() => a.find('punchHit'), 'punchHit')
  assert.equal(hit.text, 'đã 👊 Target')
  assert.equal((await b.until(() => b.find('punched'), 'punched')).by, ai)
  // cả hang thấy lời đấm (bong bóng trên đầu người đấm + mục "Hoạt động"): người khác nhận một dòng chat từ người đấm
  const watcher = connect(server, 'Watcher', { tab: 'p-w' })
  await watcher.admitted()
  const c = connect(server, 'Puncher2', { tab: 'p-c' })
  const d = connect(server, 'Target2', { tab: 'p-d' })
  const ci = (await c.admitted()).selfIndex
  const di = (await d.admitted()).selfIndex
  c.send({ t: 'punch', target: di })
  const rows = await watcher.until(() => watcher.all('chat').flatMap((m) => m.m).find((row) => row[0] === ci), 'dòng chat lời đấm tới người xem')
  assert.equal(rows[1], 'đã 👊 Target2')
  watcher.close(); c.close(); d.close()
  a.send({ t: 'punch', target: bi })
  await sleep(200)
  assert.equal(a.all('punchHit').length, 1, 'thời gian hồi chặn đòn thứ hai')
  a.close()
  b.close()
})

test('đấm: hồi chiêu của người đấm áp dụng cho cả mục tiêu khác, và hết hồi thì đấm lại được', async () => {
  const a = connect(server, 'CdA', { tab: 'cd-a' })
  const t1 = connect(server, 'CdT1', { tab: 'cd-t1' })
  const t2 = connect(server, 'CdT2', { tab: 'cd-t2' })
  await a.admitted()
  const i1 = (await t1.admitted()).selfIndex
  const i2 = (await t2.admitted()).selfIndex
  a.send({ t: 'punch', target: i1 })
  await a.until(() => a.all('punchHit').length === 1, 'đòn đầu trúng')
  a.send({ t: 'punch', target: i2 }) // mục tiêu khác nên không dính miễn đòn: chỉ có hồi chiêu chặn
  await sleep(250)
  assert.equal(a.all('punchHit').length, 1, 'còn hồi chiêu nên đòn thứ hai bị chặn')
  await sleep(1400)
  a.send({ t: 'punch', target: i2 })
  await a.until(() => a.all('punchHit').length === 2, 'hết hồi chiêu thì đấm được')
  a.close()
  t1.close()
  t2.close()
})

test('đấm: mục tiêu vừa bị đấm được miễn đòn từ người khác trong 3 giây', async () => {
  const a = connect(server, 'ImA', { tab: 'im-a' })
  const c = connect(server, 'ImC', { tab: 'im-c' })
  const t = connect(server, 'ImT', { tab: 'im-t' })
  await a.admitted()
  await c.admitted()
  const it = (await t.admitted()).selfIndex
  a.send({ t: 'punch', target: it })
  await a.until(() => a.find('punchHit'), 'A đấm trúng')
  c.send({ t: 'punch', target: it }) // C chưa từng đấm nên không dính hồi chiêu: chỉ có miễn đòn chặn
  await sleep(250)
  assert.equal(c.all('punchHit').length, 0, 'mục tiêu đang miễn đòn')
  assert.equal(t.all('punched').length, 1)
  a.close()
  c.close()
  t.close()
})

test('mời + chat riêng: mời, đồng ý, DM có ack, kết thúc', async () => {
  const a = connect(server, 'TalkA', { tab: 't-a' })
  const b = connect(server, 'TalkB', { tab: 't-b' })
  const ai = (await a.admitted()).selfIndex
  const bi = (await b.admitted()).selfIndex
  a.send({ t: 'inviteAsk', kind: 'talk', target: bi })
  const invite = await b.until(() => b.find('invite'), 'invite')
  assert.equal(invite.from, ai)
  b.send({ t: 'inviteAnswer', id: invite.id, accept: true })
  const open = await a.until(() => a.find('talkOpen'), 'talkOpen')
  assert.equal(open.peer, bi)
  a.send({ t: 'dm', text: 'xin chào', id: 9 })
  await a.until(() => a.find('dmAck')?.id === 9, 'dmAck')
  await b.until(() => b.find('dm')?.text === 'xin chào', 'B nhận dm')
  b.send({ t: 'talkEnd' })
  await a.until(() => a.find('talkClosed')?.id === open.id, 'talkClosed')
  assert.equal(b.find('talkClosed').by, bi)
  a.close()
  b.close()
})

test('từ chối lời mời: có waitMs và chặn mời lại (cooldown)', async () => {
  const a = connect(server, 'DeclA', { tab: 'd-a' })
  const b = connect(server, 'DeclB', { tab: 'd-b' })
  await a.admitted()
  const bi = (await b.admitted()).selfIndex
  a.send({ t: 'inviteAsk', kind: 'talk', target: bi })
  const invite = await b.until(() => b.find('invite'), 'invite')
  b.send({ t: 'inviteAnswer', id: invite.id, accept: false })
  const declined = await a.until(() => a.find('inviteDeclined'), 'inviteDeclined')
  assert.equal(declined.reason, 'declined')
  assert.ok(declined.waitMs > 0)
  a.send({ t: 'inviteAsk', kind: 'talk', target: bi })
  await a.until(() => a.all('inviteDeclined').some((m) => m.reason === 'cooldown'), 'cooldown')
  a.close()
  b.close()
})

test('nối lại cùng tab giữ nguyên chỉ số, không phát leave; tab mới đá tab cũ', async () => {
  const a = connect(server, 'Resume', { tab: 'x-a' })
  const w = connect(server, 'Witness', { tab: 'x-w' })
  const index = (await a.admitted()).selfIndex
  await w.admitted()
  a.close()
  await sleep(300)
  assert.ok(!w.all('leave').some((m) => m.i === index), 'chưa phát leave trong thời gian giữ chỗ')
  const a2 = connect(server, 'Resume', { tab: 'x-a' })
  const back = await a2.admitted()
  assert.equal(back.resumed, true)
  assert.equal(back.selfIndex, index)
  const a3 = connect(server, 'Resume', { tab: 'x-a' })
  await a3.admitted()
  await a2.until(() => a2.find('replaced'), 'tab cũ bị thay')
  a3.close()
  w.close()
})

test('hết thời gian giữ chỗ thì phát leave', async () => {
  const a = connect(server, 'Gone', { tab: 'g-a' })
  const w = connect(server, 'Watch2', { tab: 'g-w' })
  const index = (await a.admitted()).selfIndex
  await w.admitted()
  a.close()
  await w.until(() => w.all('leave').some((m) => m.i === index), 'leave sau thời gian giữ chỗ')
  w.close()
})

test('rời hang chủ động phát leave ngay', async () => {
  const a = connect(server, 'Leaver', { tab: 'l-a' })
  const w = connect(server, 'Watch3', { tab: 'l-w' })
  const index = (await a.admitted()).selfIndex
  await w.admitted()
  a.send({ t: 'leave' })
  await w.until(() => w.all('leave').some((m) => m.i === index), 'leave ngay')
  w.close()
})

test('REST: /api/room/status có đủ số, /api/me trả null, đường lạ trả 404', async () => {
  const status = await (await fetch(`${server.url}/api/room/status`)).json()
  for (const key of ['inRoom', 'capacity', 'waiting']) assert.equal(typeof status[key], 'number')
  const me = await fetch(`${server.url}/api/me`)
  assert.equal(me.status, 200)
  assert.equal(await me.json(), null)
  assert.equal((await fetch(`${server.url}/api/nope`)).status, 404)
})

test('ăn mừng (emote): cả hang nhận chỉ số người ăn mừng; giới hạn tần suất; chat riêng thì không ăn mừng', async () => {
  const a = connect(server, 'EmoA', { tab: 'em-a' })
  const b = connect(server, 'EmoB', { tab: 'em-b' })
  const ai = (await a.admitted()).selfIndex
  const bi = (await b.admitted()).selfIndex
  a.send({ t: 'emote' })
  for (const c of [a, b]) {
    const m = await c.until(() => c.all('emote').find((x) => x.i === ai), 'nhận emote')
    assert.deepEqual(Object.keys(m).sort(), ['i', 't'])
  }
  a.send({ t: 'emote' })
  a.send({ t: 'emote' })
  await sleep(300)
  assert.equal(b.all('emote').filter((x) => x.i === ai).length, 1, 'gửi dồn thì chỉ một cái lọt (thời gian hồi)')
  // đang chat riêng thì bị bỏ
  b.send({ t: 'inviteAsk', kind: 'talk', target: ai })
  const inv = await a.until(() => a.find('invite'), 'mời chat')
  a.send({ t: 'inviteAnswer', id: inv.id, accept: true })
  await b.until(() => b.find('talkOpen'), 'talkOpen')
  b.send({ t: 'emote' })
  await sleep(300)
  assert.equal(a.all('emote').filter((x) => x.i === bi).length, 0, 'đang chat riêng: không ăn mừng')
  a.close()
  b.close()
})

test('vung tay (swing): đấm hụt cả hang thấy; đòn trúng server tự phát kèm mục tiêu; có thời gian hồi; chat riêng thì không', async () => {
  const a = connect(server, 'SwingS1', { tab: 'sw-a' })
  const b = connect(server, 'SwingS2', { tab: 'sw-b' })
  const w = connect(server, 'SwingS3', { tab: 'sw-w' })
  const ai = (await a.admitted()).selfIndex
  const bi = (await b.admitted()).selfIndex
  await w.admitted()
  a.send({ t: 'swing' })
  for (const c of [a, b, w]) {
    const m = await c.until(() => c.all('swing').find((x) => x.i === ai), 'nhận swing hụt')
    assert.deepEqual(Object.keys(m).sort(), ['i', 't'], 'đấm hụt không có target')
  }
  a.send({ t: 'swing' })
  a.send({ t: 'swing' })
  await sleep(300)
  assert.equal(w.all('swing').filter((x) => x.i === ai).length, 1, 'gửi dồn thì chỉ một cái lọt')
  // đòn trúng: server tự phát swing có target (cả hang), không cần client gửi swing
  b.send({ t: 'punch', target: ai })
  const hit = await w.until(() => w.all('swing').find((x) => x.i === bi), 'swing trúng')
  assert.equal(hit.target, ai)
  // không có tin nào lọt khi đang chat riêng
  a.send({ t: 'inviteAsk', kind: 'talk', target: bi })
  const inv = await b.until(() => b.find('invite'), 'mời chat')
  b.send({ t: 'inviteAnswer', id: inv.id, accept: true })
  await a.until(() => a.find('talkOpen'), 'talkOpen')
  await sleep(1600)
  const count = w.all('swing').filter((x) => x.i === ai).length
  a.send({ t: 'swing' })
  await sleep(300)
  assert.equal(w.all('swing').filter((x) => x.i === ai).length, count, 'đang chat riêng: không vung')
  for (const c of [a, b, w]) c.close()
})
