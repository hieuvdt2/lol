// Đo băng thông phát vị trí của server theo số người. Chạy: npm run perf:network
//   N=300 PROFILE=realistic|worst SECONDS=15 INTEREST=on|off npm run perf:network
// realistic: client chỉ gửi khi đổi hướng (mỗi 0,5–2 giây), như client thật (cộng gửi giữ nhịp mỗi giây khi đang đi).
// worst:     client gửi mỗi 100ms (cùng lúc 500 người liên tục báo vị trí).
import { execFileSync } from 'node:child_process'
import WebSocket from 'ws'
import { sleep, startServer } from '../helpers/server.mjs'
import { moveBytes } from '../helpers/wsclient.mjs'
import { createWalker, randomClearPoint } from '../helpers/walker.mjs'

const N = Number(process.env.N ?? 300)
const PROFILE = process.env.PROFILE ?? 'realistic'
const SECONDS = Number(process.env.SECONDS ?? 15)
const WARMUP = 6

const server = await startServer({ CAPACITY: '500', BOTS: '12', INTEREST: process.env.INTEREST ?? 'on' })
const cpuSeconds = () => {
  const t = execFileSync('ps', ['-o', 'time=', '-p', String(server.pid)]).toString().trim() // [[HH:]MM:]SS[.cc]
  return t.split(':').reduce((acc, part) => acc * 60 + Number(part), 0)
}

const clients = []
let counting = false
const totals = { bytes: 0, packets: 0, records: 0 }
for (let i = 0; i < N; i += 1) {
  const ws = new WebSocket(server.wsUrl)
  ws.binaryType = 'nodebuffer'
  const walker = createWalker(0, 36)
  let goal = { x: 0, z: 36 }
  let lastSend = 0
  let nextTurn = 0
  const state = { ws, timer: null }
  ws.on('message', (data, isBinary) => {
    if (!isBinary || data[0] !== 129 || !counting) return
    totals.bytes += data.length
    totals.packets += 1
    totals.records += data.readUInt16LE(3)
  })
  ws.on('open', () => {
    ws.send(JSON.stringify({ t: 'enter', name: `Load ${i}`, number: 1 + (i % 99), tab: `net-${i}` }))
    state.timer = setInterval(() => {
      const now = Date.now()
      if (now >= nextTurn) {
        goal = randomClearPoint(3, 40)
        // worst: đích giữ vài giây (đám đông thật sự tản ra khắp hang) nhưng vẫn gửi mỗi 100ms.
        nextTurn = now + (PROFILE === 'worst' ? 4000 + Math.random() * 4000 : 500 + Math.random() * 1500)
        lastSend = 0 // đổi hướng thì gửi ngay
      }
      const moving = walker.advance(goal)
      const every = PROFILE === 'worst' ? 100 : 1000
      if (ws.readyState === WebSocket.OPEN && now - lastSend >= (lastSend === 0 ? 0 : every)) {
        ws.send(moveBytes(walker.x, walker.z, { dir: moving ? 7 << 5 : 0 }))
        lastSend = now
      }
    }, 100)
  })
  clients.push(state)
  if (i % 50 === 49) await sleep(150)
}

await sleep(WARMUP * 1000)
const cpu0 = cpuSeconds()
const t0 = Date.now()
counting = true
await sleep(SECONDS * 1000)
counting = false
const wall = (Date.now() - t0) / 1000
const cpu = (cpuSeconds() - cpu0) / wall

console.log(JSON.stringify({
  profile: PROFILE, interest: process.env.INTEREST ?? 'on', clients: N,
  egressMBps: +(totals.bytes / wall / 1048576).toFixed(3),
  perClientKBps: +(totals.bytes / wall / 1024 / N).toFixed(2),
  packetsPerSec: Math.round(totals.packets / wall),
  recordsPerSec: Math.round(totals.records / wall),
  serverCpuPercent: Math.round(cpu * 100),
}))
for (const c of clients) {
  clearInterval(c.timer)
  c.ws.terminate()
}
await server.stop()
