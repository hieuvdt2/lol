// Vận hành: board, sys, poll, API quản trị, ban/kick, lưu bền vững, health, tắt êm, log, giới hạn bảng xếp hạng.
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { sleep, startServer, until } from '../helpers/server.mjs'
import { closeAll, connect } from '../helpers/wsclient.mjs'

const TOKEN = 'tok-main-0123456789'
const servers = {}
before(async () => {
  // ADMIN_MAX_FAILS lớn: bài xác thực cố ý gửi nhiều token sai, không được tự khóa máy test (cơ chế khóa có server riêng ở bài khác).
  servers.main = await startServer({ ADMIN_TOKEN: TOKEN, ADMIN_RATE_PER_MIN: '100000', ADMIN_MAX_FAILS: '100000', DUEL_COUNTDOWN_MS: '300', BOTS: '1' })
  servers.noadmin = await startServer({})
  servers.lock = await startServer({ ADMIN_TOKEN: 'tok-lock-0123456789', ADMIN_MAX_FAILS: '3', ADMIN_LOCK_MS: '600000' })
  servers.rate = await startServer({ ADMIN_TOKEN: 'tok-rate-0123456789', ADMIN_RATE_PER_MIN: '5' })
})
after(async () => {
  closeAll()
  for (const server of Object.values(servers)) await server.stop()
})

/** Gọi API quản trị. body undefined = không gửi body. */
async function call(server, token, method, route, body, headers = {}) {
  const res = await fetch(server.url + route, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* không có body JSON */
  }
  return { status: res.status, json, headers: res.headers }
}
const admin = (route, method = 'GET', body) => call(servers.main, TOKEN, method, route, body)
const closeCode = (client) => new Promise((resolve) => client.ws.on('close', (code) => resolve(code)))
const lines = (server) => server.output().split('\n').filter(Boolean)

// ---------------------------------------------------------------- xác thực
test('không đặt ADMIN_TOKEN thì /admin/* không tồn tại (404), kể cả khi gửi token', async () => {
  for (const route of ['/admin/status', '/admin', '/admin/bans']) {
    assert.equal((await call(servers.noadmin, 'bat-ky-token', 'GET', route)).status, 404, route)
  }
  assert.equal((await call(servers.noadmin, null, 'POST', '/admin/sys', { text: 'x' })).status, 404)
})

test('xác thực Bearer: thiếu / sai / gần đúng đều bị từ chối, đúng thì qua', async () => {
  assert.equal((await call(servers.main, null, 'GET', '/admin/status')).status, 401)
  assert.equal((await call(servers.main, null, 'GET', '/admin/status', undefined, { authorization: TOKEN })).status, 401, 'thiếu chữ Bearer')
  for (const wrong of ['sai', TOKEN + 'x', TOKEN.slice(0, -1), TOKEN.toUpperCase(), '']) {
    assert.equal((await call(servers.main, wrong, 'GET', '/admin/status')).status, 401, `"${wrong}" phải bị từ chối`)
  }
  const ok = await admin('/admin/status')
  assert.equal(ok.status, 200)
  assert.equal(typeof ok.json.uptimeSec, 'number')
})

test('sai token nhiều lần thì bị khóa tạm, kể cả khi lần sau đúng token', async () => {
  const lock = servers.lock
  for (let i = 0; i < 2; i += 1) assert.equal((await call(lock, 'sai', 'GET', '/admin/status')).status, 401)
  assert.equal((await call(lock, 'sai', 'GET', '/admin/status')).status, 401, 'lần sai thứ 3 vẫn trả 401 (và kích hoạt khóa)')
  const locked = await call(lock, 'tok-lock-0123456789', 'GET', '/admin/status')
  assert.equal(locked.status, 429)
  assert.ok(locked.json.retryAfterSec > 0)
  assert.ok(locked.headers.get('retry-after'))
})

test('giới hạn tốc độ riêng cho /admin', async () => {
  const rate = servers.rate
  for (let i = 0; i < 5; i += 1) assert.equal((await call(rate, 'tok-rate-0123456789', 'GET', '/admin/status')).status, 200)
  assert.equal((await call(rate, 'tok-rate-0123456789', 'GET', '/admin/status')).status, 429)
})

