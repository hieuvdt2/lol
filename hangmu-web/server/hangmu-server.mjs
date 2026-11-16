// Server phòng Hang MU dựng lại từ giao thức quan sát được trong bundle client đã capture
// (hangmu-site/assets/index-*.js). Chú thích:
//   [VERIFIED]  khớp trực tiếp với code client (opcode, tên message, hằng số).
//   [INFERRED]  suy ra từ cách client phản ứng; server gốc có thể khác.
//   [TODO]      chưa dựng (cần đọc thêm module `game`/duel của client).
//
// Chạy:  node server/hangmu-server.mjs   (PORT, CAPACITY, BOTS, STATIC_DIR chỉnh qua env)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { createAccounts, weekStart, sidCookie, sidFromCookieHeader, newSid, validateProfile } from './lib/accounts.mjs'
import { createAdmin } from './lib/admin.mjs'
import { cleanPoll, normalizeIds } from './lib/ids.mjs'
import { filterChat, filterDm } from './lib/filter.mjs'
import { createLadder } from './lib/ladder.mjs'
import { createLogger } from './lib/log.mjs'
import { gradeAnswer, publicQuestions } from './lib/quiz.mjs'
import { createStore } from './lib/store.mjs'
import { DEFAULT_LOOK_CODE, encodeLook, normalizeLookCode, randomLook } from '../shared/look.mjs'
import { TRAP, bothPicked, createMatch, foeOf as trapFoe, pick as trapPick, place as trapPlace, resolveRound, startWalk } from '../shared/trap.mjs'
import { GATES, GATE_RANGE, SEATS, WALK_RADIUS, makeBody, resolveCollisions, stepBody } from '../shared/world.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8787)
const CAPACITY = Number(process.env.CAPACITY || 500)
const QUEUE_MAX = Number(process.env.QUEUE_MAX || 200)
const BOT_COUNT = Number(process.env.BOTS ?? 8)
const STATIC_DIR = process.env.STATIC_DIR ?? path.resolve(here, '../../hangmu-site')
// ---------- vận hành ----------
const LOG_CHAT = process.env.LOG_CHAT === '1' // ghi nội dung chat (mức debug); mặc định KHÔNG, vì chat là dữ liệu riêng tư
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(here, '..', 'data'))
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '' // không đặt thì /admin/* không tồn tại (404)
const SHUTDOWN_MS = Number(process.env.SHUTDOWN_MS || 10_000) // tắt êm tối đa bấy nhiêu rồi thoát cưỡng bức
const DRAIN_GRACE_MS = Number(process.env.DRAIN_GRACE_MS || 0) // trước khi đóng cổng, báo /readyz = 503 trong từng ấy ms để bộ cân bằng tải rút server ra (phải nhỏ hơn SHUTDOWN_MS)
const WINS_MAX = Number(process.env.WINS_MAX || 500) // số tên tối đa trong bảng xếp hạng lưu lại: tên do người chơi tự đặt nên nếu không chặn thì phình vô hạn
const RANK_CHECK_MS = Number(process.env.RANK_CHECK_MS || 60_000) // chu kỳ dọn hồ sơ hết hạn và kiểm tra sang tuần mới
const WEEK_OFFSET_HOURS = Number(process.env.WEEK_OFFSET_HOURS ?? 7) // tuần của bảng võ công bắt đầu thứ Hai 00:00 theo múi giờ này (mặc định giờ Việt Nam, UTC+7)
const CHAT_FILTER = (process.env.CHAT_FILTER ?? 'on') !== 'off' // lọc từ thô tục (chat chung + riêng) và che link/SĐT trong chat riêng
const log = createLogger(process.env.LOG_LEVEL ?? 'info')
const accounts = createAccounts({ max: Number(process.env.ACCOUNTS_MAX || 100_000) }) // hồ sơ tên + số áo theo cookie hm_sid, 14 ngày
let draining = false
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
}

// [VERIFIED] hằng số dùng chung với client (object F trong bundle).
const TICK_HZ = 30
const POS_SCALE = 256
const CHAT_MAX_CHARS = 200
const CHAT_MIN_INTERVAL_MS = 1500
const PUNCH_RANGE = 2.5
const PUNCH_COOLDOWN_MS = 1500
const PUNCH_IMMUNE_MS = 3000
const INVITE_RANGE = 6

// [VERIFIED] opcode nhị phân.
const OP = { MOVE: 1, PING: 2, WELCOME: 128, MOVES: 129, CORRECTION: 130, PONG: 131 }

// [INFERRED] các giá trị server tự chọn.
const RESUME_GRACE_MS = Number(process.env.RESUME_GRACE_MS || 30_000) // client thử kết nối lại tối đa 25s
// ---------- lọc cập nhật vị trí theo khoảng cách (interest management) ----------
// [INFERRED] Server gốc gửi bản ghi của mọi người cho mọi người; đây là tối ưu của riêng ta, không đổi giao thức:
// người gần nhận cập nhật mỗi vòng (10Hz), tầm trung ~3,3Hz, người xa ~1Hz. Client đã tự dự đoán bằng hướng đi nên
// vẫn mượt. INTEREST=off quay về kiểu cũ (phát hết cho mọi người), dùng để so sánh và làm kiểm thử.
const INTEREST = (process.env.INTEREST ?? 'on') !== 'off'
const NEAR_R = Number(process.env.INTEREST_NEAR || 20)
const MID_R = Number(process.env.INTEREST_MID || 45)
const MID_EVERY = Number(process.env.INTEREST_MID_EVERY || 3) // đơn vị: vòng phát (mỗi vòng = 3 tick)
const FAR_EVERY = Number(process.env.INTEREST_FAR_EVERY || 10)
// ---------- bảo vệ khi chạy công khai ----------
// Mặc định chặt; các script dev/test nới bằng biến môi trường (MAX_CONN_PER_IP=0, ...).
const MAX_PAYLOAD = Number(process.env.MAX_PAYLOAD || 4096) // byte; gói lớn nhất hợp lệ (DM 400 ký tự ≈ 1,7 KB). `ws` mặc định cho tới 100 MiB.
const MAX_CONN_PER_IP = Number(process.env.MAX_CONN_PER_IP ?? 20) // 0 = không giới hạn. Nhiều người chung một IP (NAT) vẫn cần chỗ.
const CONN_RATE_PER_MIN = Number(process.env.CONN_RATE_PER_MIN ?? 60) // số kết nối mới mỗi IP mỗi phút; 0 = không giới hạn
const ENTER_TIMEOUT_MS = Number(process.env.ENTER_TIMEOUT_MS || 10_000) // kết nối không gửi `enter` kịp thì đóng
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 30_000) // ping định kỳ, không phản hồi thì cắt
const ORIGIN_CHECK = (process.env.ORIGIN_CHECK ?? 'on') !== 'off'
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((v) => v.trim()).filter(Boolean)
const TRUST_PROXY = process.env.TRUST_PROXY === '1' // tin X-Forwarded-For / X-Forwarded-Host khi đứng sau proxy ngược
const MSG_RATE = Number(process.env.MSG_RATE || 20) // JSON/giây (bền vững); chat, đấm, mời... đều thấp hơn xa mức này
const MSG_BURST = Number(process.env.MSG_BURST || 40)
const BIN_RATE = Number(process.env.BIN_RATE || 40) // nhị phân/giây: client gốc gửi vị trí tối đa 10/giây + ping thưa
const BIN_BURST = Number(process.env.BIN_BURST || 80)
const ABUSE_DROPS = Number(process.env.ABUSE_DROPS || 100) // số gói bị bỏ trong 10 giây thì đóng kết nối
// WALK_RADIUS lấy từ shared/world.mjs (vòng đi bộ nay gồm cả khán đài)
const MAX_SPEED = Number(process.env.MAX_SPEED || 14)
const SPAWN = { x: 0, z: 36 }
const INVITE_TTL_MS = 20_000
const INVITE_DECLINE_WAIT_MS = Number(process.env.INVITE_DECLINE_WAIT_MS || 30_000) // bị từ chối thì phải chờ chừng này mới mời lại cùng người
const TALK_IDLE_MS = 120_000
const DM_MAX = 400
const CHAT_GLOBAL_PER_SEC = 200
const NOTICE_WINDOW_MS = 3000
const REPLIES = ['Glory glory!', 'Vào đây ngồi với anh em.', 'Trận sau mình gỡ.', 'Đứng gần lửa cho ấm.']
const BOT_NAMES = [
  ['Ca Dic', 4], ['Bủ Nô', 8], ['Đa Lọt', 5], ['Mắc Gai', 3], ['Licha', 6], ['Lam Men', 1],
  ['A Mát', 11], ['Sét Cô', 7], ['Đờ Lít', 2], ['Dô Rô', 9], ['Lúc Sô', 13], ['Mai Nu', 16],
]

/** @type {Map<number, any>} */
let moveRound = 0
const players = new Map()
/** @type {Map<string, any>} tab id -> player (dùng cho resume / replaced) */
const byTab = new Map()
/** @type {any[]} hàng chờ ngoài cửa */
const queue = []
const invites = new Map() // id -> { id, kind, from, to, timer }
const talks = new Map() // id -> { id, a, b, lastAt, timer }
let nextIndex = 1
let nextInvite = 1
let nextTalk = 1
let serverTick = 0
let chatThisSecond = 0
let pendingChat = [] // [[index, text]]
let pendingJoinNames = []
let poll = null // { id, q, options, votes: Map<tab|"i:index", option> }
let pollSeq = 0 // id poll tăng dần và được lưu: nếu id lặp lại sau khi khởi động lại thì client sẽ tưởng là poll cũ
let board = { videos: [], music: [] } // [INFERRED] danh sách ID video/nhạc cho màn hình hội trường
const bans = new Map() // key ("tab:<id>" | "ip:<addr>") -> { key, kind, value, until, reason, createdAt }

const headingByte = (rad) => ((Math.round((rad / (Math.PI * 2)) * 256) % 256) + 256) % 256
const scale = (v) => Math.max(-32768, Math.min(32767, Math.round(v * POS_SCALE)))
const unscale = (v) => v / POS_SCALE
const now = () => Date.now()

