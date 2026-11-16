// API quản trị qua HTTP. Chỉ bật khi có ADMIN_TOKEN (không thì mọi /admin/* trả 404, như thể không tồn tại).
// Bảo vệ: so sánh token thời gian không đổi; giới hạn tốc độ riêng; khóa tạm theo IP khi sai token nhiều lần; body ≤ 8 KB.
import { createHash, timingSafeEqual } from 'node:crypto'
import { cleanNotice, cleanPoll, cleanSysText, normalizeIds } from './ids.mjs'

const BODY_MAX = 8192
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
}

/**
 * @param {object} o
 * @param {string} o.token            ADMIN_TOKEN
 * @param {object} o.log
 * @param {(req: import('node:http').IncomingMessage) => string} o.clientIp
 * @param {object} o.actions          các hành động trên trạng thái phòng (do server chính cung cấp)
 * @param {number} [o.maxFails]       số lần sai token trong cửa sổ trước khi khóa
 * @param {number} [o.failWindowMs]
 * @param {number} [o.lockMs]
 * @param {number} [o.ratePerMin]
 */
export function createAdmin({ token, log, clientIp, actions, maxFails = 5, failWindowMs = 600_000, lockMs = 900_000, ratePerMin = 60 }) {
  const expected = createHash('sha256').update(token).digest()
  const fails = new Map() // ip -> { times: number[], lockedUntil: number }
  const hits = new Map() // ip -> number[]  (giới hạn tốc độ)

  setInterval(() => {
    const t = Date.now()
    for (const [ip, list] of hits) if (list.every((at) => t - at > 60_000)) hits.delete(ip)
    for (const [ip, f] of fails) if (f.lockedUntil < t && f.times.every((at) => t - at > failWindowMs)) fails.delete(ip)
  }, 60_000).unref()

  const reply = (res, status, body, extra = {}) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS, ...extra })
    res.end(JSON.stringify(body))
  }

  function tokenOk(header) {
    const match = /^Bearer (.+)$/.exec(header ?? '')
    const given = createHash('sha256').update(match ? match[1] : '').digest()
    // timingSafeEqual trên hai băm cùng độ dài: thời gian không phụ thuộc vào việc đoán đúng bao nhiêu ký tự đầu.
    return timingSafeEqual(given, expected) && match !== null
  }

  function readBody(req, res) {
    return new Promise((resolve) => {
      const chunks = []
      let size = 0
      let over = false
      req.on('data', (chunk) => {
        if (over) return
        size += chunk.length
        if (size > BODY_MAX) {
          over = true
          reply(res, 413, { error: 'body quá lớn (tối đa 8 KB)' }, { connection: 'close' })
          // đợi phản hồi gửi xong rồi mới cắt: destroy ngay có thể làm mất phản hồi và client chỉ thấy "connection reset"
          res.once('finish', () => req.socket?.destroy())
          resolve(null)
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (over) return
        if (size === 0) return resolve({})
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          reply(res, 400, { error: 'JSON không hợp lệ' })
          resolve(null)
        }
      })
      req.on('error', () => resolve(null))
    })
  }

  async function handle(req, res, url) {
    const ip = clientIp(req)
    const t = Date.now()

    // 1) khóa tạm sau nhiều lần sai token (chặn cả khi lần này đúng, để kẻ đoán không biết khi nào trúng)
    const failure = fails.get(ip)
    if (failure && failure.lockedUntil > t) {
      return reply(res, 429, { error: 'bị khóa tạm', retryAfterSec: Math.ceil((failure.lockedUntil - t) / 1000) }, { 'retry-after': String(Math.ceil((failure.lockedUntil - t) / 1000)) })
    }
    // 2) giới hạn tốc độ riêng cho /admin
    const recent = (hits.get(ip) ?? []).filter((at) => t - at < 60_000)
    recent.push(t)
    hits.set(ip, recent)
    if (recent.length > ratePerMin) return reply(res, 429, { error: 'quá nhiều yêu cầu' }, { 'retry-after': '60' })

    // 3) xác thực
    if (!tokenOk(req.headers.authorization)) {
      const f = failure ?? { times: [], lockedUntil: 0 }
      f.times = f.times.filter((at) => t - at < failWindowMs)
      f.times.push(t)
      if (f.times.length >= maxFails) {
        f.lockedUntil = t + lockMs
        f.times = []
        log.info('admin: khóa IP do sai token nhiều lần', { ip, lockMs })
      }
      fails.set(ip, f)
      log.info('admin: sai token', { ip, path: url.pathname })
      return reply(res, 401, { error: 'sai hoặc thiếu token' }, { 'www-authenticate': 'Bearer' })
    }
    fails.delete(ip)

    const route = `${req.method} ${url.pathname.replace(/\/+$/, '') || '/'}`
    const audit = (action, fields = {}) => log.info('admin', { action, ip, ...fields })
    const needBody = async () => {
      if (req.method === 'POST' && !(req.headers['content-type'] ?? '').includes('application/json')) {
        reply(res, 415, { error: 'cần Content-Type: application/json' })
        return null
      }
      const body = await readBody(req, res)
      if (body === null) return null
      if (typeof body !== 'object' || Array.isArray(body)) {
        reply(res, 400, { error: 'body phải là đối tượng JSON' })
        return null
      }
      return body
    }

    if (route === 'GET /admin/status') {
      const gc = url.searchParams.get('gc') === '1'
      return reply(res, 200, actions.status({ gc }))
    }
    if (route === 'POST /admin/poll') {
      const body = await needBody()
      if (!body) return
      const parsed = cleanPoll(body)
      if (parsed.error) return reply(res, 400, { error: parsed.error })
      const poll = actions.setPoll(parsed.q, parsed.options)
      audit('poll.set', { id: poll.id, options: parsed.options.length })
      return reply(res, 200, { ok: true, id: poll.id })
    }
    if (route === 'DELETE /admin/poll') {
      actions.clearPoll()
      audit('poll.clear')
      return reply(res, 200, { ok: true })
    }
    if (route === 'POST /admin/board') {
      const body = await needBody()
      if (!body) return
      const videos = normalizeIds(body.videos ?? [])
      const music = normalizeIds(body.music ?? [])
      for (const [name, r] of [['videos', videos], ['music', music]]) {
        if (r.invalid > 0) return reply(res, 400, { error: `${name}: có ${r.invalid} mục sai định dạng (cần 6–20 ký tự A-Z a-z 0-9 _ -)` })
        if (r.truncated) return reply(res, 400, { error: `${name}: tối đa 200 mục` })
      }
      actions.setBoard(videos.ids, music.ids)
      audit('board.set', { videos: videos.ids.length, music: music.ids.length })
      return reply(res, 200, { ok: true, videos: videos.ids.length, music: music.ids.length })
    }
    if (route === 'POST /admin/sys') {
      const body = await needBody()
      if (!body) return
      const parsed = cleanSysText(body.text)
      if (parsed.error) return reply(res, 400, { error: parsed.error })
      const delivered = actions.broadcastSys(parsed.text)
      audit('sys.broadcast', { lines: parsed.text.split('\n').length, delivered })
      return reply(res, 200, { ok: true, delivered })
    }
    if (route === 'POST /admin/notice') {
      const body = await needBody()
      if (!body) return
      const parsed = cleanNotice(body)
      if (parsed.error) return reply(res, 400, { error: parsed.error })
      const delivered = actions.broadcastNotice(parsed.notice)
      audit('notice', { kind: parsed.notice.kind, delivered })
      return reply(res, 200, { ok: true, delivered })
    }
    if (route === 'POST /admin/kick') {
      const body = await needBody()
      if (!body) return
      const keys = ['index', 'tab', 'name'].filter((k) => body[k] !== undefined)
      if (keys.length !== 1) return reply(res, 400, { error: 'cần đúng một trong: index, tab, name' })
      if (body.index !== undefined && !Number.isInteger(body.index)) return reply(res, 400, { error: 'index phải là số nguyên' })
      if (body.tab !== undefined && (typeof body.tab !== 'string' || body.tab.length === 0 || body.tab.length > 40)) return reply(res, 400, { error: 'tab sai' })
      if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length === 0 || body.name.length > 60)) return reply(res, 400, { error: 'name sai' })
      const banMinutes = body.banMinutes === undefined ? 0 : body.banMinutes
      if (!Number.isFinite(banMinutes) || banMinutes < 0 || banMinutes > 60 * 24 * 365) return reply(res, 400, { error: 'banMinutes phải từ 0 tới 525600' })
      const scope = body.scope ?? 'both'
      if (!['tab', 'ip', 'both'].includes(scope)) return reply(res, 400, { error: "scope phải là 'tab', 'ip' hoặc 'both'" })
      const result = actions.kick({ index: body.index, tab: body.tab, name: body.name, banMinutes, scope, reason: typeof body.reason === 'string' ? body.reason.slice(0, 200) : '' })
      audit('kick', { by: keys[0], banMinutes, scope, kicked: result.kicked, bans: result.bans })
      return reply(res, 200, { ok: true, ...result })
    }
    if (route === 'GET /admin/bans') return reply(res, 200, { bans: actions.listBans() })
    if (req.method === 'DELETE' && url.pathname.startsWith('/admin/bans/')) {
      let key
      try {
        key = decodeURIComponent(url.pathname.slice('/admin/bans/'.length))
      } catch {
        return reply(res, 400, { error: 'khóa sai' })
      }
      const removed = actions.removeBan(key)
      audit('ban.remove', { key, removed })
      return removed ? reply(res, 200, { ok: true }) : reply(res, 404, { error: 'không có ban này' })
    }
    return reply(res, 404, { error: 'không có đường dẫn này' })
  }

  return { handle }
}