test('body: quá 8 KB → 413, sai Content-Type → 415, JSON hỏng → 400, không phải đối tượng → 400', async () => {
  assert.equal((await admin('/admin/sys', 'POST', { text: 'x'.repeat(9000) })).status, 413)
  assert.equal((await call(servers.main, TOKEN, 'POST', '/admin/sys', 'text=abc', { 'content-type': 'text/plain' })).status, 415)
  assert.equal((await admin('/admin/sys', 'POST', '{ hỏng')).status, 400)
  assert.equal((await admin('/admin/sys', 'POST', '[1,2]')).status, 400)
  assert.equal((await admin('/admin/khong-co', 'GET')).status, 404)
  assert.equal((await admin('/admin/status', 'POST', {})).status, 404, 'sai phương thức')
})

// ---------------------------------------------------------------- board / sys / notice / poll
test('board: gửi ngay sau admitted (rỗng), phát khi đổi (loại trùng, giữ thứ tự), người vào sau và người nối lại đều nhận', async () => {
  const early = connect(servers.main, 'BoardA', { tab: 'bd-a' })
  await early.admitted()
  const first = await early.until(() => early.find('board'), 'board rỗng')
  assert.deepEqual([first.videos, first.music], [[], []])
  assert.ok(early.json.findIndex((m) => m.t === 'admitted') < early.json.findIndex((m) => m.t === 'board'), 'board đến sau admitted')

  const set = await admin('/admin/board', 'POST', { videos: ['vid_AAAAAA', 'vid_BBBBBB', 'vid_AAAAAA'], music: ['mus-111111'] })
  assert.deepEqual([set.status, set.json.videos, set.json.music], [200, 2, 1])
  const update = await early.until(() => early.all('board').at(-1)?.videos.length === 2 && early.all('board').at(-1), 'broadcast board')
  assert.deepEqual(update.videos, ['vid_AAAAAA', 'vid_BBBBBB'])
  assert.deepEqual(update.music, ['mus-111111'])

  const late = connect(servers.main, 'BoardB', { tab: 'bd-b' })
  await late.admitted()
  assert.deepEqual((await late.until(() => late.find('board'), 'board cho người vào sau')).videos, ['vid_AAAAAA', 'vid_BBBBBB'])

  early.close()
  await sleep(100)
  const back = connect(servers.main, 'BoardA', { tab: 'bd-a' })
  assert.equal((await back.admitted()).resumed, true)
  assert.equal((await back.until(() => back.find('board'), 'board khi nối lại')).music[0], 'mus-111111')
  assert.equal((await admin('/admin/board', 'POST', { videos: [], music: [] })).status, 200)
})

test('board: dữ liệu sai bị từ chối và không đổi trạng thái', async () => {
  await admin('/admin/board', 'POST', { videos: ['keep_me_1'], music: [] })
  for (const body of [{ videos: ['ngan'] }, { videos: ['co khoang trang'] }, { videos: 'abcdef' }, { music: [123456] }, { videos: Array.from({ length: 201 }, (_, i) => `id${String(i).padStart(5, '0')}`) }]) {
    assert.equal((await admin('/admin/board', 'POST', body)).status, 400, JSON.stringify(body).slice(0, 60))
  }
  assert.equal((await admin('/admin/status')).json.board.videos, 1, 'trạng thái cũ còn nguyên')
  await admin('/admin/board', 'POST', { videos: [], music: [] })
})

test('sys: phát nhiều dòng tới mọi người; sai định dạng bị từ chối', async () => {
  const c = connect(servers.main, 'SysA', { tab: 'sy-a' })
  await c.admitted()
  const r = await admin('/admin/sys', 'POST', { text: ' Dòng 1 \n\nDòng 2 ' })
  assert.equal(r.status, 200)
  assert.ok(r.json.delivered >= 1)
  assert.equal((await c.until(() => c.find('sys'), 'sys')).text, 'Dòng 1\nDòng 2')
  for (const body of [{}, { text: '' }, { text: 5 }, { text: Array.from({ length: 31 }, (_, i) => `d${i}`).join('\n') }]) {
    assert.equal((await admin('/admin/sys', 'POST', body)).status, 400, JSON.stringify(body).slice(0, 40))
  }
})

test('notice: phát tele_join / room_join, kiểm tra chặt dữ liệu', async () => {
  const c = connect(servers.main, 'NoticeA', { tab: 'no-a' })
  await c.admitted()
  assert.equal((await admin('/admin/notice', 'POST', { kind: 'tele_join', names: ['Lan'], more: 4 })).status, 200)
  const n = await c.until(() => c.all('notice').find((m) => m.kind === 'tele_join'), 'notice tele_join')
  assert.deepEqual([n.names, n.more], [['Lan'], 4])
  for (const body of [{ kind: 'xyz', names: ['a'] }, { kind: 'tele_join', names: ['a', 'b', 'c'] }, { kind: 'tele_join', names: [] }, { kind: 'tele_join', names: ['a'], more: -3 }]) {
    assert.equal((await admin('/admin/notice', 'POST', body)).status, 400, JSON.stringify(body))
  }
})