// ---------- đóng gói nhị phân ----------
function packWelcome(list) {
  const buf = Buffer.alloc(3 + list.length * 8)
  buf.writeUInt8(OP.WELCOME, 0)
  buf.writeUInt16LE(list.length, 1)
  list.forEach((p, i) => {
    const o = 3 + i * 8
    buf.writeUInt16LE(p.index, o)
    buf.writeInt16LE(scale(p.x), o + 2)
    buf.writeInt16LE(scale(p.z), o + 4)
    buf.writeUInt8(p.heading, o + 6)
    buf.writeUInt8(p.dir, o + 7)
  })
  return buf
}
function packMoves(list) {
  const buf = Buffer.alloc(5 + list.length * 10)
  buf.writeUInt8(OP.MOVES, 0)
  buf.writeUInt16LE(serverTick & 0xffff, 1)
  buf.writeUInt16LE(list.length, 3)
  list.forEach((p, i) => {
    const o = 5 + i * 10
    buf.writeUInt16LE(p.index, o)
    buf.writeUInt16LE(serverTick & 0xffff, o + 2)
    buf.writeInt16LE(scale(p.x), o + 4)
    buf.writeInt16LE(scale(p.z), o + 6)
    buf.writeUInt8(p.heading, o + 8)
    buf.writeUInt8(p.dir, o + 9)
  })
  return buf
}
function packCorrection(x, z) {
  const buf = Buffer.alloc(5)
  buf.writeUInt8(OP.CORRECTION, 0)
  buf.writeInt16LE(scale(x), 1)
  buf.writeInt16LE(scale(z), 3)
  return buf
}
function packPong(clientTime) {
  const buf = Buffer.alloc(7)
  buf.writeUInt8(OP.PONG, 0)
  buf.writeUInt32LE(clientTime >>> 0, 1)
  buf.writeUInt16LE(serverTick & 0xffff, 5)
  return buf
}

// ---------- gửi / phát ----------
const open = (p) => p && !p.bot && p.ws && p.ws.readyState === 1
function send(p, value) {
  if (open(p)) p.ws.send(value)
}
function sendJson(p, message) {
  send(p, JSON.stringify(message))
}
function broadcast(value, except) {
  for (const p of players.values()) if (p !== except) send(p, value)
}
const broadcastJson = (message, except) => broadcast(JSON.stringify(message), except)

// ---------- chuẩn hóa chat (port từ hàm Zy của client) ----------
const isInvisible = (c) =>
  c <= 31 || (c >= 127 && c <= 159) || c === 173 || c === 847 || c === 4447 || c === 4448 ||
  c === 6068 || c === 6069 || c === 6158 || (c >= 8203 && c <= 8207) || (c >= 8232 && c <= 8238) ||
  (c >= 8288 && c <= 8292) || (c >= 8294 && c <= 8297) || c === 10240 || c === 12644 ||
  c === 65279 || c === 65440 || (c >= 917504 && c <= 917631)
function sanitize(raw) {
  return Array.from(String(raw).replace(/[\n\t]/g, ' '))
    .filter((ch) => !isInvisible(ch.codePointAt(0)))
    .join('')
    .normalize('NFC')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- người chơi ----------
function rosterEntry(p) {
  return { i: p.index, name: p.name, n: p.number, k: p.look ?? DEFAULT_LOOK_CODE, b: p.bot, x: p.x, z: p.z, heading: p.heading }
}
function inRoomCount() {
  return players.size
}
function addPlayer(fields) {
  const index = nextIndex++
  const p = {
    index, bot: false, ws: null, tab: null, x: SPAWN.x, z: SPAWN.z, heading: headingByte(Math.PI), dir: 0,
    dirty: true, moveSeq: 1, activeUntil: moveRound + FAR_EVERY, seen: new Map(), lastMoveAt: now(), lastCorrectionAt: 0, lastChatAt: 0, lastChatText: '',
    lastPunchAt: 0, immuneUntil: 0, lastDmAt: 0, inviteCooldown: new Map(), declinedUntil: 0,
    talkId: null, duelId: null, trapId: null, asking: null, voted: null, graceTimer: null, seat: null,
    thrown: 0, lastThrowAt: 0, lastLabelAt: 0, ip: null, ...fields,
  }
  players.set(index, p)
  return p
}
function removePlayer(p, reason = 'left') {
  if (!players.delete(p.index)) return
  clearTimeout(p.graceTimer)
  if (p.tab && byTab.get(p.tab) === p) byTab.delete(p.tab)
  cancelInvitesOf(p, 'gone')
  if (p.talkId != null) closeTalk(p.talkId, p.index, reason === 'idle' ? 'idle' : 'left')
  if (p.duelId != null) leaveDuel(p)
  if (p.trapId != null) leaveTrap(p)
  engaged.delete(p.index)
  for (const other of players.values()) other.seen.delete(p.index)
  broadcastJson({ t: 'leave', i: p.index })
  admitFromQueue()
}

function admit(p) {
  const resumed = !!p.resumed
  p.resumed = false
  if (poll && p.voted === null) {
    const earlier = poll.votes.get(voteKey(p)) // đã bỏ phiếu ở lần vào trước (cùng tab id)
    if (earlier !== undefined) p.voted = earlier
  }
  if (p.seat !== null) standUp(p) // nối lại sau khi rớt mạng: client mới không biết mình đang ngồi nên cho đứng dậy
  const welcomePlayers = [...players.values()]
  sendJson(p, {
    t: 'admitted', selfIndex: p.index, tickHz: TICK_HZ, serverTick, capacity: CAPACITY,
    roster: welcomePlayers.map(rosterEntry),
    ...(resumed ? { resumed: true, pollVoted: p.voted !== null } : {}),
  })
  send(p, packWelcome(welcomePlayers))
  if (poll) sendJson(p, { t: 'poll', id: poll.id, q: poll.q, options: poll.options })
  sendJson(p, { t: 'board', videos: board.videos, music: board.music })
  if (engaged.size > 0) sendJson(p, { t: 'engaged', on: [...engaged.entries()] })
  const seated = [...players.values()].filter((q) => q.seat !== null).map((q) => [q.index, q.seat])
  if (seated.length > 0) sendJson(p, { t: 'seats', on: seated })
  sendGame(p, 'duel', { a: 'rank', top: rankTop() })
  sendRage(p)
  if (!resumed) {
    broadcastJson({ t: 'join', ...rosterEntry(p) }, p.ws)
    pendingJoinNames.push(p.name)
    const greeter = [...players.values()].find((q) => q.bot)
    if (greeter) queueChat(greeter.index, 'Chào anh em vừa vào hang.')
  }
}

function admitFromQueue() {
  while (queue.length > 0 && inRoomCount() < CAPACITY) {
    const p = queue.shift()
    if (!open(p)) continue
    p.queued = false
    const fresh = addPlayer({ ...p.pending, ws: p.ws })
    p.ws.player = fresh
    fresh.tab = p.pending.tab
    if (fresh.tab) byTab.set(fresh.tab, fresh)
    admit(fresh)
  }
  queue.forEach((q, i) => sendJson(q, { t: 'queued', position: i + 1, inRoom: inRoomCount(), waiting: queue.length }))
}

// ---------- chat ----------
function queueChat(index, text) {
  pendingChat.push([index, text])
}
function handleChat(p, message) {
  const id = message.id
  const drop = (reason) => sendJson(p, { t: 'chatDropped', reason, ...(id === undefined ? {} : { id }) })
  if (typeof message.text !== 'string') return drop('invalid')
  const clean = sanitize(message.text)
  if (!clean || Array.from(clean).length > CHAT_MAX_CHARS) return drop('invalid')
  const text = CHAT_FILTER ? filterChat(clean) : clean
  if (chatThisSecond >= CHAT_GLOBAL_PER_SEC) return drop('busy')
  const t = now()
  if (t - p.lastChatAt < CHAT_MIN_INTERVAL_MS) return drop('rate')
  if (text === p.lastChatText && t - p.lastChatAt < 30_000) return drop('duplicate')
  p.lastChatAt = t
  p.lastChatText = text
  chatThisSecond += 1
  if (LOG_CHAT) log.debug('chat', { index: p.index, text })
  sendJson(p, { t: 'chatAck', id, text })
  pendingChat.push([p.index, text, p])
  const near = [...players.values()].find((q) => q.bot && Math.hypot(q.x - p.x, q.z - p.z) < 10)
  if (near) {
    const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)]
    setTimeout(() => players.has(near.index) && queueChat(near.index, reply), 700)
  }
}

// ---------- đấm ----------
// Ăn mừng (phím G): [Inference] bản gốc có nút này nhưng giao thức không nằm trong capture; đây là tin nhắn tự đặt.
// Client gửi {t:'emote'}; server chuyển {t:'emote', i:<chỉ số>} cho mọi người trong hang (kể cả người gửi để hai phía cùng một nguồn).
const EMOTE_MIN_INTERVAL_MS = Number(process.env.EMOTE_MIN_INTERVAL_MS || 5500) // ≥ thời gian ăn mừng (5,4 s, src/game/gait.ts)
function handleEmote(p) {
  const t = now()
  if (t - (p.lastEmoteAt ?? 0) < EMOTE_MIN_INTERVAL_MS) return
  if (p.talkId != null || p.duelId != null) return // đang chat riêng / võ thuật thì không ăn mừng
  p.lastEmoteAt = t
  broadcastJson({ t: 'emote', i: p.index })
}
// Vung tay (phím F): [Inference] bản gốc chỉ gửi `punch` khi có mục tiêu nên người khác không thấy cú đấm hụt; đây là tin nhắn tự đặt.
// Đấm hụt: client gửi {t:'swing'}; đòn trúng: server tự phát. Cả hai đều ra {t:'swing', i, target?} cho cả hang (target = người bị trúng).
function handleSwing(p) {
  const t = now()
  if (t - (p.lastSwingAt ?? 0) < PUNCH_COOLDOWN_MS) return
  if (p.talkId != null || p.duelId != null) return
  p.lastSwingAt = t
  broadcastJson({ t: 'swing', i: p.index })
}
function handlePunch(p, message) {
  if (!Number.isInteger(message.target) || message.target === p.index) return
  const target = players.get(message.target)
  if (!target) return
  const t = now()
  if (t - p.lastPunchAt < PUNCH_COOLDOWN_MS) return
  // [INFERRED] server nới tầm 20% so với client để bù độ trễ.
  if (Math.hypot(target.x - p.x, target.z - p.z) > PUNCH_RANGE * 1.2) return
  if (t < target.immuneUntil) return
  p.lastPunchAt = t
  p.lastSwingAt = t
  broadcastJson({ t: 'swing', i: p.index, target: target.index })
  target.immuneUntil = t + PUNCH_IMMUNE_MS
  sendJson(p, { t: 'punchHit', target: target.index, text: `đã 👊 ${target.name}` })
  queueChat(p.index, `đã 👊 ${target.name}`) // cả hang thấy bong bóng trên đầu người đấm và dòng ở mục "Hoạt động"
  sendJson(target, { t: 'punched', by: p.index })
}

