// NetClient: lý do bị từ chối (cấm / mời ra / hết chỗ...) và đóng bình chọn (`pollClosed`), dùng máy chủ WebSocket giả.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocketServer } from 'ws'
import { freePort, until } from '../helpers/server.mjs'

const store = new Map()
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {}, pointerLockElement: null }
globalThis.window = globalThis
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}

let wss
let socket
let NetClient
const clients = []
const admitted = { t: 'admitted', selfIndex: 1, tickHz: 30, serverTick: 0, capacity: 50, roster: [{ i: 1, name: 'Tester', n: null, b: false }] }

before(async () => {
  const port = await freePort()
  wss = new WebSocketServer({ port })
  wss.on('connection', (ws) => {
    socket = ws
    ws.on('message', () => {})
    ws.on('error', () => {})
  })
  globalThis.location = { protocol: 'http:', host: `127.0.0.1:${port}` }
  ;({ NetClient } = await import('../../src/game/net.ts'))
})
after(() => {
  for (const c of clients) c.dispose()
  wss.close()
})

async function connectClient() {
  const previous = socket
  const c = new NetClient()
  clients.push(c)
  c.connect('Tester', null)
  await until(() => socket && socket !== previous && socket.readyState === 1, { label: 'socket mới mở' })
  return c
}
async function join() {
  const c = await connectClient()
  socket.send(JSON.stringify(admitted))
  await until(() => c.getState().phase === 'inCave', { label: 'vào hang' })
  return c
}

test('bị từ chối: mỗi lý do có thông báo riêng, đưa về trạng thái đóng và không tự nối lại', async () => {
  const cases = [
    ['invalid_name', /Tên không hợp lệ/],
    ['other_tab', /tab khác/],
    ['banned', /cấm/],
    ['kicked', /mời ra/],
    ['full', /đã đầy/],
    ['ly-do-la', /đã đầy/], // lý do lạ rơi về thông báo chung, không để trống
  ]
  for (const [reason, pattern] of cases) {
    const c = await connectClient()
    socket.send(JSON.stringify({ t: 'rejected', reason }))
    await until(() => c.getState().phase === 'closed', { label: `đóng vì ${reason}` })
    assert.match(c.getState().error ?? '', pattern, reason)
    assert.equal(c.getState().reconnectUntil, 0, `${reason}: không được tự nối lại`)
  }
})

test('bị mời ra khi đang trong hang: về trạng thái đóng kèm lý do', async () => {
  const c = await join()
  socket.send(JSON.stringify({ t: 'rejected', reason: 'kicked' }))
  await until(() => c.getState().phase === 'closed', { label: 'bị mời ra' })
  assert.match(c.getState().error ?? '', /mời ra/)
})

test('pollClosed: đóng đúng bình chọn đang hiện, bỏ qua id khác hoặc khi chưa có poll', async () => {
  const c = await join()
  socket.send(JSON.stringify({ t: 'pollClosed', id: 1 })) // chưa có poll: không lỗi
  socket.send(JSON.stringify({ t: 'poll', id: 7, q: 'Ai đá chính?', options: ['An', 'Bình'] }))
  await until(() => c.getState().poll?.id === 7, { label: 'có poll' })
  c.vote(1)
  assert.equal(c.getState().pollVoted, true)
  socket.send(JSON.stringify({ t: 'pollClosed', id: 99 }))
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(c.getState().poll?.id, 7, 'id khác thì giữ nguyên')
  socket.send(JSON.stringify({ t: 'pollClosed', id: 7 }))
  await until(() => c.getState().poll === undefined, { label: 'poll đã đóng' })
  assert.equal(c.getState().pollVoted, false, 'trạng thái đã bỏ phiếu được đặt lại cho poll sau')
})