test('poll: đặt → phát; đếm phiếu; người vào sau nhận; xóa thì người vào sau không nhận; id luôn tăng', async () => {
  const a = connect(servers.main, 'PollA', { tab: 'pl-a' })
  await a.admitted()
  const set = await admin('/admin/poll', 'POST', { q: 'Ai đá chính?', options: ['An', 'Bình', 'Cường'] })
  assert.equal(set.status, 200)
  const poll = await a.until(() => a.find('poll'), 'poll tới client')
  assert.deepEqual([poll.id, poll.q, poll.options], [set.json.id, 'Ai đá chính?', ['An', 'Bình', 'Cường']])
  a.send({ t: 'vote', poll: poll.id, option: 1 })
  a.send({ t: 'vote', poll: poll.id, option: 2 }) // lần thứ hai bị bỏ qua
  await until(async () => (await admin('/admin/status')).json.poll?.counts?.[1] === 1, { label: 'phiếu được đếm' })
  assert.deepEqual((await admin('/admin/status')).json.poll.counts, [0, 1, 0])

  const late = connect(servers.main, 'PollB', { tab: 'pl-b' })
  await late.admitted()
  assert.equal((await late.until(() => late.find('poll'), 'poll cho người vào sau')).id, poll.id)

  assert.equal((await admin('/admin/poll', 'DELETE')).status, 200)
  // Người đang trong hang được báo đóng bình chọn (thông điệp mở rộng `pollClosed`, client gốc bỏ qua).
  assert.equal((await a.until(() => a.find('pollClosed'), 'pollClosed tới người đang chơi')).id, poll.id)
  assert.equal((await late.until(() => late.find('pollClosed'), 'pollClosed tới người vào sau')).id, poll.id)
  assert.equal((await admin('/admin/poll', 'DELETE')).status, 200) // xóa lần nữa khi không còn poll
  await sleep(150)
  assert.equal(a.all('pollClosed').length, 1, 'không có poll thì không phát pollClosed')
  const after = connect(servers.main, 'PollC', { tab: 'pl-c' })
  await after.admitted()
  await sleep(200)
  assert.equal(after.find('poll'), undefined, 'không còn poll')
  assert.equal((await admin('/admin/status')).json.poll, null)

  const next = await admin('/admin/poll', 'POST', { q: 'Mới?', options: ['Có', 'Không'] })
  assert.ok(next.json.id > poll.id, 'id poll tăng dần')
  for (const body of [{ q: '', options: ['a', 'b'] }, { q: 'x', options: ['a'] }, { q: 'x', options: ['a', 'a'] }, { q: 'x', options: ['1', '2', '3', '4', '5', '6', '7'] }]) {
    assert.equal((await admin('/admin/poll', 'POST', body)).status, 400, JSON.stringify(body))
  }
  await admin('/admin/poll', 'DELETE')
})

// ---------------------------------------------------------------- kick / ban
test('kick: người bị đuổi nhận rejected, biến mất khỏi phòng, vẫn vào lại được nếu không ban; bot không bị đuổi', async () => {
  const victim = connect(servers.main, 'Victim1', { tab: 'k-v1' })
  const watcher = connect(servers.main, 'Watch1', { tab: 'k-w1' })
  const index = (await victim.admitted()).selfIndex
  await watcher.admitted()
  const closed = closeCode(victim)
  const r = await admin('/admin/kick', 'POST', { index })
  assert.deepEqual([r.status, r.json.kicked, r.json.bans], [200, 1, 0])
  assert.equal((await victim.until(() => victim.find('rejected'), 'rejected')).reason, 'kicked')
  assert.equal(await closed, 4001)
  await watcher.until(() => watcher.all('leave').some((m) => m.i === index), 'người khác thấy leave')
  const back = connect(servers.main, 'Victim1', { tab: 'k-v1' })
  assert.ok((await back.admitted()).selfIndex, 'không ban thì vào lại được')

  assert.equal((await admin('/admin/kick', 'POST', { name: 'Ca Dic' })).json.kicked, 0, 'bot không bị đuổi')
  const byName = await admin('/admin/kick', 'POST', { name: 'Watch1' })
  assert.equal(byName.json.kicked, 1)
  const byTab = await admin('/admin/kick', 'POST', { tab: 'k-v1' })
  assert.equal(byTab.json.kicked, 1)
})