// ---------- mời / nói chuyện riêng ----------
const busy = (p) => p.talkId != null || p.duelId != null || p.trapId != null || p.asking != null || [...invites.values()].some((v) => v.to === p.index)
function cancelInvite(inv, notifyTarget) {
  clearTimeout(inv.timer)
  invites.delete(inv.id)
  const from = players.get(inv.from)
  const to = players.get(inv.to)
  if (from) from.asking = null
  if (notifyTarget && to) sendJson(to, { t: 'inviteGone', id: inv.id })
}
function cancelInvitesOf(p, reason) {
  for (const inv of [...invites.values()]) {
    if (inv.from === p.index) cancelInvite(inv, true)
    else if (inv.to === p.index) {
      const from = players.get(inv.from)
      cancelInvite(inv, false)
      if (from) sendJson(from, { t: 'inviteDeclined', target: p.index, kind: inv.kind, reason })
    }
  }
}
function handleInviteAsk(p, message) {
  const decline = (reason, extra = {}) =>
    sendJson(p, { t: 'inviteDeclined', target: message.target, kind: message.kind, reason, ...extra })
  if (message.kind !== 'talk' && message.kind !== 'duel' && message.kind !== 'trap') return
  const target = players.get(message.target)
  if (!target || target === p) return decline('gone')
  const t = now()
  const wait = p.inviteCooldown.get(target.index) ?? 0
  if (t < wait) return decline('cooldown', { waitMs: wait - t })
  if (Math.hypot(target.x - p.x, target.z - p.z) > INVITE_RANGE) return decline('far')
  if (busy(p) || busy(target) || target.bot) return decline('busy')
  if (engaged.has(target.index)) return decline('busy')
  const id = nextInvite++
  const inv = { id, kind: message.kind, from: p.index, to: target.index, timer: null }
  inv.timer = setTimeout(() => {
    if (!invites.has(id)) return
    cancelInvite(inv, true)
    sendJson(p, { t: 'inviteDeclined', target: target.index, kind: inv.kind, reason: 'timeout' })
  }, INVITE_TTL_MS)
  invites.set(id, inv)
  p.asking = id
  sendJson(p, { t: 'inviteAsked', target: target.index, ms: INVITE_TTL_MS })
  sendJson(target, { t: 'invite', kind: inv.kind, id, from: p.index, name: p.name, ms: INVITE_TTL_MS })
}
function handleInviteAnswer(p, message) {
  const inv = invites.get(message.id)
  if (!inv || inv.to !== p.index) return
  const from = players.get(inv.from)
  cancelInvite(inv, false)
  if (!from) return
  if (!message.accept) {
    from.inviteCooldown.set(p.index, now() + INVITE_DECLINE_WAIT_MS)
    sendJson(from, { t: 'inviteDeclined', target: p.index, kind: inv.kind, reason: 'declined', waitMs: INVITE_DECLINE_WAIT_MS })
    return
  }
  if (inv.kind === 'duel') startDuel(from, p)
  else if (inv.kind === 'trap') startTrap(from, p)
  else openTalk(from, p)
}
function openTalk(a, b) {
  const id = nextTalk++
  const talk = { id, a: a.index, b: b.index, timer: null }
  talks.set(id, talk)
  forceStand(a)
  forceStand(b)
  a.talkId = b.talkId = id
  setEngaged([a.index, b.index], 'talk')
  armTalkIdle(talk)
  sendJson(a, { t: 'talkOpen', id, peer: b.index, name: b.name })
  sendJson(b, { t: 'talkOpen', id, peer: a.index, name: a.name })
}
function armTalkIdle(talk) {
  clearTimeout(talk.timer)
  talk.timer = setTimeout(() => closeTalk(talk.id, null, 'idle'), TALK_IDLE_MS)
}
function closeTalk(id, by, reason) {
  const talk = talks.get(id)
  if (!talk) return
  clearTimeout(talk.timer)
  talks.delete(id)
  setEngaged([talk.a, talk.b], null)
  for (const index of [talk.a, talk.b]) {
    const p = players.get(index)
    if (!p) continue
    p.talkId = null
    sendJson(p, { t: 'talkClosed', id, by: by ?? index, reason })
  }
}
function handleDm(p, message) {
  const talk = talks.get(p.talkId)
  const drop = () => sendJson(p, { t: 'dmDropped', id: message.id })
  if (!talk) return drop()
  const clean = typeof message.text === 'string' ? sanitize(message.text) : ''
  if (!clean || Array.from(clean).length > DM_MAX) return drop()
  const text = CHAT_FILTER ? filterDm(clean) : clean
  const t = now()
  if (t - p.lastDmAt < 500) return drop()
  p.lastDmAt = t
  armTalkIdle(talk)
  const peer = players.get(talk.a === p.index ? talk.b : talk.a)
  sendJson(p, { t: 'dmAck', id: message.id, text })
  if (peer) sendJson(peer, { t: 'dm', text })
}

// ---------- trạng thái "bận" (engaged) ----------
// [VERIFIED] client nhận {t:'engaged', on:[[index, kind]], off:[index]}; kind ngắn ≤16 ký tự.
const engaged = new Map() // index -> 'talk' | 'duel' | 'trap'
function setEngaged(indices, kind) {
  const on = []
  const off = []
  for (const i of indices) {
    if (kind) {
      engaged.set(i, kind)
      on.push([i, kind])
    } else if (engaged.delete(i)) off.push(i)
  }
  if (on.length || off.length) broadcastJson({ t: 'engaged', ...(on.length ? { on } : {}), ...(off.length ? { off } : {}) })
}

// ---------- gói game: duel ----------
// [VERIFIED] luật mặc định và hình dạng message lấy từ module `duel` của client.
// [INFERRED] thứ tự xử lý đòn / đỡ, cách tính thắng, taunt do server tự quyết.
const DUEL = { hp: 100, dmg: 15, windupMs: 500, blockMs: 400, blockCdMs: 600, punchCdMs: 800 }
const DUEL_ROUND_MS = Number(process.env.DUEL_ROUND_MS || 30_000)
const DUEL_COUNTDOWN_MS = Number(process.env.DUEL_COUNTDOWN_MS || 5000)
const duels = new Map()
const ladder = createLadder({ max: WINS_MAX, offsetHours: WEEK_OFFSET_HOURS }) // bảng "Võ công cao nhất hang": thắng trong tuần theo mã người dùng
let nextDuel = 1

const sendGame = (p, g, d) => sendJson(p, { t: 'game', g, d })
function rankTop() {
  return ladder.top()
}
function broadcastRank() {
  const top = rankTop()
  for (const p of players.values()) sendGame(p, 'duel', { a: 'rank', top })
}

