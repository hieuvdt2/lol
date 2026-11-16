// Client WebSocket thô để kiểm tra giao thức ở mức byte / JSON.
import WebSocket from 'ws'
import { until } from './server.mjs'

const live = new Set()

/** Đóng mọi socket còn mở; gọi trong `after` để test thất bại không làm treo tiến trình. */
export function closeAll() {
  for (const client of live) client.ws.terminate()
  live.clear()
}

export function connect(server, name, { tab, number, look, enter = true } = {}) {
  const ws = new WebSocket(server.wsUrl)
  ws.binaryType = 'arraybuffer'
  const client = { ws, json: [], bin: [], closed: false }
  live.add(client)
  ws.on('message', (data, isBinary) => {
    if (isBinary) client.bin.push(Buffer.from(data))
    else client.json.push(JSON.parse(data.toString()))
  })
  ws.on('close', () => (client.closed = true))
  client.opened = new Promise((resolve) => ws.on('open', resolve))
  client.enter = async () => {
    await client.opened
    ws.send(JSON.stringify({ t: 'enter', name, ...(number ? { number } : {}), ...(look !== undefined ? { look } : {}), ...(tab ? { tab } : {}) }))
  }
  client.send = (message) => ws.send(JSON.stringify(message))
  client.sendBytes = (buffer) => ws.send(buffer)
  client.find = (t) => client.json.find((m) => m.t === t)
  client.all = (t) => client.json.filter((m) => m.t === t)
  client.game = (g) => client.json.filter((m) => m.t === 'game' && m.g === g).map((m) => m.d)
  client.until = (fn, label) => until(fn, { label })
  client.admitted = () => client.until(() => client.find('admitted'), `${name} được nhận vào`)
  client.close = () => ws.terminate()
  if (enter) client.enter()
  return client
}

export function moveBytes(x, z, { heading = 128, dir = 0, tick = 0 } = {}) {
  const buffer = Buffer.alloc(9)
  buffer.writeUInt8(1, 0)
  buffer.writeInt16LE(Math.round(x * 256), 1)
  buffer.writeInt16LE(Math.round(z * 256), 3)
  buffer.writeUInt8(heading, 5)
  buffer.writeUInt8(dir, 6)
  buffer.writeUInt16LE(tick, 7)
  return buffer
}

export function pingBytes(clientTime) {
  const buffer = Buffer.alloc(5)
  buffer.writeUInt8(2, 0)
  buffer.writeUInt32LE(clientTime, 1)
  return buffer
}
