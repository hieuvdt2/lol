// Kiểm thử tải lâu để tìm rò rỉ bộ nhớ ở SERVER. Chạy: npm run perf:soak
//   N=400 SECONDS=120 SAMPLE_S=10 SKIP_S=30 npm run perf:soak
//
// Giữ ~N client: đi lại (báo vị trí khi đổi hướng + giữ nhịp 1 giây), chat thưa, vài cặp duel liên tục, người vào/ra
// (rời chủ động), mất kết nối rồi nối lại cùng tab (đường "resume"), và mất kết nối không quay lại (đường hết hạn giữ chỗ).
// Mỗi SAMPLE_S giây đọc /admin/status?gc=1 (server được chạy với --expose-gc nên heapUsed là số sau khi dọn rác), rồi in độ dốc
// tăng bộ nhớ (MB/phút) bằng hồi quy tuyến tính sau SKIP_S giây đầu (bỏ giai đoạn khởi động).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import WebSocket from 'ws'
import { freePort, root, sleep, until } from '../helpers/server.mjs'
import { moveBytes } from '../helpers/wsclient.mjs'
import { createWalker, randomClearPoint } from '../helpers/walker.mjs'

const N = Number(process.env.N ?? 400)
const SECONDS = Number(process.env.SECONDS ?? 120)
const SAMPLE_S = Number(process.env.SAMPLE_S ?? 10)
const SKIP_S = Number(process.env.SKIP_S ?? 30)
const PAIRS = Number(process.env.DUEL_PAIRS ?? 6)

const token = randomBytes(12).toString('hex')
const port = await freePort()
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hangmu-soak-'))
const child = spawn(process.execPath, ['--expose-gc', 'server/hangmu-server.mjs'], {
  cwd: root,
  env: {
    ...process.env, PORT: String(port), CAPACITY: '500', BOTS: '8', STATIC_DIR: '', DATA_DIR: dataDir, ADMIN_TOKEN: token,
    ADMIN_RATE_PER_MIN: '1000', MAX_CONN_PER_IP: '0', CONN_RATE_PER_MIN: '0', EXIT_WITH_PARENT: '1', LOG_LEVEL: 'error',
    DUEL_COUNTDOWN_MS: '500', DUEL_ROUND_MS: '4000', RESUME_GRACE_MS: '3000',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
})
process.once('exit', () => child.kill())
await until(async () => {
  try {
    return (await fetch(`http://127.0.0.1:${port}/healthz`)).ok
  } catch {
    return false
  }
}, { label: 'server khởi động' })

const base = `http://127.0.0.1:${port}`
const status = async () => (await fetch(`${base}/admin/status?gc=1`, { headers: { authorization: `Bearer ${token}` } })).json()

// ---------------------------------------------------------------- bot
let serial = 0
const bots = []
const stats = { joined: 0, left: 0, dropped: 0, resumed: 0, chats: 0, duelsStarted: 0, duelsEnded: 0 }

function spawnBot({ duelist = null, tab = `soak-${serial}`, name = `Soak ${serial}` } = {}) {
  serial += 1
  const bot = {
    tab, name, duelist, ws: null, index: -1, x: 0, z: 36, goal: { x: 0, z: 36 }, nextTurn: 0, lastSend: 0, nextChat: Date.now() + 10_000 + Math.random() * 40_000,
    inDuel: false, nextInvite: Date.now() + 2000, dead: false, pendingInvite: null,
  }
  bots.push(bot)
  connectBot(bot)
  return bot
}

function connectBot(bot) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
  bot.ws = ws
  ws.on('error', () => {})
  ws.on('open', () => ws.send(JSON.stringify({ t: 'enter', name: bot.name, number: 1 + (serial % 99), tab: bot.tab })))
  ws.on('message', (data, isBinary) => {
    if (isBinary) return
    let m
    try {
      m = JSON.parse(data.toString())
    } catch {
      return
    }
    if (m.t === 'admitted') {
      bot.index = m.selfIndex
      if (m.resumed) stats.resumed += 1
      else stats.joined += 1
    } else if (m.t === 'invite' && bot.duelist === 'B') {
      ws.send(JSON.stringify({ t: 'inviteAnswer', id: m.id, accept: true }))
    } else if (m.t === 'game' && m.g === 'duel') {
      if (m.d.a === 'start') {
        bot.inDuel = true
        stats.duelsStarted += bot.duelist === 'A' ? 1 : 0
      } else if (m.d.a === 'end') {
        bot.inDuel = false
        bot.nextInvite = Date.now() + 1500
        stats.duelsEnded += bot.duelist === 'A' ? 1 : 0
      }
    }
  })
}