function startDuel(a, b) {
  const id = nextDuel++
  const duel = {
    id, a: a.index, b: b.index, phase: 'countdown', timers: new Set(),
    hp: { [a.index]: DUEL.hp, [b.index]: DUEL.hp },
    stats: { [a.index]: { hits: 0, blocks: 0 }, [b.index]: { hits: 0, blocks: 0 } },
    punchReady: { [a.index]: 0, [b.index]: 0 }, blockReady: { [a.index]: 0, [b.index]: 0 },
    blockUntil: { [a.index]: 0, [b.index]: 0 }, pending: { [a.index]: false, [b.index]: false },
  }
  duels.set(id, duel)
  forceStand(a)
  forceStand(b)
  a.duelId = b.duelId = id
  setEngaged([a.index, b.index], 'duel')
  for (const [me, peer] of [[a, b], [b, a]]) {
    sendGame(me, 'duel', { a: 'start', peer: peer.index, name: peer.name, rules: DUEL, roundMs: DUEL_ROUND_MS, countdownMs: DUEL_COUNTDOWN_MS })
  }
  const later = (ms, fn) => {
    const timer = setTimeout(() => {
      duel.timers.delete(timer)
      fn()
    }, ms)
    duel.timers.add(timer)
  }
  duel.later = later
  later(1500, () => duel.phase === 'countdown' && sendBoth(duel, { a: 'taunt', by: b.index, key: 'start' }))
  later(DUEL_COUNTDOWN_MS, () => {
    if (duel.phase !== 'countdown') return
    duel.phase = 'fight'
    sendBoth(duel, { a: 'go', roundMs: DUEL_ROUND_MS })
    later(DUEL_ROUND_MS, () => finishDuel(duel, 'time'))
  })
}
function sendBoth(duel, d) {
  for (const i of [duel.a, duel.b]) {
    const p = players.get(i)
    if (p) sendGame(p, 'duel', d)
  }
}
const hpPairs = (duel) => [[duel.a, duel.hp[duel.a]], [duel.b, duel.hp[duel.b]]]
function duelAction(p, d) {
  const duel = duels.get(p.duelId)
  if (!duel || !d || typeof d !== 'object') return
  const me = p.index
  const foe = duel.a === me ? duel.b : duel.a
  const t = now()
  if (d.a === 'quit') return finishDuel(duel, 'quit', foe)
  if (duel.phase !== 'fight') return
  if (d.a === 'block') {
    if (t < duel.blockReady[me]) return
    duel.blockUntil[me] = t + DUEL.blockMs
    duel.blockReady[me] = t + DUEL.blockMs + DUEL.blockCdMs
    const other = players.get(foe)
    if (other) sendGame(other, 'duel', { a: 'guard', by: me, ms: DUEL.blockMs })
    return
  }
  if (d.a === 'punch') {
    if (t < duel.punchReady[me] || t < duel.blockUntil[me] || duel.pending[me]) return
    duel.pending[me] = true
    duel.punchReady[me] = t + DUEL.windupMs + DUEL.punchCdMs
    const other = players.get(foe)
    if (other) sendGame(other, 'duel', { a: 'windup', by: me, impactInMs: DUEL.windupMs })
    duel.later(DUEL.windupMs, () => {
      duel.pending[me] = false
      if (duel.phase !== 'fight') return
      const blocked = now() <= duel.blockUntil[foe]
      if (blocked) {
        duel.stats[foe].blocks += 1
        sendBoth(duel, { a: 'taunt', by: foe, key: 'blocked' })
      } else {
        duel.hp[foe] = Math.max(0, duel.hp[foe] - DUEL.dmg)
        duel.stats[me].hits += 1
      }
      sendBoth(duel, { a: 'result', target: foe, blocked, hp: hpPairs(duel) })
      if (duel.hp[foe] <= 0) finishDuel(duel, 'ko', me)
    })
  }
}
function finishDuel(duel, reason, forcedWinner) {
  if (!duels.delete(duel.id)) return
  duel.phase = 'ended'
  for (const timer of duel.timers) clearTimeout(timer)
  duel.timers.clear()
  let winner = forcedWinner ?? null
  if (winner === null && reason === 'time') {
    if (duel.hp[duel.a] !== duel.hp[duel.b]) winner = duel.hp[duel.a] > duel.hp[duel.b] ? duel.a : duel.b
  }
  const stats = [duel.a, duel.b].map((i) => [i, duel.stats[i].hits, duel.stats[i].blocks])
  sendBoth(duel, { a: 'end', winner, hp: hpPairs(duel), reason, stats })
  for (const i of [duel.a, duel.b]) {
    const p = players.get(i)
    if (p) p.duelId = null
  }
  setEngaged([duel.a, duel.b], null)
  const wp = winner === null ? null : players.get(winner)
  const lp = winner === null ? null : players.get(winner === duel.a ? duel.b : duel.a)
  const pa = players.get(duel.a)
  const pb = players.get(duel.b)
  const names = wp && lp ? [wp.name, lp.name] : [pa?.name, pb?.name]
  if (names.every((n) => typeof n === 'string' && n.length > 0)) {
    const diff = winner === null ? 0 : Math.abs(duel.hp[duel.a] - duel.hp[duel.b])
    const result = reason === 'quit' || reason === 'left' ? 'quit' : reason === 'ko' ? 'ko' : winner === null ? 'draw' : diff >= 40 ? 'big' : 'close'
    const hp = winner === null || !wp ? [duel.hp[duel.a], duel.hp[duel.b]] : [duel.hp[winner], duel.hp[winner === duel.a ? duel.b : duel.a]]
    broadcastJson({ t: 'notice', kind: 'duel_result', names, result, hp })
  }
  if (wp) {
    ladder.win(wp.sid ?? `name:${wp.name}`, wp.name)
    persist()
    log.debug('duel kết thúc', { winner: wp.name, loser: lp?.name, reason })
    broadcastRank()
  }
}
function leaveDuel(p) {
  const duel = duels.get(p.duelId)
  if (!duel) return
  const foe = duel.a === p.index ? duel.b : duel.a
  finishDuel(duel, 'left', foe)
}

// ---------- gói game: trap ("Bẫy Độc Noxus", tự thiết kế; luật trong shared/trap.mjs) ----------
// Client → server {t:'game', g:'trap', d}: {a:'place', cells} | {a:'step', col} | {a:'quit'}.
// Server → client: start, ready (ai đã giấu nấm xong), walk (bắt đầu dò đường, kèm nấm mình đã cắm), locked (ai đã chọn ô),
// round (lật kết quả lượt), end (kết quả + toàn bộ nấm hai bên). Nấm trên đường của mình chỉ lộ khi dẫm phải hoặc khi hết trận.
const TRAP_PLACE_MS = Number(process.env.TRAP_PLACE_MS || TRAP.placeMs)
const TRAP_TURN_MS = Number(process.env.TRAP_TURN_MS || TRAP.turnMs)
const TRAP_REVEAL_MS = Number(process.env.TRAP_REVEAL_MS ?? TRAP.revealMs)
const traps = new Map()
let nextTrap = 1
const pairsOf = (game, field) => game.match.players.map((i) => [i, game.match[field][i]])
function trapSendBoth(game, d) {
  for (const i of game.match.players) {
    const p = players.get(i)
    if (p) sendGame(p, 'trap', d)
  }
}
function trapTimer(game, ms, fn) {
  clearTimeout(game.timer)
  game.timer = setTimeout(fn, ms)
}
function startTrap(a, b) {
  const id = nextTrap++
  const game = { id, match: createMatch(a.index, b.index), timer: null }
  traps.set(id, game)
  forceStand(a)
  forceStand(b)
  a.trapId = b.trapId = id
  setEngaged([a.index, b.index], 'trap')
  for (const [me, peer] of [[a, b], [b, a]]) {
    sendGame(me, 'trap', { a: 'start', id, peer: peer.index, name: peer.name, rules: TRAP, placeMs: TRAP_PLACE_MS })
  }
  trapTimer(game, TRAP_PLACE_MS, () => beginTrapWalk(game))
}
function beginTrapWalk(game) {
  if (!startWalk(game.match)) return
  for (const i of game.match.players) {
    const p = players.get(i)
    // nấm mình đã cắm (kể cả phần máy cắm hộ khi hết giờ) để hiện trên đường của đối thủ
    if (p) sendGame(p, 'trap', { a: 'walk', round: 1, turnMs: TRAP_TURN_MS, mine: game.match.board[trapFoe(game.match, i)] })
  }
  trapTimer(game, TRAP_TURN_MS, () => resolveTrapRound(game))
}
function resolveTrapRound(game) {
  const res = resolveRound(game.match)
  if (!res) return
  trapSendBoth(game, {
    a: 'round',
    round: game.match.round,
    steps: res.steps.map((s) => [s.p, s.row, s.col, s.hit ? 1 : 0]),
    lives: pairsOf(game, 'lives'),
    rows: pairsOf(game, 'row'),
    ...(res.outcome ? {} : { turnMs: TRAP_REVEAL_MS + TRAP_TURN_MS }),
  })
  if (res.outcome) return finishTrap(game, res.outcome.reason, res.outcome.winner)
  trapTimer(game, TRAP_REVEAL_MS + TRAP_TURN_MS, () => resolveTrapRound(game))
}
function trapAction(p, d) {
  const game = traps.get(p.trapId)
  if (!game || !d || typeof d !== 'object') return
  const m = game.match
  const foe = trapFoe(m, p.index)
  if (d.a === 'quit') return finishTrap(game, 'quit', foe)
  if (d.a === 'place') {
    if (!trapPlace(m, p.index, d.cells)) return sendGame(p, 'trap', { a: 'placeRejected' })
    trapSendBoth(game, { a: 'ready', by: p.index })
    if (m.board[p.index] && m.board[foe]) beginTrapWalk(game) // cả hai đã giấu xong: bắt đầu luôn
    return
  }
  if (d.a === 'step') {
    if (!trapPick(m, p.index, d.col)) return
    trapSendBoth(game, { a: 'locked', by: p.index })
    if (bothPicked(m)) {
      clearTimeout(game.timer)
      resolveTrapRound(game)
    }
  }
}
function finishTrap(game, reason, winner) {
  if (!traps.delete(game.id)) return
  clearTimeout(game.timer)
  const m = game.match
  m.phase = 'ended'
  trapSendBoth(game, { a: 'end', winner, reason, lives: pairsOf(game, 'lives'), boards: m.players.map((i) => [i, m.board[i] ?? []]) })
  for (const i of m.players) {
    const p = players.get(i)
    if (p) p.trapId = null
  }
  setEngaged(m.players, null)
  // thông báo cho cả hang: người thắng + người thua (+ số mạng còn lại)
  const [a, b] = m.players
  const wIdx = winner ?? a
  const lIdx = wIdx === a ? b : a
  const wp = players.get(wIdx)
  const lp = players.get(lIdx)
  if (wp && lp) {
    const result = winner === null ? 'draw' : reason === 'quit' || reason === 'left' ? 'quit' : 'win'
    broadcastJson({ t: 'notice', kind: 'trap_result', names: [wp.name, lp.name], result, lives: [m.lives[wIdx], m.lives[lIdx]] })
  }
  log.debug('bẫy độc kết thúc', { winner: wp?.name, reason })
}
function leaveTrap(p) {
  const game = traps.get(p.trapId)
  if (!game) return
  finishTrap(game, 'left', trapFoe(game.match, p.index))
}

// ---------- gói game: rage (ném đồ) ----------
// [VERIFIED] 5 ô, 4 loại đồ, 16 biệt danh, nhãn mặc định [3,1,2,0,14]; client chỉ đọc {a:'state', labels, today}.
// [INFERRED] mọi người dùng chung nhãn; "today" là số lần ném của phiên này.
const RAGE_SLOTS = 5
const RAGE_ITEMS = 4
const RAGE_NICKS = 16
const rageLabels = [3, 1, 2, 0, 14]
function sendRage(p) {
  sendGame(p, 'rage', { a: 'state', labels: rageLabels, today: p.thrown })
}
function rageAction(p, d) {
  if (!d || typeof d !== 'object') return
  const t = now()
  if (d.a === 'label') {
    if (!Number.isInteger(d.slot) || d.slot < 0 || d.slot >= RAGE_SLOTS) return
    if (!Number.isInteger(d.nick) || d.nick < 0 || d.nick >= RAGE_NICKS) return
    if (t - p.lastLabelAt < 1000) return
    p.lastLabelAt = t
    rageLabels[d.slot] = d.nick
    for (const q of players.values()) sendRage(q)
    return
  }
  if (d.a === 'throw') {
    if (!Number.isInteger(d.slot) || d.slot < 0 || d.slot >= RAGE_SLOTS) return
    if (!Number.isInteger(d.item) || d.item < 0 || d.item >= RAGE_ITEMS) return
    if (!Number.isFinite(d.u) || !Number.isFinite(d.v) || Math.abs(d.u) > 2 || Math.abs(d.v) > 2) return
    if (t - p.lastThrowAt < 200) return
    p.lastThrowAt = t
    p.thrown += 1
    sendRage(p)
  }
}

