// Lọc chat: che từ thô tục, che link/SĐT trong chat riêng, không che nhầm từ bình thường.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { filterChat, filterDm, maskLinksAndPhones, maskProfanity } from '../../server/lib/filter.mjs'
import { startServer, until } from '../helpers/server.mjs'
import { closeAll, connect } from '../helpers/wsclient.mjs'

test('che từ thô tục (có dấu và viết tắt), giữ độ dài, giữ phần còn lại của câu', () => {
  assert.equal(maskProfanity('địt mẹ trọng tài'), '*** mẹ trọng tài')
  assert.equal(maskProfanity('Cái lồn gì vậy'), 'Cái *** gì vậy', 'không phân biệt hoa/thường')
  assert.equal(maskProfanity('vcl thua rồi'), '*** thua rồi')
  assert.equal(maskProfanity('dmm'), '***')
  assert.equal(maskProfanity('ĐỊT'), '***')
  assert.equal(maskProfanity('đéo hiểu'), '*** hiểu')
  assert.equal(maskProfanity('đm, thua rồi!'), '**, thua rồi!', 'dấu câu đi kèm không ảnh hưởng')
})

test('gộp ký tự lặp để khỏi né bằng cách kéo dài chữ', () => {
  assert.equal(maskProfanity('địttttt'), '*******')
  assert.equal(maskProfanity('vclllll'), '*******')
  assert.equal(maskProfanity('dmmmmm'), '******')
})

test('KHÔNG che nhầm từ bình thường (các, đi, dì, đẹp, cặp, địa, admin, cc/lol/dm là viết tắt hay trùng nghĩa khác)', () => {
  for (const ok of ['các bạn', 'đi thôi', 'dì ba', 'đẹp quá', 'cặp đôi', 'địa chỉ', 'admin', 'đụng xe', 'cứu', 'lòng tốt', 'đít', 'dịt', 'dít', 'buổi sáng', 'lol', 'cc me', 'dm me', 'dit' + 'ing', 'Old Trafford', 'Glory Glory Man United', 'Mắc Gai', 'Bủ Nô', 'cặc'.length.toString()]) {
    assert.equal(maskProfanity(ok), ok, ok)
  }
})

test('che link: http(s), www, tên miền trần, t.me, kể cả gắn trong câu; không che số bàn thắng hay giờ', () => {
  const star = (s) => '*'.repeat(s.length)
  for (const link of ['https://evil.example/x?y=1', 'http://a.b', 'www.abc.com', 'hangmu-fake.online/free', 't.me/scamgroup', 'zalo.me/0123', 'bit.ly/xyz']) {
    assert.equal(maskLinksAndPhones(`vào ${link} nhận quà`), `vào ${star(link)} nhận quà`, link)
  }
  assert.equal(maskLinksAndPhones('tỷ số 2-1, đá lúc 20:30, phút 90+2'), 'tỷ số 2-1, đá lúc 20:30, phút 90+2')
  assert.equal(maskLinksAndPhones('MU 3 - 2 Roma'), 'MU 3 - 2 Roma')
  assert.equal(maskLinksAndPhones('Old Trafford.Thua rồi'), 'Old Trafford.Thua rồi', 'dấu chấm giữa câu không phải tên miền')
})

test('che số điện thoại: 0xxxxxxxxx, +84, có dấu cách/chấm/gạch, dãy số dài; không che số ngắn', () => {
  for (const phone of ['0912345678', '0912 345 678', '0912.345.678', '0912-345-678', '+84912345678', '84 912 345 678', '12345678', '1234 5678']) {
    const out = maskLinksAndPhones(`gọi ${phone} nhé`)
    assert.ok(!/\d/.test(out), `${phone} → ${out}`)
    assert.equal(out, `gọi ${phone.replace(/\S/g, '*')} nhé`, 'giữ khoảng trắng, che từng ký tự')
  }
  assert.equal(maskLinksAndPhones('áo số 7, 99 phút, năm 2026'), 'áo số 7, 99 phút, năm 2026')
  assert.equal(maskLinksAndPhones('1234567'), '1234567', '7 chữ số không phải SĐT')
})