// 400 người chơi thường + PAIRS cặp duel. Cặp duel đứng cạnh nhau gần điểm xuất phát và không đi lại.
for (let i = 0; i < N; i += 1) {
  spawnBot()
  if (i % 50 === 49) await sleep(100)
}
const pairs = []
for (let i = 0; i < PAIRS; i += 1) {
  const a = spawnBot({ duelist: 'A', tab: `soak-duel-a${i}`, name: `Duel A${i}` })
  const b = spawnBot({ duelist: 'B', tab: `soak-duel-b${i}`, name: `Duel B${i}` })
  pairs.push([a, b])
}
await until(async () => (await status()).players.humans >= Math.min(N, 480), { timeout: 60_000, label: 'đủ người trong hang' })

// ---------------------------------------------------------------- vòng lặp hành vi (một bộ đếm giờ chung, không phải N bộ)
const loop = setInterval(() => {
  const now = Date.now()
  for (const bot of bots) {
    const ws = bot.ws
    if (!ws || ws.readyState !== WebSocket.OPEN || bot.index < 0) continue
    if (bot.duelist) {
      if (bot.duelist === 'A') {
        const peer = pairs.find(([a]) => a === bot)?.[1]
        if (!bot.inDuel && peer && peer.index >= 0 && now >= bot.nextInvite) {
          ws.send(JSON.stringify({ t: 'inviteAsk', kind: 'duel', target: peer.index }))
          bot.nextInvite = now + 3000
        }
      }
      if (bot.inDuel && now - bot.lastSend > 600) {
        ws.send(JSON.stringify({ t: 'game', g: 'duel', d: { a: Math.random() < 0.6 ? 'punch' : 'block' } }))
        bot.lastSend = now
      }
      continue
    }
    if (now >= bot.nextTurn) {
      bot.goal = randomClearPoint(3, 40)
      bot.nextTurn = now + 500 + Math.random() * 2500
      bot.lastSend = 0
    }
    bot.walker ??= createWalker(bot.x, bot.z)
    const moving = bot.walker.advance(bot.goal)
    bot.x = bot.walker.x
    bot.z = bot.walker.z
    if (bot.lastSend === 0 || now - bot.lastSend >= 1000) {
      ws.send(moveBytes(bot.x, bot.z, { dir: moving ? 7 << 5 : 0 }))
      bot.lastSend = now
    }
    if (now >= bot.nextChat) {
      ws.send(JSON.stringify({ t: 'chat', text: `tin ${bot.name} ${now}`, id: 1 }))
      stats.chats += 1
      bot.nextChat = now + 20_000 + Math.random() * 40_000
    }
  }
}, 100)

// Người vào/ra: mỗi 5 giây, vài bot rời chủ động (và được thay bằng bot mới), vài bot rớt mạng rồi nối lại cùng tab, vài bot rớt mạng không quay lại.
const churn = setInterval(() => {
  const walkers = bots.filter((b) => !b.duelist && !b.dead && b.ws?.readyState === WebSocket.OPEN)
  const pick = (k) => Array.from({ length: k }, () => walkers[Math.floor(Math.random() * walkers.length)]).filter(Boolean)
  for (const bot of pick(Math.max(1, Math.round(N * 0.01)))) {
    bot.dead = true
    stats.left += 1
    bot.ws.send(JSON.stringify({ t: 'leave' }))
    spawnBot() // người mới thay chỗ
  }
  for (const bot of pick(Math.max(1, Math.round(N * 0.01)))) {
    if (bot.dead) continue
    stats.dropped += 1
    bot.ws.terminate()
    setTimeout(() => !bot.dead && connectBot(bot), 500 + Math.random() * 1500) // nối lại cùng tab trong thời gian giữ chỗ
  }
  for (const bot of pick(Math.max(1, Math.round(N * 0.005)))) {
    if (bot.dead) continue
    bot.dead = true // rớt mạng và không quay lại: phải hết hạn giữ chỗ rồi bị dọn
    stats.dropped += 1
    bot.ws.terminate()
    spawnBot()
  }
}, 5000)