// ---------- bình chọn ----------
const voteKey = (p) => p.tab ?? `i:${p.index}`
export function setPoll(q, options) {
  pollSeq += 1
  poll = { id: pollSeq, q, options, votes: new Map() }
  for (const p of players.values()) p.voted = null
  broadcastJson({ t: 'poll', id: poll.id, q, options })
  persist()
  return poll
}
function clearPoll() {
  // Client gốc không có thông điệp "xóa poll" nên bỏ qua `pollClosed` (thông điệp mở rộng của ta); client mới dùng nó để đóng bình chọn ngay.
  if (poll) broadcastJson({ t: 'pollClosed', id: poll.id })
  poll = null
  for (const p of players.values()) p.voted = null
  persist()
}
function handleVote(p, message) {
  if (!poll || message.poll !== poll.id || p.voted !== null) return
  if (!Number.isInteger(message.option) || message.option < 0 || message.option >= poll.options.length) return
  p.voted = message.option
  poll.votes.set(voteKey(p), message.option)
  persist()
}

// ---------- board / thông báo hệ thống ----------
function setBoard(videos, music) {
  board = { videos, music }
  broadcastJson({ t: 'board', videos, music })
  persist()
}
const humansOpen = () => [...players.values()].filter((p) => open(p)).length
function broadcastSys(text) {
  broadcastJson({ t: 'sys', text })
  return humansOpen()
}
function broadcastNotice(notice) {
  broadcastJson(notice)
  return humansOpen()
}

// ---------- ban / kick ----------
function activeBan(key) {
  const ban = bans.get(key)
  if (!ban) return null
  if (ban.until <= now()) {
    bans.delete(key)
    persist()
    return null
  }
  return ban
}
const isBanned = (tab, ip) => (tab ? activeBan(`tab:${tab}`) : null) ?? (ip ? activeBan(`ip:${ip}`) : null)
function addBan(kind, value, minutes, reason) {
  const key = `${kind}:${value}`
  bans.set(key, { key, kind, value, until: now() + minutes * 60_000, reason, createdAt: now() })
  persist()
  return key
}
function listBans() {
  for (const key of [...bans.keys()]) activeBan(key) // dọn các ban hết hạn
  return [...bans.values()].map((b) => ({ ...b, remainingMin: Math.max(0, Math.ceil((b.until - now()) / 60_000)) }))
}
function removeBan(key) {
  const had = bans.delete(key)
  if (had) persist()
  return had
}
setInterval(() => listBans(), 60_000).unref()
let rankWeek = weekStart(Date.now(), WEEK_OFFSET_HOURS)
setInterval(() => {
  if (accounts.prune() > 0 || ladder.prune() > 0) persist()
  // sang tuần mới (thứ Hai 00:00 giờ Việt Nam): bảng làm mới, báo cho người đang trong hang
  const week = weekStart(Date.now(), WEEK_OFFSET_HOURS)
  if (week !== rankWeek) {
    rankWeek = week
    broadcastRank()
  }
  meLimiter.sweep()
  quizLimiter.sweep()
}, RANK_CHECK_MS).unref()

function kickPlayers({ index, tab, name, banMinutes, scope, reason }) {
  const targets = [...players.values()].filter(
    (p) => !p.bot && ((index !== undefined && p.index === index) || (tab !== undefined && p.tab === tab) || (name !== undefined && p.name === name)),
  )
  let added = 0
  for (const p of targets) {
    const sock = p.ws
    if (banMinutes > 0) {
      if ((scope === 'tab' || scope === 'both') && p.tab) {
        addBan('tab', p.tab, banMinutes, reason)
        added += 1
      }
      if ((scope === 'ip' || scope === 'both') && p.ip) {
        addBan('ip', p.ip, banMinutes, reason)
        added += 1
      }
    }
    if (sock) {
      sock.player = null // để sự kiện đóng của socket này không giữ chỗ cho người đã bị đuổi
      sendJson(p, { t: 'rejected', reason: banMinutes > 0 ? 'banned' : 'kicked' })
    }
    removePlayer(p, 'kicked')
    sock?.close(4001, 'kicked')
  }
  // cấm trước một tab id chưa/không còn trong phòng
  if (targets.length === 0 && banMinutes > 0 && tab !== undefined && scope !== 'ip') {
    addBan('tab', tab, banMinutes, reason)
    added += 1
  }
  return { kicked: targets.length, bans: added }
}

// ---------- lưu bền vững ----------
const store = createStore({
  dir: DATA_DIR,
  log,
  getState: () => ({
    ladder: ladder.export(),
    bans: [...bans.values()],
    pollSeq,
    poll: poll ? { id: poll.id, q: poll.q, options: poll.options, votes: [...poll.votes.entries()] } : null,
    board,
    accounts: accounts.export(),
  }),
})
const persist = () => store.schedule()

function loadState() {
  const data = store.load()
  if (!data) return
  try {
    accounts.import(data.accounts)
    ladder.import(data.ladder)
    if (Array.isArray(data.bans)) {
      for (const b of data.bans) {
        if (b && (b.kind === 'tab' || b.kind === 'ip') && typeof b.value === 'string' && Number.isFinite(b.until) && b.until > now()) {
          const key = `${b.kind}:${b.value}`
          bans.set(key, { key, kind: b.kind, value: b.value, until: b.until, reason: typeof b.reason === 'string' ? b.reason : '', createdAt: Number(b.createdAt) || now() })
        }
      }
    }
    if (Number.isInteger(data.pollSeq) && data.pollSeq >= 0) pollSeq = data.pollSeq
    const saved = data.poll
    if (saved && Number.isInteger(saved.id)) {
      const parsed = cleanPoll(saved)
      if (!parsed.error) {
        poll = { id: saved.id, q: parsed.q, options: parsed.options, votes: new Map() }
        for (const row of Array.isArray(saved.votes) ? saved.votes : []) {
          if (Array.isArray(row) && typeof row[0] === 'string' && Number.isInteger(row[1]) && row[1] >= 0 && row[1] < poll.options.length) poll.votes.set(row[0], row[1])
        }
        pollSeq = Math.max(pollSeq, poll.id)
      }
    }
    if (data.board) board = { videos: normalizeIds(data.board.videos).ids, music: normalizeIds(data.board.music).ids }
    log.info('đã nạp trạng thái', { wins: ladder.size, bans: bans.size, poll: poll?.id ?? null, videos: board.videos.length, music: board.music.length })
  } catch (error) {
    log.error('trạng thái đã lưu không dùng được một phần', { error: String(error.message ?? error) })
  }
}

