// Bơm N người giả đi lại trong hang của server đang chạy (mặc định cổng 8790, xem `npm run lan`).
//   npm run crowd -- 100            100 người
//   HOST=10.0.0.5 PORT=8790 SECONDS=60 npm run crowd -- 200
import WebSocket from 'ws'

const count = Number(process.argv[2] ?? 60)
const host = process.env.HOST ?? '127.0.0.1'
const port = process.env.PORT ?? '8790'
const seconds = Number(process.env.SECONDS ?? 0) // 0 = chạy tới khi nhấn Ctrl+C

function move(x, z, dir) {
  const buffer = Buffer.alloc(9)
  buffer.writeUInt8(1, 0)
  buffer.writeInt16LE(Math.round(x * 256), 1)
  buffer.writeInt16LE(Math.round(z * 256), 3)
  buffer.writeUInt8(0, 5)
  buffer.writeUInt8(dir, 6)
  buffer.writeUInt16LE(0, 7)
  return buffer
}

import { createWalker, randomClearPoint } from '../tests/helpers/walker.mjs'

const sockets = []
for (let i = 0; i < count; i += 1) {
  const ws = new WebSocket(`ws://${host}:${port}/ws`)
  const walker = createWalker(0, 36)
  let goal = { x: 0, z: 36 }
  let nextTurn = 0
  let lastSend = 0
  ws.on('message', () => {})
  ws.on('error', () => {})
  ws.on('open', () => {
    ws.send(JSON.stringify({ t: 'enter', name: `Fan ${i + 1}`, number: 1 + (i % 99), tab: `crowd-${process.pid}-${i}` }))
    const timer = setInterval(() => {
      const now = Date.now()
      if (now >= nextTurn) {
        goal = randomClearPoint(4, 40)
        nextTurn = now + 1000 + Math.random() * 3000
        lastSend = 0
      }
      const moving = walker.advance(goal)
      if (ws.readyState === WebSocket.OPEN && (lastSend === 0 || now - lastSend >= 1000)) {
        ws.send(move(walker.x, walker.z, moving ? 7 << 5 : 0))
        lastSend = now
      }
    }, 100)
    ws.on('close', () => clearInterval(timer))
  })
  sockets.push(ws)
}
console.log(`Đang đưa ${count} người giả vào ws://${host}:${port}/ws … (Ctrl+C để dừng)`)
const stop = () => {
  // Báo rời hang để người giả biến mất ngay, thay vì bị giữ chỗ 30 giây như khi mất kết nối.
  for (const ws of sockets) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'leave' }))
  setTimeout(() => {
    for (const ws of sockets) ws.terminate()
    process.exit(0)
  }, 300)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
if (seconds > 0) setTimeout(stop, seconds * 1000)