// ---------------------------------------------------------------- lấy mẫu
const samples = []
const t0 = Date.now()
console.log(`soak: N=${N} (+${PAIRS * 2} duelist), ${SECONDS}s, mẫu mỗi ${SAMPLE_S}s, bỏ ${SKIP_S}s đầu khi tính độ dốc`)
console.log('  t(s) | người | RSS MB | heap MB | byTab | seen   | invites talks duels | wins | ipAttempts')
const take = async () => {
  const s = await status()
  const t = (Date.now() - t0) / 1000
  samples.push({ t, rss: s.memory.rssMB, heap: s.memory.heapUsedMB, st: s.structures, humans: s.players.humans })
  console.log(
    `  ${t.toFixed(0).padStart(4)} | ${String(s.players.humans).padStart(5)} | ${String(s.memory.rssMB).padStart(6)} | ${String(s.memory.heapUsedMB).padStart(7)} | ${String(s.structures.byTab).padStart(5)} | ${String(s.structures.seenEntries).padStart(6)} | ${String(s.structures.invites).padStart(7)} ${String(s.structures.talks).padStart(5)} ${String(s.structures.duels).padStart(5)} | ${String(s.structures.wins).padStart(4)} | ${s.structures.ipAttempts}`,
  )
}
try {
  while ((Date.now() - t0) / 1000 < SECONDS) {
    await sleep(SAMPLE_S * 1000)
    await take()
  }
} finally {
  clearInterval(loop)
  clearInterval(churn)
  for (const bot of bots) bot.ws?.terminate()
}

// ---------------------------------------------------------------- phân tích
function slope(points) {
  // hồi quy tuyến tính: MB trên giây
  const n = points.length
  if (n < 3) return null
  const mx = points.reduce((a, p) => a + p[0], 0) / n
  const my = points.reduce((a, p) => a + p[1], 0) / n
  let num = 0
  let den = 0
  for (const [x, y] of points) {
    num += (x - mx) * (y - my)
    den += (x - mx) ** 2
  }
  return den === 0 ? null : num / den
}
const steady = samples.filter((s) => s.t >= SKIP_S)
const perMin = (key) => {
  const v = slope(steady.map((s) => [s.t, s[key]]))
  return v === null ? null : +(v * 60).toFixed(2)
}
// Độ dốc chỉ trên NỬA SAU của đoạn ổn định: một bước nhảy một lần (V8 nới vùng nhớ, bộ đệm ấm lên) làm độ dốc toàn đoạn dương
// dù không có rò rỉ; nếu nửa sau phẳng thì đó là bậc thang chứ không phải rò rỉ liên tục.
const lateHalf = steady.slice(Math.floor(steady.length / 2))
const lateSlope = (key) => {
  const v = slope(lateHalf.map((s) => [s.t, s[key]]))
  return v === null ? null : +(v * 60).toFixed(2)
}
const summary = {
  samplesUsed: steady.length,
  heapSlopeSecondHalfMBperMin: lateSlope('heap'),
  rssSlopeSecondHalfMBperMin: lateSlope('rss'),
  rssSlopeMBperMin: perMin('rss'),
  heapSlopeMBperMin: perMin('heap'),
  rssFirstLastMB: steady.length ? [steady[0].rss, steady.at(-1).rss] : null,
  heapFirstLastMB: steady.length ? [steady[0].heap, steady.at(-1).heap] : null,
  structuresFirstLast: steady.length ? { first: steady[0].st, last: steady.at(-1).st } : null,
  activity: stats,
}
console.log('\nTóm tắt:')
console.log(JSON.stringify(summary, null, 2))
// Quy ước thô để đọc kết quả (không phải ngưỡng khoa học): quanh 0 MB/phút là ổn; vài MB/phút kéo dài là đáng nghi.
const whole = summary.heapSlopeMBperMin
const late = summary.heapSlopeSecondHalfMBperMin
console.log(
  late !== null && late > 1
    ? `[đáng nghi] heap vẫn tăng ${late} MB/phút ở nửa sau (toàn đoạn: ${whole})`
    : whole !== null && whole > 1
      ? `[có thể là bậc thang, chưa phải rò rỉ] toàn đoạn ${whole} MB/phút nhưng nửa sau chỉ ${late} MB/phút; chạy lâu hơn để chắc`
      : `[ổn trong phạm vi phép đo] heap ${whole} MB/phút (nửa sau ${late})`,
)

child.kill('SIGTERM')
await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(8000)])
fs.rmSync(dataDir, { recursive: true, force: true })
process.exit(0)