// ---------- trạng thái cho quản trị ----------
function adminStatus({ gc }) {
  if (gc && typeof globalThis.gc === 'function') globalThis.gc()
  const mem = process.memoryUsage()
  const mb = (v) => Math.round((v / 1048576) * 10) / 10
  const all = [...players.values()]
  const humans = all.filter((p) => !p.bot).length
  let seenEntries = 0
  for (const p of all) seenEntries += p.seen.size
  const counts = poll ? poll.options.map((_, i) => [...poll.votes.values()].filter((v) => v === i).length) : null
  return {
    uptimeSec: Math.round(process.uptime()),
    draining,
    capacity: CAPACITY,
    players: { total: all.length, humans, bots: all.length - humans },
    waiting: queue.length,
    memory: { rssMB: mb(mem.rss), heapUsedMB: mb(mem.heapUsed), heapTotalMB: mb(mem.heapTotal), externalMB: mb(mem.external), arrayBuffersMB: mb(mem.arrayBuffers) },
    gcExposed: typeof globalThis.gc === 'function',
    structures: {
      byTab: byTab.size, invites: invites.size, talks: talks.size, duels: duels.size, wins: ladder.size, bans: bans.size,
      ipConnections: ipConnections.size, ipAttempts: ipAttempts.size, seenEntries,
    },
    connectionsByIp: [...ipConnections.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    poll: poll ? { id: poll.id, q: poll.q, options: poll.options, counts } : null,
    board: { videos: board.videos.length, music: board.music.length },
    persistence: { enabled: store.enabled, dir: DATA_DIR },
  }
}

// ---------- di chuyển ----------
/** Đánh dấu người chơi vừa thay đổi vị trí/hướng. Người gửi còn "hoạt động" đủ lâu để cả người ở tầng xa nhận được bản mới nhất. */
function markMoved(p) {
  p.dirty = true
  p.moveSeq += 1
  p.activeUntil = moveRound + FAR_EVERY
}

/** Phát bản ghi vị trí theo tầng khoảng cách. Mỗi người nhận chỉ nhận bản ghi mới (moveSeq) và không quá thường xuyên. */
function sendMovesTiered() {
  moveRound += 1
  const active = []
  for (const p of players.values()) if (p.activeUntil >= moveRound) active.push(p)
  if (active.length === 0) return
  const near2 = NEAR_R * NEAR_R
  const mid2 = MID_R * MID_R
  for (const r of players.values()) {
    if (!open(r)) continue
    let list = null
    for (const s of active) {
      if (s === r) continue
      const seen = r.seen.get(s.index)
      if (seen !== undefined && seen[0] === s.moveSeq) continue
      const dx = s.x - r.x
      const dz = s.z - r.z
      const d2 = dx * dx + dz * dz
      const every = d2 <= near2 ? 1 : d2 <= mid2 ? MID_EVERY : FAR_EVERY
      if (seen !== undefined && moveRound - seen[1] < every) continue
      if (seen === undefined) r.seen.set(s.index, [s.moveSeq, moveRound])
      else {
        seen[0] = s.moveSeq
        seen[1] = moveRound
      }
      if (list === null) list = []
      list.push(s)
    }
    if (list !== null) r.ws.send(packMoves(list))
  }
}

/**
 * Vị trí báo lên có nằm trong vật cản (ghế, hình nộm, đống lửa, sân khấu) không? Chạy đúng hàm va chạm của client (shared/world.mjs):
 * client đã tự đẩy mình ra khỏi vật cản nên vị trí hợp lệ gần như không đổi; lệch quá dung sai nghĩa là đi xuyên vật cản.
 * Dung sai 0,2 m bù sai số làm tròn khi gửi (1/256 m) và khác biệt nhỏ giữa hai lần giải va chạm.
 */
const OBSTACLE_TOLERANCE = 0.2
function insideObstacle(x, z) {
  const fixed = { x, z }
  resolveCollisions(fixed)
  return Math.hypot(fixed.x - x, fixed.z - z) > OBSTACLE_TOLERANCE
}

// ---------- ngồi ghế hội trường ----------
// [Inference] bản gốc có ghế hội trường (mỗi ghế một người) nhưng cách báo trạng thái ngồi không nằm trong capture; đây là giao thức tự đặt:
//   client → {t:'sit', bench} / {t:'stand'}; server → mọi người {t:'seat', i, b} (b = −1: đứng dậy); người mới vào nhận {t:'seats', on:[[i, b]...]}.
const SEAT_REACH = 2.4 // client cho ngồi khi cách ≤ 1,6 m; dư để bù độ trễ
const seatTaken = (bench, except) => [...players.values()].some((q) => q !== except && q.seat === bench)
function setPosition(p, x, z, heading) {
  p.x = x
  p.z = z
  p.heading = headingByte(heading)
  p.dir = 0
  markMoved(p)
  if (p.ws && p.ws.readyState === 1) send(p, packCorrection(x, z)) // ép client về đúng chỗ server đã đặt
}
function handleSit(p, message) {
  const deny = () => sendJson(p, { t: 'seatDenied' })
  const bench = message.bench
  if (!Number.isInteger(bench) || bench < 0 || bench >= SEATS.length) return deny()
  if (p.seat !== null || p.talkId != null || p.duelId != null) return deny()
  const seat = SEATS[bench]
  if (Math.hypot(seat.x - p.x, seat.z - p.z) > SEAT_REACH) return deny()
  if (seatTaken(bench, p)) return deny()
  p.seat = bench
  setPosition(p, seat.x, seat.z, seat.heading) // hội trường: mặt về màn hình (−z); phòng chờ: mặt về phía bàn
  broadcastJson({ t: 'seat', i: p.index, b: bench })
}
function standUp(p) {
  if (p.seat === null) return
  const seat = SEATS[p.seat]
  p.seat = null
  setPosition(p, seat.exit.x, seat.exit.z, seat.heading)
  broadcastJson({ t: 'seat', i: p.index, b: -1 })
}
const handleStand = (p) => standUp(p)

// ---------- đổi trang phục ngay trong hang ----------
// [Inference] giao thức tự đặt: client → {t:'look', look}; server chuẩn hoá mã, lưu vào hồ sơ và báo cả hang {t:'look', i, k}. Không đổi được khi đang đấu võ.
const LOOK_COOLDOWN_MS = 1500
function handleLook(p, message) {
  const t = now()
  if (p.duelId != null || t - (p.lastLookAt ?? 0) < LOOK_COOLDOWN_MS) return
  const look = normalizeLookCode(message.look)
  if (look === p.look) return
  p.lastLookAt = t
  p.look = look
  if (p.sid) {
    accounts.save(p.sid, { name: p.name, number: p.number, look })
    persist()
  }
  broadcastJson({ t: 'look', i: p.index, k: look })
}

// ---------- cửa vào khu đặc biệt (sân thi đấu, phòng chờ) ----------
// [Inference] giao thức tự đặt: client → {t:'gate', id}; server kiểm tra người chơi đang đứng gần một đầu của cửa đó (≤ GATE_REACH) rồi đặt sang đầu kia
// (ép client bằng correction như khi ngồi). Khu có tường/vành chặn nên không đi bộ vào được; cửa là đường vào duy nhất.
const GATE_REACH = GATE_RANGE + 0.8 // client cho bấm khi cách ≤ GATE_RANGE; dư để bù độ trễ
function handleGate(p, message) {
  const deny = () => sendJson(p, { t: 'gateDenied' })
  const gate = GATES.find((g) => g.id === message.id)
  if (!gate || p.seat !== null || p.talkId != null || p.duelId != null) return deny()
  const at = (end) => Math.hypot(end.x - p.x, end.z - p.z)
  const target = at(gate.outside) <= GATE_REACH && at(gate.outside) <= at(gate.inside) ? gate.inside : at(gate.inside) <= GATE_REACH ? gate.outside : null
  if (!target) return deny()
  setPosition(p, target.x, target.z, target.heading)
}
const forceStand = standUp

function handleMove(p, view) {
  const t = now()
  const x = unscale(view.getInt16(1, true))
  const z = unscale(view.getInt16(3, true))
  const dt = Math.max(0.05, (t - p.lastMoveAt) / 1000)
  p.lastMoveAt = t
  if (p.talkId != null || p.duelId != null || p.seat !== null) return // đang chat riêng / đấu võ / ngồi thì vị trí do server giữ
  const dist = Math.hypot(x - p.x, z - p.z)
  const tooFar = Math.hypot(x, z) > WALK_RADIUS + 0.5 || dist > MAX_SPEED * dt + 1 || insideObstacle(x, z)
  if (tooFar) {
    if (t - p.lastCorrectionAt > 250) {
      p.lastCorrectionAt = t
      send(p, packCorrection(p.x, p.z))
    }
    return
  }
  p.x = x
  p.z = z
  p.heading = view.getUint8(5)
  p.dir = view.getUint8(6)
  markMoved(p)
}

// ---------- bot ----------
/** Điểm đến ngẫu nhiên của bot: chỉ chọn chỗ trống (không nằm trong ghế hội trường, bục thi đấu, sân khấu...). */
function wanderGoal() {
  let point = { x: 0, z: 20 }
  for (let tries = 0; tries < 40; tries += 1) {
    const angle = Math.random() * Math.PI * 2
    const radius = 13 + Math.random() * 27
    point = { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius }
    const fixed = { ...point }
    resolveCollisions(fixed)
    if (Math.hypot(fixed.x - point.x, fixed.z - point.z) < 1e-6) break
  }
  return point
}
for (const [name, number] of BOT_NAMES.slice(0, BOT_COUNT)) {
  const spot = wanderGoal()
  const goal = wanderGoal()
  addPlayer({ name, number, look: encodeLook(randomLook()), bot: true, x: spot.x, z: spot.z, goalX: goal.x, goalZ: goal.z, wait: Math.random() * 2 })
}
// Bot đi bằng ĐÚNG hàm mô phỏng mà client dùng để dự đoán người khác (shared/world.mjs): cùng gia tốc, cùng va chạm, cùng hướng đã
// lượng tử hoá. Nếu server cho bot đi một kiểu còn client dự đoán một kiểu khác thì mỗi bản ghi vị trí là một lần "kéo" lại (giật).
const BOT_MAG = 3 // độ lớn dir (0–7): đi bộ chậm, tốc độ = MOVE_SPEED × 3/7 ≈ 3,4
const BOT_KEEPALIVE_TICKS = 15
const BOT_STUCK_SECONDS = 2.5 // không tiến gần được điểm đến trong chừng này thì đổi điểm đến (ghế/hình nộm chặn đường)
function stepBots(dt) {
  for (const bot of players.values()) {
    if (!bot.bot) continue
    bot.body ??= makeBody(bot.x, bot.z, Math.PI)
    const body = bot.body
    let input = { mx: 0, mz: 0 }
    let steps = null
    if (bot.wait > 0) bot.wait -= dt
    else {
      const dx = bot.goalX - body.x
      const dz = bot.goalZ - body.z
      const distance = Math.hypot(dx, dz)
      if (distance < 1.2) {
        const next = wanderGoal()
        bot.goalX = next.x
        bot.goalZ = next.z
        bot.wait = 1 + Math.random() * 3
        bot.bestDistance = Infinity
      } else {
        steps = ((Math.round((Math.atan2(dx, dz) / (Math.PI * 2)) * 32) % 32) + 32) % 32
        const angle = (steps / 32) * Math.PI * 2
        input = { mx: Math.sin(angle) * (BOT_MAG / 7), mz: Math.cos(angle) * (BOT_MAG / 7) }
        if (distance < (bot.bestDistance ?? Infinity) - 0.2) {
          bot.bestDistance = distance
          bot.stuckFor = 0
        } else if ((bot.stuckFor = (bot.stuckFor ?? 0) + dt) > BOT_STUCK_SECONDS) {
          const next = wanderGoal()
          bot.goalX = next.x
          bot.goalZ = next.z
          bot.bestDistance = Infinity
          bot.stuckFor = 0
        }
      }
    }
    stepBody(body, input, dt)
    bot.x = body.x
    bot.z = body.z
    const moving = body.vx !== 0 || body.vz !== 0
    const dir = steps === null ? 0 : (BOT_MAG << 5) | steps
    bot.heading = headingByte(body.heading)
    bot.sinceSend = (bot.sinceSend ?? 0) + 1
    // chỉ báo khi đổi hướng/dừng, hoặc định kỳ khi đang đi (người thật cũng vậy: KEEPALIVE)
    if (dir !== bot.dir || (moving && bot.sinceSend >= BOT_KEEPALIVE_TICKS) || (!moving && bot.dir !== 0 && dir === 0)) {
      bot.dir = dir
      bot.sinceSend = 0
      markMoved(bot)
    } else if (!moving && bot.settled !== true) {
      bot.settled = true
      markMoved(bot) // vị trí cuối sau khi dừng hẳn
    }
    if (moving) bot.settled = false
  }
}

// ---------- vòng lặp tick ----------
setInterval(() => {
  serverTick = (serverTick + 1) & 0xffffffff
  stepBots(1 / TICK_HZ)
  if (serverTick % 3 === 0) {
    if (INTEREST) sendMovesTiered()
    else {
      const moving = [...players.values()].filter((p) => p.dirty)
      if (moving.length > 0) {
        const packet = packMoves(moving)
        for (const p of moving) p.dirty = false
        broadcast(packet)
      }
    }
  }
  if (pendingChat.length > 0) {
    const rows = pendingChat
    pendingChat = []
    for (const target of players.values()) {
      const mine = rows.filter(([, , from]) => from !== target).map(([i, text]) => [i, text])
      if (mine.length > 0) sendJson(target, { t: 'chat', m: mine })
    }
  }
}, 1000 / TICK_HZ)
setInterval(() => (chatThisSecond = 0), 1000)
setInterval(() => {
  // [INFERRED] gộp thông báo "vào hang" theo cửa sổ vài giây: tối đa 2 tên + số còn lại.
  if (pendingJoinNames.length === 0) return
  const names = pendingJoinNames.slice(0, 2)
  const more = pendingJoinNames.length - names.length
  pendingJoinNames = []
  broadcastJson({ t: 'notice', kind: 'room_join', names, more })
}, NOTICE_WINDOW_MS)

// ---------- HTTP (API + tĩnh) ----------
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
  '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
}
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS })
  res.end(JSON.stringify(body))
}
const admin = ADMIN_TOKEN
  ? createAdmin({
      token: ADMIN_TOKEN,
      log,
      clientIp: (req) => clientIp(req),
      maxFails: Number(process.env.ADMIN_MAX_FAILS || 5),
      lockMs: Number(process.env.ADMIN_LOCK_MS || 900_000),
      ratePerMin: Number(process.env.ADMIN_RATE_PER_MIN || 60),
      actions: { status: adminStatus, setPoll, clearPoll, setBoard, broadcastSys, broadcastNotice, kick: kickPlayers, listBans, removeBan },
    })
  : null