test('kick: kiểm tra tham số', async () => {
  for (const body of [{}, { index: 1, tab: 'x' }, { index: 'một' }, { tab: '' }, { name: 5 }, { index: 1, banMinutes: -1 }, { index: 1, banMinutes: 'nhiều' }, { index: 1, scope: 'moi-thu' }, { index: 1, banMinutes: 1e9 }]) {
    assert.equal((await admin('/admin/kick', 'POST', body)).status, 400, JSON.stringify(body))
  }
})

test('ban theo tab: không vào lại được, tab khác vẫn vào được, liệt kê, gỡ ban thì vào lại', async () => {
  const victim = connect(servers.main, 'Banned1', { tab: 'b-t1' })
  const index = (await victim.admitted()).selfIndex
  const r = await admin('/admin/kick', 'POST', { index, banMinutes: 30, scope: 'tab', reason: 'thử' })
  assert.deepEqual([r.json.kicked, r.json.bans], [1, 1])
  assert.equal((await victim.until(() => victim.find('rejected'), 'rejected')).reason, 'banned')

  const again = connect(servers.main, 'Banned1', { tab: 'b-t1' })
  assert.equal((await again.until(() => again.find('rejected'), 'bị chặn khi vào lại')).reason, 'banned')
  const other = connect(servers.main, 'Banned1', { tab: 'b-t2' })
  assert.ok((await other.admitted()).selfIndex, 'tab khác không bị ảnh hưởng (scope tab)')

  const list = (await admin('/admin/bans')).json.bans
  const entry = list.find((b) => b.key === 'tab:b-t1')
  assert.ok(entry && entry.remainingMin >= 29 && entry.reason === 'thử')
  assert.equal((await admin(`/admin/bans/${encodeURIComponent('tab:b-t1')}`, 'DELETE')).status, 200)
  assert.equal((await admin(`/admin/bans/${encodeURIComponent('tab:b-t1')}`, 'DELETE')).status, 404, 'gỡ lần hai: không còn')
  const free = connect(servers.main, 'Banned1', { tab: 'b-t1' })
  assert.ok((await free.admitted()).selfIndex, 'gỡ ban thì vào lại được')
})

test('ban có thời hạn: hết hạn thì tự gỡ', async () => {
  const v = connect(servers.main, 'Short1', { tab: 'b-short' })
  const index = (await v.admitted()).selfIndex
  await admin('/admin/kick', 'POST', { index, banMinutes: 0.02, scope: 'tab' }) // ~1,2 giây
  const blocked = connect(servers.main, 'Short1', { tab: 'b-short' })
  assert.equal((await blocked.until(() => blocked.find('rejected'), 'đang bị ban')).reason, 'banned')
  await until(async () => {
    const c = connect(servers.main, 'Short1', { tab: 'b-short' })
    const ok = await c.until(() => c.find('admitted') || c.find('rejected'), 'phản hồi').then((m) => m.t === 'admitted')
    c.close()
    return ok
  }, { timeout: 6000, every: 300, label: 'ban hết hạn' })
})

test('cấm trước một tab chưa vào phòng', async () => {
  const r = await admin('/admin/kick', 'POST', { tab: 'chua-vao', banMinutes: 10, scope: 'tab' })
  assert.deepEqual([r.json.kicked, r.json.bans], [0, 1])
  const c = connect(servers.main, 'PreBan', { tab: 'chua-vao' })
  assert.equal((await c.until(() => c.find('rejected'), 'bị chặn')).reason, 'banned')
  await admin(`/admin/bans/${encodeURIComponent('tab:chua-vao')}`, 'DELETE')
})

test('ban theo IP (scope both): đổi tab cũng không vào lại được', async () => {
  const server = await startServer({ ADMIN_TOKEN: 'tok-ipban-0123456789' })
  try {
    const v = connect(server, 'IpV', { tab: 'ip-1' })
    const index = (await v.admitted()).selfIndex
    const r = await call(server, 'tok-ipban-0123456789', 'POST', '/admin/kick', { index, banMinutes: 30 })
    assert.equal(r.json.bans, 2, 'một ban theo tab và một theo IP')
    const other = connect(server, 'IpV', { tab: 'ip-khac' })
    assert.equal((await other.until(() => other.find('rejected'), 'IP bị chặn')).reason, 'banned')
    const keys = (await call(server, 'tok-ipban-0123456789', 'GET', '/admin/bans')).json.bans.map((b) => b.key)
    assert.ok(keys.includes('ip:127.0.0.1') && keys.includes('tab:ip-1'))
    await call(server, 'tok-ipban-0123456789', 'DELETE', `/admin/bans/${encodeURIComponent('ip:127.0.0.1')}`)
    await call(server, 'tok-ipban-0123456789', 'DELETE', `/admin/bans/${encodeURIComponent('tab:ip-1')}`)
    const free = connect(server, 'IpV', { tab: 'ip-khac' })
    assert.ok((await free.admitted()).selfIndex)
  } finally {
    closeAll()
    await server.stop()
  }
})