test('filterChat chỉ che từ thô tục (link vẫn nguyên ở chat chung); filterDm che cả ba', () => {
  const t = 'địt mẹ vào https://a.example gọi 0912345678'
  assert.equal(filterChat(t), '*** mẹ vào https://a.example gọi 0912345678')
  const dm = filterDm(t)
  assert.ok(!/địt|https|0912/.test(dm), dm)
  assert.equal(filterChat(''), '')
  assert.equal(filterDm(''), '')
})

test('đầu vào cực dài hoặc độc hại không làm treo bộ lọc (không backtracking thảm hoạ)', () => {
  const started = Date.now()
  for (const evil of ['a'.repeat(5000), '1 '.repeat(2500), '0'.repeat(5000), 'a.'.repeat(2500) + 'com', 'http://' + 'a'.repeat(5000), '(' + '9'.repeat(4000)]) {
    filterDm(evil)
    filterChat(evil)
  }
  assert.ok(Date.now() - started < 1500, `mất ${Date.now() - started} ms`)
})

// ---------- qua server thật ----------
const servers = []
after(async () => {
  closeAll()
  for (const s of servers) await s.stop()
})

test('server: chat chung bị che từ thô tục, người gửi (chatAck) và người nhận thấy cùng nội dung đã lọc', async () => {
  const server = await startServer({ BOTS: '0' })
  servers.push(server)
  const a = connect(server, 'A', { tab: 'flt-a' })
  const b = connect(server, 'B', { tab: 'flt-b' })
  await a.admitted()
  await b.admitted()
  a.send({ t: 'chat', id: 1, text: 'vcl thua rồi, đi thôi các bạn' })
  const ack = await a.until(() => a.find('chatAck'), 'chatAck')
  assert.equal(ack.text, '*** thua rồi, đi thôi các bạn')
  const got = await b.until(() => b.all('chat').find((m) => JSON.stringify(m).includes('thua rồi')), 'B nhận chat')
  assert.ok(!JSON.stringify(got).includes('vcl'), JSON.stringify(got))
  assert.ok(JSON.stringify(got).includes('***'))
})

test('server: chat riêng che từ thô tục, link và số điện thoại cho cả hai phía', async () => {
  const server = await startServer({ BOTS: '0' })
  servers.push(server)
  const a = connect(server, 'DmA', { tab: 'flt-dma' })
  const b = connect(server, 'DmB', { tab: 'flt-dmb' })
  const bi = (await b.admitted()).selfIndex
  await a.admitted()
  a.send({ t: 'inviteAsk', kind: 'talk', target: bi })
  const inv = await b.until(() => b.find('invite'), 'mời chat')
  b.send({ t: 'inviteAnswer', id: inv.id, accept: true })
  await a.until(() => a.find('talkOpen'), 'talkOpen')
  a.send({ t: 'dm', id: 7, text: 'địt mẹ, vào https://scam.example hoặc gọi 0912 345 678 nhé' })
  const ack = await a.until(() => a.find('dmAck'), 'dmAck')
  const dm = await b.until(() => b.find('dm'), 'B nhận dm')
  assert.equal(ack.text, dm.text, 'hai phía thấy cùng nội dung')
  assert.ok(!/địt|https|scam|0912|345/.test(dm.text), dm.text)
  assert.ok(/\*\*\*/.test(dm.text))
  assert.ok(/nhé$/.test(dm.text), 'phần còn lại giữ nguyên')
})

test('server: CHAT_FILTER=off thì giữ nguyên nội dung', async () => {
  const server = await startServer({ BOTS: '0', CHAT_FILTER: 'off' })
  servers.push(server)
  const a = connect(server, 'OffA', { tab: 'flt-offa' })
  await a.admitted()
  a.send({ t: 'chat', id: 1, text: 'vcl thua' })
  assert.equal((await a.until(() => a.find('chatAck'), 'chatAck')).text, 'vcl thua')
  await until(() => true)
})