/** Đọc thân JSON nhỏ (tối đa `limit` byte); lỗi thì trả null. */
function readJsonBody(req, limit = 1024) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        resolve(null)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}
const isSecure = (req) => !!req.socket.encrypted || (TRUST_PROXY && String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https')
/** Giới hạn số lần gọi theo IP trong cửa sổ 60 giây. */
function makeLimiter(limit) {
  const attempts = new Map() // ip -> mốc thời gian
  return {
    hit(ip) {
      const t = Date.now()
      const list = (attempts.get(ip) ?? []).filter((at) => t - at < 60_000)
      list.push(t)
      attempts.set(ip, list)
      return list.length > limit
    },
    sweep() {
      const t = Date.now()
      for (const [ip, list] of attempts) if (list.every((at) => t - at >= 60_000)) attempts.delete(ip)
    },
  }
}
const meLimiter = makeLimiter(20)
const quizLimiter = makeLimiter(Number(process.env.QUIZ_RATE_PER_MIN || 120))
const meRateExceeded = (ip) => meLimiter.hit(ip)

/** POST /api/quiz/answer {questionId, answerId} → {correct, correctAnswerId}. */
async function handleQuizAnswer(req, res) {
  if (ORIGIN_CHECK && !originAllowed(req)) return json(res, 403, { error: 'forbidden' })
  if (quizLimiter.hit(clientIp(req))) return json(res, 429, { error: 'Thử lại sau ít phút.' })
  const body = await readJsonBody(req)
  const graded = gradeAnswer(body?.questionId, body?.answerId)
  if (!graded) return json(res, 400, { error: 'Câu hỏi hoặc đáp án không hợp lệ.' })
  return json(res, 200, graded)
}

/** GET /api/me: hồ sơ đã lưu cho cookie hm_sid (hoặc null). POST /api/me {name, number}: lưu hồ sơ, cấp cookie nếu chưa có. */
async function handleMe(req, res) {
  const sid = sidFromCookieHeader(req.headers.cookie)
  if (req.method === 'GET') return json(res, 200, sid ? accounts.get(sid) : null)
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
  if (ORIGIN_CHECK && !originAllowed(req)) return json(res, 403, { error: 'forbidden' })
  if (meRateExceeded(clientIp(req))) return json(res, 429, { error: 'Thử lại sau ít phút.' })
  const body = await readJsonBody(req)
  const profile = validateProfile(body, sanitize)
  if ('error' in profile) return json(res, 400, { error: profile.error })
  const id = sid ?? newSid()
  accounts.save(id, profile)
  persist()
  res.setHeader('set-cookie', sidCookie(id, { secure: isSecure(req) }))
  return json(res, 200, profile)
}

const httpServer = http.createServer((req, res) => {
  // Một yêu cầu HTTP hỏng không được phép làm sập cả phòng: mọi ngoại lệ trong bộ xử lý → 400/500 cho riêng yêu cầu đó.
  try {
    handleHttp(req, res)
  } catch (error) {
    log.error('http: lỗi không mong đợi', { error: String(error?.message ?? error), url: String(req.url ?? '').slice(0, 100) })
    if (!res.headersSent) {
      res.writeHead(error instanceof URIError ? 400 : 500, { 'content-type': 'text/plain; charset=utf-8' })
    }
    res.end()
  }
})
function handleHttp(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  if (url.pathname === '/healthz') return json(res, 200, { ok: true, uptime: Math.round(process.uptime()), players: inRoomCount() })
  if (url.pathname === '/readyz') return draining ? json(res, 503, { ready: false }) : json(res, 200, { ready: true, players: inRoomCount() })
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    if (!admin) return json(res, 404, { error: 'not-found' })
    admin.handle(req, res, url).catch((error) => {
      log.error('admin: lỗi không mong đợi', { error: String(error?.message ?? error) })
      if (!res.headersSent) json(res, 500, { error: 'lỗi máy chủ' })
    })
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/room/status') {
    return json(res, 200, { inRoom: inRoomCount(), capacity: CAPACITY, waiting: queue.length })
  }
  if (url.pathname === '/api/me') return handleMe(req, res)
  if (url.pathname === '/api/quiz' && req.method === 'GET') {
    if (quizLimiter.hit(clientIp(req))) return json(res, 429, { error: 'Thử lại sau ít phút.' })
    return json(res, 200, { questions: publicQuestions() })
  }
  if (url.pathname === '/api/quiz/answer' && req.method === 'POST') return handleQuizAnswer(req, res)
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not-implemented' })
  if (!STATIC_DIR || !fs.existsSync(STATIC_DIR)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    return res.end('no static dir')
  }
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '')
  let file = path.resolve(STATIC_DIR, rel)
  if (!file.startsWith(STATIC_DIR + path.sep)) {
    res.writeHead(403)
    return res.end()
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (path.extname(rel)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end('not found')
    }
    file = path.join(STATIC_DIR, 'index.html')
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', ...SECURITY_HEADERS })
  const stream = fs.createReadStream(file)
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

// ---------- WebSocket ----------
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD })
const ipConnections = new Map() // ip -> số kết nối đang mở
const ipAttempts = new Map() // ip -> mốc thời gian các lần kết nối gần đây (cửa sổ 60 giây)

function clientIp(req) {
  let ip = req.socket.remoteAddress ?? 'unknown'
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim()
    if (forwarded) ip = forwarded
  }
  return ip.replace(/^::ffff:/, '')
}

/** Chỉ chấp nhận trình duyệt từ cùng nguồn (Origin trùng Host) hoặc nguồn trong ALLOWED_ORIGINS. Không có Origin (client không phải trình duyệt) thì cho qua. */
function originAllowed(req) {
  const origin = req.headers.origin
  if (!origin) return true
  if (ALLOWED_ORIGINS.includes(origin)) return true
  try {
    const host = (TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function connectionRateExceeded(ip) {
  if (CONN_RATE_PER_MIN <= 0) return false
  const t = Date.now()
  const recent = (ipAttempts.get(ip) ?? []).filter((at) => t - at < 60_000)
  recent.push(t)
  ipAttempts.set(ip, recent)
  return recent.length > CONN_RATE_PER_MIN
}
setInterval(() => {
  const t = Date.now()
  for (const [ip, list] of ipAttempts) if (list.every((at) => t - at >= 60_000)) ipAttempts.delete(ip)
}, 60_000).unref()

httpServer.on('upgrade', (req, socket, head) => {
  // Lỗi mạng trên socket thô (reset, đứt giữa chừng) không được phép làm sập tiến trình.
  socket.on('error', () => {})
  const reject = (status, text) => {
    // end() gửi hết phản hồi rồi mới đóng; write() + destroy() có thể làm mất phản hồi và client chỉ thấy "connection reset".
    socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  }
  if (new URL(req.url || '/', 'http://x').pathname !== '/ws') return socket.destroy()
  if (draining) return reject(503, 'Service Unavailable')
  if (ORIGIN_CHECK && !originAllowed(req)) {
    log.info('kết nối bị từ chối: Origin lạ', { ip: clientIp(req), origin: String(req.headers.origin ?? '').slice(0, 100) })
    return reject(403, 'Forbidden')
  }
  const ip = clientIp(req)
  if (connectionRateExceeded(ip)) {
    log.info('kết nối bị từ chối: quá nhiều kết nối mới', { ip })
    return reject(429, 'Too Many Requests')
  }
  if (MAX_CONN_PER_IP > 0 && (ipConnections.get(ip) ?? 0) >= MAX_CONN_PER_IP) {
    log.info('kết nối bị từ chối: quá số kết nối mỗi IP', { ip, limit: MAX_CONN_PER_IP })
    return reject(429, 'Too Many Requests')
  }
  // mọi kết nối đều có mã người dùng: cookie cũ nếu hợp lệ, không thì cấp mới ngay trong phản hồi bắt tay
  req.hmSid = sidFromCookieHeader(req.headers.cookie)
  req.hmNewSid = req.hmSid ? null : newSid()
  req.hmSecure = isSecure(req)
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.ip = ip
    ws.sid = req.hmSid ?? req.hmNewSid
    ipConnections.set(ip, (ipConnections.get(ip) ?? 0) + 1)
    ws.once('close', () => {
      const left = (ipConnections.get(ip) ?? 1) - 1
      if (left <= 0) ipConnections.delete(ip)
      else ipConnections.set(ip, left)
    })
    wss.emit('connection', ws, req)
  })
})

/** Thùng token cho từng loại gói; hết token thì bỏ gói, bỏ quá nhiều trong 10 giây thì đóng kết nối. */
function allowMessage(ws, binary) {
  const t = Date.now()
  const bucket = binary ? ws.binBucket : ws.msgBucket
  bucket.tokens = Math.min(bucket.burst, bucket.tokens + ((t - bucket.at) / 1000) * bucket.rate)
  bucket.at = t
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return true
  }
  if (t - ws.dropSince > 10_000) {
    ws.dropSince = t
    ws.drops = 0
  }
  ws.drops += 1
  if (ws.drops > ABUSE_DROPS && ws.readyState === 1) {
    log.info('kết nối bị đóng: gửi quá nhanh', { ip: ws.ip, kind: binary ? 'binary' : 'json' })
    ws.close(1008, 'rate limit')
  }
  return false
}