test('status: số người, bộ nhớ, cấu trúc nội bộ, kết nối theo IP', async () => {
  const c = connect(servers.main, 'StatusA', { tab: 'st-a' })
  await c.admitted()
  const s = (await admin('/admin/status?gc=1')).json
  assert.ok(s.players.humans >= 1 && s.players.bots >= 1 && s.players.total === s.players.humans + s.players.bots)
  for (const key of ['rssMB', 'heapUsedMB', 'heapTotalMB']) assert.ok(s.memory[key] > 0, key)
  for (const key of ['byTab', 'invites', 'talks', 'duels', 'wins', 'bans', 'ipConnections', 'seenEntries']) assert.equal(typeof s.structures[key], 'number', key)
  assert.equal(s.connectionsByIp[0][0], '127.0.0.1')
  assert.equal(s.draining, false)
  assert.equal(s.persistence.enabled, true)
})

// ---------------------------------------------------------------- lưu bền vững
test('lưu bền vững: xếp hạng, ban, poll (kèm phiếu) và board sống sót qua khởi động lại; tệp không để lại bản tạm', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hangmu-persist-'))
  const env = { ADMIN_TOKEN: 'tok-persist-0123456789', DATA_DIR: dir, DUEL_COUNTDOWN_MS: '300', BOTS: '0' }
  const tok = env.ADMIN_TOKEN
  try {
    const a = await startServer(env)
    const x = connect(a, 'Winner1', { tab: 'ps-x' })
    const y = connect(a, 'Loser1', { tab: 'ps-y' })
    await x.admitted()
    const yi = (await y.admitted()).selfIndex
    x.send({ t: 'inviteAsk', kind: 'duel', target: yi })
    const inv = await y.until(() => y.find('invite'), 'mời duel')
    y.send({ t: 'inviteAnswer', id: inv.id, accept: true })
    await x.until(() => x.game('duel').some((d) => d.a === 'go'), 'go')
    y.send({ t: 'game', g: 'duel', d: { a: 'quit' } })
    await x.until(() => x.game('duel').some((d) => d.a === 'end'), 'end')

    const pollId = (await call(a, tok, 'POST', '/admin/poll', { q: 'Còn nhớ không?', options: ['Có', 'Không'] })).json.id
    x.send({ t: 'vote', poll: pollId, option: 0 })
    await until(async () => (await call(a, tok, 'GET', '/admin/status')).json.poll?.counts?.[0] === 1, { label: 'phiếu đếm' })
    await call(a, tok, 'POST', '/admin/board', { videos: ['persist_vid1'], music: ['persist_mus1'] })
    await call(a, tok, 'POST', '/admin/kick', { tab: 'tab-bi-ban', banMinutes: 60, scope: 'tab' })
    closeAll()
    assert.equal((await a.stop()).code, 0, 'tắt êm thoát với mã 0')

    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'))
    assert.deepEqual(saved.ladder.map((r) => [r[1], r[2]]), [['Winner1', 1]], 'bảng võ công lưu theo mã người dùng: [mã, tên, thắng, tuần, lúc]')
    assert.match(saved.ladder[0][0], /^[A-Za-z0-9_-]{20,}$/)
    assert.equal(saved.board.videos[0], 'persist_vid1')
    assert.equal(saved.bans[0].key, 'tab:tab-bi-ban')
    assert.equal(saved.poll.id, pollId)
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), [], 'không còn tệp tạm')

    const b = await startServer(env)
    const s = (await call(b, tok, 'GET', '/admin/status')).json
    assert.deepEqual([s.structures.wins, s.structures.bans, s.poll.id, s.board.videos], [1, 1, pollId, 1])
    const c = connect(b, 'Newcomer', { tab: 'ps-new' })
    await c.admitted()
    assert.equal((await c.until(() => c.find('poll'), 'poll sau khởi động lại')).id, pollId)
    assert.equal((await c.until(() => c.find('board'), 'board sau khởi động lại')).videos[0], 'persist_vid1')
    assert.deepEqual((await c.until(() => c.game('duel').find((d) => d.a === 'rank'), 'rank')).top, [['Winner1', 1]])
    const banned = connect(b, 'Hacker', { tab: 'tab-bi-ban' })
    assert.equal((await banned.until(() => banned.find('rejected'), 'ban còn hiệu lực')).reason, 'banned')

    // phiếu đã bầu được nhớ theo tab id: bỏ phiếu lần nữa không được tính
    const voter = connect(b, 'Winner1', { tab: 'ps-x' })
    await voter.admitted()
    voter.send({ t: 'vote', poll: pollId, option: 1 })
    await sleep(300)
    assert.deepEqual((await call(b, tok, 'GET', '/admin/status')).json.poll.counts, [1, 0], 'không bầu được hai lần sau khi khởi động lại')
    // poll mới có id lớn hơn poll cũ (id không bị lặp lại)
    assert.ok((await call(b, tok, 'POST', '/admin/poll', { q: 'Poll 2', options: ['A', 'B'] })).json.id > pollId)
    closeAll()
    await b.stop()
  } finally {
    closeAll()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('lưu bền vững: thay đổi được ghi trong vài trăm ms mà không cần tắt server', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hangmu-debounce-'))
  const server = await startServer({ ADMIN_TOKEN: 'tok-deb-0123456789', DATA_DIR: dir })
  try {
    await call(server, 'tok-deb-0123456789', 'POST', '/admin/board', { videos: ['debounce_01'], music: [] })
    await until(() => fs.existsSync(path.join(dir, 'state.json')) && JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).board.videos[0] === 'debounce_01', { timeout: 3000, label: 'tệp được ghi' })
  } finally {
    await server.stop()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('tệp trạng thái hỏng: server vẫn khởi động, giữ tệp hỏng lại, ghi log lỗi', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hangmu-corrupt-'))
  fs.writeFileSync(path.join(dir, 'state.json'), '{ "wins": [[ không phải json')
  const server = await startServer({ ADMIN_TOKEN: 'tok-cor-0123456789', DATA_DIR: dir })
  try {
    const s = (await call(server, 'tok-cor-0123456789', 'GET', '/admin/status')).json
    assert.deepEqual([s.structures.wins, s.persistence.enabled], [0, true])
    assert.ok(fs.readdirSync(dir).some((f) => f.includes('.corrupt-')))
    assert.ok(lines(server).some((l) => JSON.parse(l).level === 'error' && /hỏng/.test(JSON.parse(l).msg)))
    const c = connect(server, 'SauLoi', { tab: 'cor-1' })
    assert.ok((await c.admitted()).selfIndex, 'phòng vẫn chạy bình thường')
  } finally {
    closeAll()
    await server.stop()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('tệp trạng thái có một phần sai: nạp phần đúng, bỏ phần sai', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hangmu-partial-'))
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({
    ladder: [['t'.repeat(24), 'Tot', 3, Date.now(), Date.now()], ['s'.repeat(24), 'Sai', 'x', Date.now(), Date.now()], 5, ['u'.repeat(24), '', 2, Date.now(), Date.now()], ['v'.repeat(24), 'Am', -1, Date.now(), Date.now()], ['ngan', 'MaSai', 1, Date.now(), Date.now()], ['w'.repeat(24), 'QuaHan', 4, 1, 1]],
    bans: [{ kind: 'tab', value: 'con-han', until: Date.now() + 3_600_000 }, { kind: 'tab', value: 'het-han', until: Date.now() - 1000 }, { kind: 'khac', value: 'x', until: Date.now() + 1e6 }, null],
    pollSeq: 'abc',
    poll: { id: 'x', q: 'hỏng' },
    board: { videos: ['video_ok1', 'sai sai'], music: 'khong-phai-mang' },
  }))
  const server = await startServer({ ADMIN_TOKEN: 'tok-par-0123456789', DATA_DIR: dir })
  try {
    const s = (await call(server, 'tok-par-0123456789', 'GET', '/admin/status')).json
    assert.deepEqual([s.structures.wins, s.structures.bans, s.poll, s.board.videos, s.board.music], [1, 1, null, 1, 0])
  } finally {
    await server.stop()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('DATA_DIR không ghi được: server chạy tiếp không lưu và báo trong status + log', async () => {
  const server = await startServer({ ADMIN_TOKEN: 'tok-ro-0123456789', DATA_DIR: '/dev/null/hangmu-khong-ghi-duoc' })
  try {
    const s = (await call(server, 'tok-ro-0123456789', 'GET', '/admin/status')).json
    assert.equal(s.persistence.enabled, false)
    assert.ok(lines(server).some((l) => /DATA_DIR không ghi được/.test(JSON.parse(l).msg)))
    await call(server, 'tok-ro-0123456789', 'POST', '/admin/board', { videos: ['khong_luu_1'], music: [] })
    assert.equal((await call(server, 'tok-ro-0123456789', 'GET', '/admin/status')).json.board.videos, 1, 'vẫn hoạt động trong bộ nhớ')
  } finally {
    await server.stop()
  }
})

test('bảng xếp hạng lưu có giới hạn (WINS_MAX): tên do người chơi đặt không làm phình vô hạn', async () => {
  const server = await startServer({ ADMIN_TOKEN: 'tok-cap-0123456789', WINS_MAX: '2', DUEL_COUNTDOWN_MS: '200', BOTS: '0' })
  const tok = 'tok-cap-0123456789'
  try {
    for (const n of [1, 2, 3]) {
      const winner = connect(server, `Thang${n}`, { tab: `cap-w${n}` })
      const loser = connect(server, `Thua${n}`, { tab: `cap-l${n}` })
      await winner.admitted()
      const li = (await loser.admitted()).selfIndex
      winner.send({ t: 'inviteAsk', kind: 'duel', target: li })
      const inv = await loser.until(() => loser.find('invite'), 'mời')
      loser.send({ t: 'inviteAnswer', id: inv.id, accept: true })
      await winner.until(() => winner.game('duel').some((d) => d.a === 'go'), 'go')
      loser.send({ t: 'game', g: 'duel', d: { a: 'quit' } })
      await winner.until(() => winner.game('duel').some((d) => d.a === 'end'), 'end')
      winner.send({ t: 'leave' })
      loser.send({ t: 'leave' })
      await sleep(150)
    }
    const s = (await call(server, tok, 'GET', '/admin/status')).json
    assert.equal(s.structures.wins, 2, 'chỉ giữ tối đa 2 tên')
    const observer = connect(server, 'Xem', { tab: 'cap-x' })
    await observer.admitted()
    const rank = (await observer.until(() => observer.game('duel').find((d) => d.a === 'rank'), 'rank')).top.map(([name]) => name)
    assert.ok(rank.includes('Thang3'), 'người thắng mới nhất vẫn có mặt')
  } finally {
    closeAll()
    await server.stop()
  }
})

// ---------------------------------------------------------------- health, header, log
test('/healthz và /readyz trả JSON; header an toàn có trên JSON, tĩnh và phản hồi quản trị', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hangmu-static-'))
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>t</title>')
  const server = await startServer({ STATIC_DIR: dir, ADMIN_TOKEN: 'tok-hd-0123456789' })
  try {
    const health = await fetch(`${server.url}/healthz`)
    const body = await health.json()
    assert.deepEqual([health.status, body.ok, typeof body.uptime, typeof body.players], [200, true, 'number', 'number'])
    const ready = await fetch(`${server.url}/readyz`)
    assert.deepEqual([ready.status, (await ready.json()).ready], [200, true])
    for (const route of ['/healthz', '/', '/api/room/status', '/admin/status']) {
      const res = await fetch(server.url + route)
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', route)
      assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', route)
      assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN', route)
      assert.equal(res.headers.get('content-security-policy'), null, 'không đặt CSP')
    }
  } finally {
    await server.stop()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('log: mỗi dòng là JSON; không ghi nội dung chat mặc định; có khi bật LOG_CHAT; không lộ token; mức error ẩn info', async () => {
  const secret = 'tok-log-SIEU-BI-MAT-123'
  const quiet = await startServer({ LOG_LEVEL: 'debug', ADMIN_TOKEN: secret })
  const loud = await startServer({ LOG_LEVEL: 'debug', LOG_CHAT: '1' })
  const errorOnly = await startServer({ LOG_LEVEL: 'error', ADMIN_TOKEN: secret }, { ready: 'http' })
  try {
    for (const server of [quiet, loud]) {
      const c = connect(server, 'LogA', { tab: 'lg-a' })
      await c.admitted()
      c.send({ t: 'chat', text: 'noi-dung-rieng-tu-xyz', id: 1 })
      await c.until(() => c.find('chatAck'), 'chat ack')
    }
    await call(quiet, secret, 'POST', '/admin/board', { videos: ['log_video1'], music: [] })
    await call(quiet, 'token-sai-xyz', 'GET', '/admin/status')
    await call(errorOnly, secret, 'POST', '/admin/board', { videos: ['log_video1'], music: [] })
    await sleep(200)

    const q = lines(quiet)
    assert.ok(q.length > 0 && q.every((l) => JSON.parse(l).level), 'mọi dòng là JSON có level')
    assert.ok(!quiet.output().includes('noi-dung-rieng-tu-xyz'), 'mặc định không ghi nội dung chat, kể cả ở mức debug')
    assert.ok(loud.output().includes('noi-dung-rieng-tu-xyz'), 'LOG_CHAT=1 thì có')
    assert.ok(!quiet.output().includes(secret) && !quiet.output().includes('token-sai-xyz'), 'không lộ token')
    assert.ok(q.some((l) => { const o = JSON.parse(l); return o.msg === 'admin' && o.action === 'board.set' && o.ip }), 'hành động admin được ghi log kèm IP')
    assert.ok(q.some((l) => /sai token/.test(JSON.parse(l).msg)), 'sai token được ghi log')
    assert.ok(q.some((l) => /hangmu room/.test(JSON.parse(l).msg)), 'có dòng khởi động')
    assert.ok(!lines(errorOnly).some((l) => JSON.parse(l).level === 'info'), 'LOG_LEVEL=error không in info')
  } finally {
    closeAll()
    for (const server of [quiet, loud, errorOnly]) await server.stop()
  }
})

// ---------------------------------------------------------------- tắt êm
test('SIGTERM: gửi sys, đóng socket mã 1001, ghi dữ liệu chưa kịp ghi, ngừng nhận kết nối, thoát mã 0 nhanh', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hangmu-term-'))
  const server = await startServer({ ADMIN_TOKEN: 'tok-term-0123456789', DATA_DIR: dir })
  try {
    const a = connect(server, 'TermA', { tab: 'tm-a' })
    const b = connect(server, 'TermB', { tab: 'tm-b' })
    await a.admitted()
    await b.admitted()
    // đặt board rồi tắt ngay, trước khi hết thời gian gộp 500 ms: phải được ghi lúc tắt
    await call(server, 'tok-term-0123456789', 'POST', '/admin/board', { videos: ['shutdown_v1'], music: [] })
    const codes = Promise.all([closeCode(a), closeCode(b)])
    const t0 = Date.now()
    const exit = server.stop('SIGTERM')
    assert.deepEqual(await codes, [1001, 1001])
    assert.match((await a.until(() => a.all('sys').at(-1), 'sys')).text, /khởi động lại/)
    const result = await exit
    assert.equal(result.code, 0)
    assert.ok(Date.now() - t0 < 5000, `thoát sau ${Date.now() - t0}ms (giới hạn 10 giây)`)
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).board.videos[0], 'shutdown_v1')
    await assert.rejects(fetch(`${server.url}/healthz`), 'không còn nhận kết nối')
    assert.ok(lines(server).some((l) => /tắt êm: xong/.test(JSON.parse(l).msg)))
  } finally {
    closeAll()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('SIGTERM: client treo không trả lời khung đóng cũng không giữ server lại', async () => {
  const server = await startServer({})
  const socket = net.connect(server.port, '127.0.0.1')
  socket.on('error', () => {})
  let response = ''
  socket.on('data', (chunk) => (response += chunk.toString('latin1')))
  socket.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`)
  await until(() => /101 Switching Protocols/.test(response), { label: 'bắt tay' })
  const t0 = Date.now()
  const result = await server.stop('SIGTERM')
  socket.destroy()
  assert.equal(result.code, 0)
  assert.ok(Date.now() - t0 < 5000, `thoát sau ${Date.now() - t0}ms dù client im lặng`)
})

test('DRAIN_GRACE_MS: trong lúc xả /readyz = 503 và WebSocket mới bị từ chối, /healthz vẫn 200; xong thì thoát mã 0', async () => {
  const server = await startServer({ DRAIN_GRACE_MS: '1500' })
  const ready0 = await fetch(`${server.url}/readyz`)
  assert.equal(ready0.status, 200)
  const exit = server.stop('SIGTERM')
  const t0 = Date.now()
  await until(async () => (await fetch(`${server.url}/readyz`).catch(() => ({ status: 0 }))).status === 503, { timeout: 3000, label: '/readyz chuyển sang 503' })
  assert.equal((await fetch(`${server.url}/healthz`)).status, 200, 'tiến trình vẫn sống trong lúc xả')
  const refused = await new Promise((resolve) => {
    const socket = new WebSocket(server.wsUrl)
    socket.on('unexpected-response', (_req, res) => resolve(res.statusCode))
    socket.on('open', () => resolve('open'))
    socket.on('error', () => {})
  })
  assert.equal(refused, 503, 'kết nối mới bị từ chối khi đang xả')
  const result = await exit
  assert.equal(result.code, 0)
  assert.ok(Date.now() - t0 >= 1400, `chờ hết thời gian xả (${Date.now() - t0}ms)`)
  assert.ok(Date.now() - t0 < 6000)
})
