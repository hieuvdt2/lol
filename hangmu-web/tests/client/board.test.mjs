// NetClient xử lý thông điệp `board`, dùng máy chủ WebSocket giả để điều khiển chính xác thứ tự thông điệp.
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
const admitted = (selfIndex = 1) => ({ t: 'admitted', selfIndex, tickHz: 30, serverTick: 0, capacity: 50, roster: [{ i: selfIndex, name: 'Tester', n: null, b: false }] })

before(async () => {
  const port = await freePort()
  wss = new WebSocketServer({ port })
  wss.on('connection', (ws) => {
    socket = ws
    ws.on('message', () => {})
  })
  globalThis.location = { protocol: 'http:', host: `127.0.0.1:${port}` }
  ;({ NetClient } = await import('../../src/game/net.ts'))
})
after(() => {
  for (const c of clients) c.dispose()
  wss.close()
})

async function join() {
  const previous = socket
  const c = new NetClient()
  clients.push(c)
  c.connect('Tester', null)
  // Phải chờ kết nối MỚI: `socket` còn trỏ tới kết nối của bài trước (vẫn mở) cho tới khi máy chủ thấy kết nối này.
  await until(() => socket && socket !== previous && socket.readyState === 1, { label: 'socket mới mở' })
  socket.send(JSON.stringify(admitted()))
  await until(() => c.getState().phase === 'inCave', { label: 'vào hang' })
  return c
}

test('board: nhận danh sách video + nhạc hợp lệ, bỏ mục xấu và trùng', async () => {
  const c = await join()
  assert.deepEqual([c.getState().boardVideos, c.getState().boardMusic], [[], []])
  socket.send(JSON.stringify({ t: 'board', videos: ['video0001', 'video0001', '<bad>', 'video0002'], music: ['music0001'] }))
  await until(() => c.getState().boardVideos.length === 2, { label: 'nhận board' })
  assert.deepEqual(c.getState().boardVideos, ['video0001', 'video0002'])
  assert.deepEqual(c.getState().boardMusic, ['music0001'])
})

test('board: cập nhật thay thế toàn bộ; danh sách rỗng xóa nội dung', async () => {
  const c = await join()
  socket.send(JSON.stringify({ t: 'board', videos: ['video0001'], music: [] }))
  await until(() => c.getState().boardVideos.length === 1, { label: 'có video' })
  socket.send(JSON.stringify({ t: 'board', videos: [], music: [] }))
  await until(() => c.getState().boardVideos.length === 0, { label: 'xóa video' })
})

test('board: thông điệp giống hệt không làm đổi trạng thái (không render thừa)', async () => {
  const c = await join()
  socket.send(JSON.stringify({ t: 'board', videos: ['video0001'], music: [] }))
  await until(() => c.getState().boardVideos.length === 1, { label: 'có video' })
  const before = c.getState()
  socket.send(JSON.stringify({ t: 'board', videos: ['video0001'], music: [] }))
  await new Promise((r) => setTimeout(r, 150))
  assert.equal(c.getState(), before, 'cùng nội dung thì giữ nguyên đối tượng trạng thái')
})

test('board: trường video đơn lẻ kiểu cũ vẫn được nhận; dữ liệu rác không làm sập', async () => {
  const c = await join()
  socket.send(JSON.stringify({ t: 'board', video: 'legacy0001' }))
  await until(() => c.getState().boardVideos.length === 1, { label: 'nhận video kiểu cũ' })
  assert.deepEqual(c.getState().boardVideos, ['legacy0001'])
  socket.send(JSON.stringify({ t: 'board', videos: 'rác', music: 5 }))
  await until(() => c.getState().boardVideos.length === 0, { label: 'rác thành rỗng' })
})

test('board: nhận trước khi vào hang thì bị bỏ qua', async () => {
  const previous = socket
  const c = new NetClient()
  clients.push(c)
  c.connect('Tester', null)
  await until(() => socket && socket !== previous && socket.readyState === 1, { label: 'socket mới mở' })
  socket.send(JSON.stringify({ t: 'board', videos: ['early00001'], music: [] }))
  await new Promise((r) => setTimeout(r, 150))
  assert.deepEqual(c.getState().boardVideos, [])
})