// Heartbeat: dọn kết nối chết (mạng đứt nửa chừng) thay vì để chúng giữ chỗ tới khi TCP tự hết hạn.
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, HEARTBEAT_MS).unref()

function handleEnter(ws, message) {
  const name = typeof message.name === 'string' ? message.name.trim() : ''
  if (Array.from(name).length < 1 || Array.from(name).length > 30) {
    ws.send(JSON.stringify({ t: 'rejected', reason: 'invalid_name' }))
    return ws.close()
  }
  const number = Number.isInteger(message.number) && message.number >= 1 && message.number <= 99 ? message.number : null
  const look = normalizeLookCode(message.look) // mã ngoại hình (shared/look.mjs); thiếu/sai → mặc định
  const tab = typeof message.tab === 'string' && message.tab.length > 0 ? message.tab.slice(0, 40) : null
  const ban = isBanned(tab, ws.ip)
  if (ban) {
    log.info('vào hang bị chặn: đang bị ban', { ip: ws.ip, key: ban.key })
    ws.send(JSON.stringify({ t: 'rejected', reason: 'banned' }))
    return ws.close()
  }

  accounts.save(ws.sid, { name, number, look }) // lưu tên + số áo mới nhất, gia hạn 14 ngày kể từ lần vào hang này
  persist()
  // [INFERRED] cùng tab id: nếu người cũ đang giữ chỗ (mất mạng) thì nối lại; nếu còn kết nối thì đá người cũ.
  const existing = tab ? byTab.get(tab) : null
  if (existing) {
    const stale = existing.ws
    const wasDropped = !open(existing)
    if (!wasDropped && stale) {
      stale.player = null
      sendJson(existing, { t: 'replaced' })
      stale.close()
    }
    clearTimeout(existing.graceTimer)
    existing.ws = ws
    existing.name = name
    existing.number = number
    existing.look = look
    existing.ip = ws.ip
    existing.sid = ws.sid
    existing.resumed = wasDropped
    ws.player = existing
    if (!wasDropped) {
      existing.x = SPAWN.x
      existing.z = SPAWN.z
    }
    admit(existing)
    return
  }

  const pending = { name, number, look, tab, ip: ws.ip, sid: ws.sid }
  if (inRoomCount() >= CAPACITY) {
    if (queue.length >= QUEUE_MAX) {
      ws.send(JSON.stringify({ t: 'rejected', reason: 'full' }))
      return ws.close()
    }
    const waiting = { ws, pending, queued: true }
    ws.queued = waiting
    queue.push(waiting)
    sendJson(waiting, { t: 'queued', position: queue.length, inRoom: inRoomCount(), waiting: queue.length })
    return
  }
  const p = addPlayer({ name, number, look, ws, tab, ip: ws.ip, sid: ws.sid })
  log.debug('vào hang', { index: p.index, ip: ws.ip, name })
  ws.player = p
  if (tab) byTab.set(tab, p)
  admit(p)
}

wss.on('headers', (headers, req) => {
  if (req.hmNewSid) headers.push(`Set-Cookie: ${sidCookie(req.hmNewSid, { secure: req.hmSecure })}`)
})
wss.on('connection', (ws) => {
  ws.player = null
  ws.queued = null
  ws.isAlive = true
  ws.drops = 0
  ws.dropSince = Date.now()
  ws.msgBucket = { tokens: MSG_BURST, burst: MSG_BURST, rate: MSG_RATE, at: Date.now() }
  ws.binBucket = { tokens: BIN_BURST, burst: BIN_BURST, rate: BIN_RATE, at: Date.now() }
  ws.enterTimer = setTimeout(() => {
    if (!ws.player && !ws.queued) ws.close(4000, 'enter timeout')
  }, ENTER_TIMEOUT_MS)
  // `ws` phát 'error' khi gói vượt maxPayload hoặc khung sai định dạng (rồi tự đóng kết nối). Không có trình xử lý thì
  // Node dừng cả tiến trình: một gói hỏng của một client sẽ làm sập toàn bộ phòng.
  ws.on('error', () => {})
  ws.on('pong', () => (ws.isAlive = true))
  ws.on('message', (data, isBinary) => {
    ws.isAlive = true
    if (!allowMessage(ws, isBinary)) return
    if (!isBinary) {
      let message
      try {
        message = JSON.parse(data.toString())
      } catch {
        return
      }
      if (!message || typeof message !== 'object') return
      if (message.t === 'enter' && !ws.player && !ws.queued) {
        handleEnter(ws, message)
        if (ws.player || ws.queued) clearTimeout(ws.enterTimer)
        return
      }
      if (message.t === 'leave') {
        if (ws.queued) queue.splice(queue.indexOf(ws.queued), 1)
        const p = ws.player
        ws.player = null
        if (p) removePlayer(p)
        return ws.close()
      }
      const p = ws.player
      if (!p) return
      switch (message.t) {
        case 'chat': return handleChat(p, message)
        case 'punch': return handlePunch(p, message)
        case 'emote': return handleEmote(p)
        case 'swing': return handleSwing(p)
        case 'sit': return handleSit(p, message)
        case 'stand': return handleStand(p)
        case 'gate': return handleGate(p, message)
        case 'look': return handleLook(p, message)
        case 'vote': return handleVote(p, message)
        case 'inviteAsk': return handleInviteAsk(p, message)
        case 'inviteAnswer': return handleInviteAnswer(p, message)
        case 'inviteCancel': {
          const inv = invites.get(p.asking)
          if (inv) cancelInvite(inv, true)
          return
        }
        case 'talkEnd':
          if (p.talkId != null) closeTalk(p.talkId, p.index, 'end')
          return
        case 'dm': return handleDm(p, message)
        case 'game':
          if (message.g === 'duel') duelAction(p, message.d)
          else if (message.g === 'rage') rageAction(p, message.d)
          else if (message.g === 'trap') trapAction(p, message.d)
          return
        default: return
      }
    }
    const p = ws.player
    if (data.length < 1) return
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const op = view.getUint8(0)
    if (op === OP.PING && data.length >= 5) return ws.send(packPong(view.getUint32(1, true)))
    if (op === OP.MOVE && p && data.length >= 9) handleMove(p, view)
  })
  ws.on('close', () => {
    clearTimeout(ws.enterTimer)
    if (ws.queued) {
      const i = queue.indexOf(ws.queued)
      if (i >= 0) queue.splice(i, 1)
      return admitFromQueue()
    }
    const p = ws.player
    if (!p || p.ws !== ws) return
    // [INFERRED] giữ chỗ để client kết nối lại (client có cửa sổ ~25s).
    p.ws = null
    cancelInvitesOf(p, 'gone')
    if (p.duelId != null) leaveDuel(p)
    if (p.trapId != null) leaveTrap(p)
    p.graceTimer = setTimeout(() => removePlayer(p), RESUME_GRACE_MS)
  })
})

// Chạy dưới tiến trình khác (bộ test, script): tự thoát khi tiến trình cha biến mất để không để lại server mồ côi.
// Đặt EXIT_WITH_PARENT=1; khi cha chết, hệ điều hành gắn tiến trình này vào tiến trình khác nên ppid đổi.
if (process.env.EXIT_WITH_PARENT === '1') {
  const parent = process.ppid
  setInterval(() => {
    if (process.ppid !== parent) process.exit(0)
  }, 1000).unref()
}

// ---------- tắt êm ----------
function shutdown(reason, exitCode = 0) {
  if (draining) return
  draining = true
  log.info('tắt êm: bắt đầu', { reason, players: players.size })
  const hardStop = setTimeout(() => {
    log.error('tắt êm: quá hạn, thoát cưỡng bức', { afterMs: SHUTDOWN_MS })
    store.flush()
    process.exit(exitCode || 1)
  }, SHUTDOWN_MS)
  hardStop.unref()
  const proceed = () => {
    httpServer.close() // ngừng nhận kết nối mới
    httpServer.closeIdleConnections?.()
    broadcastJson({ t: 'sys', text: 'Máy chủ đang khởi động lại, bạn sẽ được nối lại sau ít giây.' })
    for (const ws of wss.clients) ws.close(1001, 'server restarting')
    store.flush()
    const started = Date.now()
    const waiter = setInterval(() => {
      // thoát khi mọi socket đã đóng, hoặc sau tối đa 1,5 giây (client treo không được giữ server)
      if (wss.clients.size === 0 || Date.now() - started > 1500) {
        clearInterval(waiter)
        store.flush()
        httpServer.closeAllConnections?.()
        log.info('tắt êm: xong')
        process.exit(exitCode)
      }
    }, 20)
  }
  // Trong thời gian "xả" (DRAIN_GRACE_MS): /readyz = 503 và kết nối WebSocket mới bị từ chối 503, nhưng /healthz vẫn 200 và cổng còn mở.
  if (DRAIN_GRACE_MS > 0) setTimeout(proceed, Math.min(DRAIN_GRACE_MS, SHUTDOWN_MS - 1000)).unref?.()
  else proceed()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('uncaughtException', (error) => {
  log.error('uncaughtException', { error: String(error?.stack ?? error) })
  store.flush()
  process.exit(1)
})
process.on('unhandledRejection', (error) => {
  log.error('unhandledRejection', { error: String(error instanceof Error ? error.stack : error) })
  store.flush()
  process.exit(1)
})

loadState()
httpServer.listen(PORT, () => {
  log.info(`hangmu room http+ws://127.0.0.1:${PORT}`, {
    port: PORT, static: fs.existsSync(STATIC_DIR) ? STATIC_DIR : null, capacity: CAPACITY, bots: BOT_COUNT,
    persistence: store.enabled ? DATA_DIR : null, admin: Boolean(ADMIN_TOKEN), interest: INTEREST, logLevel: log.level,
  })
})
