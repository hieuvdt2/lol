// Bảo vệ khi chạy công khai: kích thước gói, Origin, giới hạn theo IP, giới hạn tốc độ, hết giờ `enter`, heartbeat.
import net from 'node:net'
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { sleep, startServer, until } from '../helpers/server.mjs'
import { closeAll, connect, moveBytes } from '../helpers/wsclient.mjs'

const servers = {}
before(async () => {
  servers.main = await startServer({ ENTER_TIMEOUT_MS: '500', CAPACITY: '50' })
  servers.allowed = await startServer({ ALLOWED_ORIGINS: 'https://hangmu.online, https://www.hangmu.online' })
  servers.perIp = await startServer({ MAX_CONN_PER_IP: '3' })
  servers.rate = await startServer({ CONN_RATE_PER_MIN: '5' })
  servers.proxy = await startServer({ MAX_CONN_PER_IP: '1', TRUST_PROXY: '1' })
  servers.heartbeat = await startServer({ HEARTBEAT_MS: '300', ENTER_TIMEOUT_MS: '60000' })
})
after(async () => {
  closeAll()
  for (const server of Object.values(servers)) await server.stop()
})

/** Thử mở WebSocket với header tùy ý: trả về { status: 'open', ws } hoặc { status: <mã HTTP bị từ chối> }. */
function attempt(server, headers = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(server.wsUrl, { headers })
    ws.on('open', () => resolve({ status: 'open', ws }))
    ws.on('unexpected-response', (_req, res) => {
      resolve({ status: res.statusCode })
      ws.terminate()
    })
    ws.on('error', (e) => resolve({ status: `lỗi: ${e.message}` })) // không bao giờ để test treo
  })
}
const closeCode = (ws) => new Promise((resolve) => ws.on('close', (code) => resolve(code)))

test('gói quá lớn bị đóng bằng mã 1009; gói hợp lệ lớn (chat 200 ký tự nhiều byte) vẫn qua', async () => {
  const ok = connect(servers.main, 'BigOk', { tab: 'h-ok' })
  await ok.admitted()
  ok.send({ t: 'chat', text: 'ế'.repeat(200), id: 1 }) // ~600 byte UTF-8
  await ok.until(() => ok.find('chatAck'), 'chat dài hợp lệ được nhận')

  const bad = connect(servers.main, 'BigBad', { tab: 'h-bad' })
  await bad.admitted()
  const code = closeCode(bad.ws)
  bad.send({ t: 'chat', text: 'x'.repeat(10_000), id: 1 })
  assert.equal(await code, 1009)
  assert.ok(ok.ws.readyState === WebSocket.OPEN, 'người khác không bị ảnh hưởng')
})

test('Origin: cùng nguồn và không có Origin được nhận; nguồn lạ, "null", sai định dạng bị 403', async () => {
  const host = `127.0.0.1:${servers.main.port}`
  const same = await attempt(servers.main, { Origin: `http://${host}` })
  assert.equal(same.status, 'open')
  same.ws.terminate()
  const none = await attempt(servers.main)
  assert.equal(none.status, 'open')
  none.ws.terminate()
  for (const origin of ['http://evil.example', 'null', 'not a url', `http://${host}.evil.example`]) {
    assert.equal((await attempt(servers.main, { Origin: origin })).status, 403, `Origin "${origin}" phải bị từ chối`)
  }
})

test('ALLOWED_ORIGINS: nguồn khai báo được nhận (kể cả sau dấu phẩy + khoảng trắng), nguồn khác vẫn bị chặn', async () => {
  for (const origin of ['https://hangmu.online', 'https://www.hangmu.online']) {
    const r = await attempt(servers.allowed, { Origin: origin })
    assert.equal(r.status, 'open', origin)
    r.ws.terminate()
  }
  assert.equal((await attempt(servers.allowed, { Origin: 'https://hangmu.online.evil.example' })).status, 403)
  assert.equal((await attempt(servers.allowed, { Origin: 'http://hangmu.online' })).status, 403, 'khác giao thức là khác nguồn')
})

test('kết nối không gửi enter kịp thì bị đóng (mã 4000)', async () => {
  const r = await attempt(servers.main)
  assert.equal(r.status, 'open')
  assert.equal(await closeCode(r.ws), 4000)
})

test('flood JSON: bị bỏ gói rồi đóng (1008); tốc độ hợp lý thì không sao', async () => {
  const calm = connect(servers.main, 'Calm', { tab: 'h-calm' })
  await calm.admitted()
  for (let i = 0; i < 20; i += 1) {
    calm.send({ t: 'punch', target: 999 })
    await sleep(80) // ~12 gói/giây, dưới mức 20/giây
  }
  assert.equal(calm.ws.readyState, WebSocket.OPEN, 'tốc độ hợp lý không bị cắt')

  const flooder = connect(servers.main, 'Flood', { tab: 'h-flood' })
  await flooder.admitted()
  const code = closeCode(flooder.ws)
  for (let i = 0; i < 400; i += 1) flooder.send({ t: 'punch', target: 999 })
  assert.equal(await code, 1008)
  assert.equal(calm.ws.readyState, WebSocket.OPEN, 'người khác không bị ảnh hưởng')
  calm.send({ t: 'chat', text: 'vẫn nói được', id: 1 })
  await calm.until(() => calm.find('chatAck'), 'người khác vẫn chat được')
})

test('flood nhị phân (gói vị trí) cũng bị cắt', async () => {
  const c = connect(servers.main, 'MoveFlood', { tab: 'h-mflood' })
  await c.admitted()
  const code = closeCode(c.ws)
  for (let i = 0; i < 600; i += 1) c.sendBytes(moveBytes(0, 36))
  assert.equal(await code, 1008)
})

test('giới hạn kết nối theo IP: vượt thì 429, giải phóng chỗ khi đóng, và không bị lừa bằng X-Forwarded-For', async () => {
  const open = []
  for (let i = 0; i < 3; i += 1) {
    const r = await attempt(servers.perIp, { 'X-Forwarded-For': `9.9.9.${i}` }) // header giả bị bỏ qua vì chưa bật TRUST_PROXY
    assert.equal(r.status, 'open')
    open.push(r.ws)
  }
  assert.equal((await attempt(servers.perIp, { 'X-Forwarded-For': '8.8.8.8' })).status, 429)
  open[0].terminate()
  await until(async () => (await attempt(servers.perIp)).status === 'open', { label: 'chỗ được giải phóng sau khi đóng' })
  for (const ws of open) ws.terminate()
})

test('giới hạn số kết nối mới mỗi phút theo IP', async () => {
  const sockets = []
  for (let i = 0; i < 5; i += 1) {
    const r = await attempt(servers.rate)
    assert.equal(r.status, 'open', `kết nối ${i + 1}`)
    sockets.push(r.ws)
    r.ws.terminate() // đóng ngay: giới hạn này tính theo số lần kết nối, không theo số đang mở
  }
  assert.equal((await attempt(servers.rate)).status, 429)
})

test('TRUST_PROXY: giới hạn theo IP thật trong X-Forwarded-For', async () => {
  const a = await attempt(servers.proxy, { 'X-Forwarded-For': '1.1.1.1' })
  const b = await attempt(servers.proxy, { 'X-Forwarded-For': '2.2.2.2' })
  assert.equal(a.status, 'open')
  assert.equal(b.status, 'open', 'IP khác nhau được tính riêng')
  assert.equal((await attempt(servers.proxy, { 'X-Forwarded-For': '1.1.1.1, 10.0.0.1' })).status, 429, 'cùng IP đầu danh sách bị chặn')
  a.ws.terminate()
  b.ws.terminate()
})

/** Client thô: tự bắt tay WebSocket qua TCP để gửi được cả những khung mà thư viện `ws` không bao giờ tạo ra. */
async function rawClient(server) {
  const socket = net.connect(server.port, '127.0.0.1')
  let response = ''
  socket.on('data', (chunk) => (response += chunk.toString('latin1')))
  socket.on('error', () => {})
  const closed = new Promise((resolve) => socket.on('close', resolve))
  socket.write(
    `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
  )
  await until(() => /101 Switching Protocols/.test(response), { label: 'bắt tay thành công' })
  return { socket, closed }
}

test('server sống sót khi nhận khung WebSocket hỏng, và vẫn phục vụ người khác', async () => {
  const healthy = connect(servers.main, 'Healthy', { tab: 'h-healthy' })
  await healthy.admitted()
  const frames = [
    Buffer.from([0xff, 0x00]), // bit dự trữ (RSV) bật + opcode 0xF không hợp lệ
    Buffer.from([0x81, 0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), // khai báo độ dài 2^64
    Buffer.from([0x81, 0x85, 0, 0, 0, 0, 0xc3, 0x28, 0xc3, 0x28, 0xc3]), // văn bản có mặt nạ nhưng UTF-8 sai
    Buffer.from([0x88, 0x7e, 0x00, 0x7e]), // khung đóng (control) quá dài
  ]
  for (const frame of frames) {
    const raw = await rawClient(servers.main)
    raw.socket.write(frame)
    await Promise.race([raw.closed, sleep(2000)])
    raw.socket.destroy()
  }
  const after = await attempt(servers.main)
  assert.equal(after.status, 'open', 'server vẫn nhận kết nối mới')
  after.ws.terminate()
  healthy.send({ t: 'chat', text: 'vẫn sống', id: 1 })
  await healthy.until(() => healthy.find('chatAck'), 'người đang chơi vẫn chat được')
})

test('heartbeat: kết nối không trả lời ping bị cắt', async () => {
  // Client thô bắt tay WebSocket rồi im lặng (không trả pong, không gửi gì).
  const { socket, closed } = await rawClient(servers.heartbeat)
  void socket
  const t0 = Date.now()
  await Promise.race([closed, sleep(4000).then(() => assert.fail('server không cắt kết nối im lặng'))])
  assert.ok(Date.now() - t0 < 3000, `cắt sau ${Date.now() - t0}ms`)
})
