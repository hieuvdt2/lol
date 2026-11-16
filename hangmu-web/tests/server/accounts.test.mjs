// Danh tính: cookie hm_sid, /api/me, hạn 14 ngày, tuần thứ Hai.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { DEFAULT_LOOK_CODE as D, encodeLook } from '../../shared/look.mjs'
import { ACCOUNT_TTL_MS, createAccounts, newSid, readCookie, sidCookie, sidFromCookieHeader, validateProfile, validSid, weekStart } from '../../server/lib/accounts.mjs'
import { startServer, until } from '../helpers/server.mjs'
import { closeAll } from '../helpers/wsclient.mjs'

const DAY = 86_400_000

test('validateProfile: tên 1–30 ký tự, số áo 1–99 hoặc trống, đúng kiểu', () => {
  assert.deepEqual(validateProfile({ name: '  Bủ Nô ', number: 7 }), { name: 'Bủ Nô', number: 7, look: D })
  assert.deepEqual(validateProfile({ name: 'A' }), { name: 'A', number: null, look: D })
  assert.deepEqual(validateProfile({ name: 'A', number: null }), { name: 'A', number: null, look: D })
  assert.deepEqual(validateProfile({ name: 'A', number: '' }), { name: 'A', number: null, look: D })
  for (const bad of [null, 'x', [], {}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(31) }, { name: 5 }, { name: 'A', number: 0 }, { name: 'A', number: 100 }, { name: 'A', number: 1.5 }, { name: 'A', number: '7' }, { name: 'A', number: NaN }]) {
    assert.ok('error' in validateProfile(bad), JSON.stringify(bad))
  }
  assert.ok(!('error' in validateProfile({ name: 'x'.repeat(30) })), '30 ký tự là hợp lệ')
  assert.ok(!('error' in validateProfile({ name: '😀'.repeat(30) })), 'đếm theo ký tự, không theo đơn vị UTF-16')
  assert.ok('error' in validateProfile({ name: '😀'.repeat(31) }))
  // hàm chuẩn hoá được dùng: ký tự ẩn bị bỏ trước khi đếm
  assert.ok('error' in validateProfile({ name: '​​' }, (s) => s.replace(/​/g, '')))
})

test('cookie: đọc đúng giá trị, mã sai định dạng bị từ chối, Set-Cookie có HttpOnly', () => {
  const sid = newSid()
  assert.ok(validSid(sid) && sid.length >= 20)
  assert.notEqual(newSid(), newSid())
  assert.equal(readCookie(`a=1; hm_sid=${sid}; b=2`, 'hm_sid'), sid)
  assert.equal(sidFromCookieHeader(`x=1; hm_sid=${sid}`), sid)
  assert.equal(sidFromCookieHeader('hm_sid=ngan'), null)
  assert.equal(sidFromCookieHeader('hm_sid=' + 'a'.repeat(100)), null)
  assert.equal(sidFromCookieHeader('hm_sid=<script>alert(1)</script>aaaaaaaaaaaa'), null)
  assert.equal(sidFromCookieHeader(undefined), null)
  assert.equal(sidFromCookieHeader('x'.repeat(5000)), null)
  const header = sidCookie(sid)
  assert.match(header, /^hm_sid=/)
  assert.match(header, /HttpOnly/)
  assert.match(header, /SameSite=Lax/)
  assert.match(header, new RegExp(`Max-Age=${ACCOUNT_TTL_MS / 1000}`))
  assert.ok(!/Secure/.test(header))
  assert.match(sidCookie(sid, { secure: true }), /; Secure/)
})

test('kho hồ sơ: hết hạn đúng 14 ngày kể từ lần vào gần nhất; touch gia hạn; prune dọn', () => {
  const a = createAccounts()
  const t0 = 1_000_000
  a.save('s'.repeat(24), { name: 'A', number: 3 }, t0)
  assert.deepEqual(a.get('s'.repeat(24), t0 + 14 * DAY - 1), { name: 'A', number: 3, look: D })
  assert.equal(a.get('s'.repeat(24), t0 + 14 * DAY), null, 'hết hạn')
  a.touch('s'.repeat(24), t0 + 10 * DAY)
  assert.deepEqual(a.get('s'.repeat(24), t0 + 20 * DAY), { name: 'A', number: 3, look: D }, 'gia hạn từ lần vào sau')
  a.touch('x'.repeat(24), t0) // không tồn tại: không lỗi, không tạo
  assert.equal(a.size, 1)
  assert.equal(a.prune(t0 + 30 * DAY), 1)
  assert.equal(a.size, 0)
})

test('kho hồ sơ: giới hạn số lượng bỏ bản lâu không vào nhất; xuất/nhập giữ nguyên và bỏ hàng hỏng', () => {
  const a = createAccounts({ max: 3 })
  for (let i = 0; i < 5; i += 1) a.save(String(i).repeat(24), { name: `N${i}`, number: null }, 1000 + i)
  assert.equal(a.size, 3)
  assert.equal(a.get('0'.repeat(24), 1010), null, 'cũ nhất bị bỏ')
  assert.deepEqual(a.get('4'.repeat(24), 1010), { name: 'N4', number: null, look: D })
  const b = createAccounts()
  b.import([...a.export(), 'rác', null, ['ngan', 'X', 1, 1], ['q'.repeat(24), 5, 1, 1], ['q'.repeat(24), 'X', 1, 'abc']], 1010)
  assert.equal(b.size, 3)
  assert.deepEqual(b.get('4'.repeat(24), 1010), { name: 'N4', number: null, look: D })
  b.import([['z'.repeat(24), 'Hết hạn', 1, 1010 - ACCOUNT_TTL_MS - 1]], 1010)
  assert.equal(b.get('z'.repeat(24), 1010), null, 'bản ghi đã quá hạn khi nhập thì bỏ')
})

test('weekStart: thứ Hai 00:00 giờ Việt Nam; mọi ngày trong tuần cùng một mốc; sang thứ Hai mốc mới', () => {
  // 2026-11-09 là thứ Hai. 00:00 UTC+7 = 17:00 UTC ngày hôm trước.
  const monday = Date.UTC(2026, 10, 8, 17, 0, 0)
  assert.equal(weekStart(monday), monday)
  assert.equal(weekStart(monday + 6 * DAY + 16 * 3_600_000), monday, 'tới Chủ nhật 23:00 vẫn cùng tuần')
  assert.equal(weekStart(monday - 1), monday - 7 * DAY, 'trước 00:00 thứ Hai thuộc tuần trước')
  assert.equal(weekStart(monday + 7 * DAY), monday + 7 * DAY)
  const wed = Date.UTC(2026, 10, 11, 5, 0, 0)
  assert.equal(weekStart(wed), monday)
})

// ---------- server thật ----------
const servers = {}
before(async () => {
  servers.main = await startServer({ BOTS: '0' }, { ready: 'http' })
})
after(async () => {
  closeAll()
  for (const s of Object.values(servers)) await s.stop()
})

const cookieOf = (res) => (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('hm_sid='))

test('GET /api/me chưa có cookie → null', async () => {
  const res = await fetch(servers.main.url + '/api/me')
  assert.equal(res.status, 200)
  assert.equal(await res.json(), null)
})

test('POST /api/me lưu hồ sơ, cấp cookie HttpOnly; GET với cookie đó trả lại hồ sơ; cookie lạ thì null', async () => {
  const res = await fetch(servers.main.url + '/api/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: ' Mắc Gai ', number: 11 }) })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { name: 'Mắc Gai', number: 11, look: D })
  const setCookie = res.headers.getSetCookie().join('\n')
  assert.match(setCookie, /hm_sid=[A-Za-z0-9_-]{20,}/)
  assert.match(setCookie, /HttpOnly/i)
  const cookie = cookieOf(res)
  const got = await (await fetch(servers.main.url + '/api/me', { headers: { cookie } })).json()
  assert.deepEqual(got, { name: 'Mắc Gai', number: 11, look: D })
  const other = await (await fetch(servers.main.url + '/api/me', { headers: { cookie: 'hm_sid=' + 'a'.repeat(32) } })).json()
  assert.equal(other, null)
  // POST lần hai với cookie: đổi tên, không cấp mã mới (vẫn người đó)
  const again = await fetch(servers.main.url + '/api/me', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ name: 'Đờ Lít' }) })
  assert.deepEqual(await again.json(), { name: 'Đờ Lít', number: null, look: D })
  assert.equal(cookieOf(again), cookie, 'giữ nguyên mã người dùng')
  assert.deepEqual(await (await fetch(servers.main.url + '/api/me', { headers: { cookie } })).json(), { name: 'Đờ Lít', number: null, look: D })
})

test('POST /api/me từ chối dữ liệu xấu: tên sai, số áo sai, JSON hỏng, thân quá lớn, phương thức lạ', async () => {
  const post = (body, raw = false) => fetch(servers.main.url + '/api/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? body : JSON.stringify(body) })
  for (const bad of [{ name: '' }, { name: 'x'.repeat(31) }, { name: 'A', number: 100 }, { name: 'A', number: 'bảy' }, 'chuỗi', null]) {
    const res = await post(bad)
    assert.equal(res.status, 400, JSON.stringify(bad))
    assert.equal(typeof (await res.json()).error, 'string')
    assert.equal(cookieOf(res), undefined, 'không cấp cookie khi dữ liệu sai')
  }
  assert.equal((await post('{không phải json', true)).status, 400)
  const big = await post(JSON.stringify({ name: 'A', pad: 'x'.repeat(5000) }), true).catch(() => null)
  assert.ok(big === null || big.status === 400, 'thân quá lớn không được nhận')
  const del = await fetch(servers.main.url + '/api/me', { method: 'DELETE' })
  assert.equal(del.status, 405)
})

test('POST /api/me chặn Origin lạ (CSRF); bị giới hạn tần suất theo IP', async () => {
  const evil = await fetch(servers.main.url + '/api/me', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ name: 'A' }) })
  assert.equal(evil.status, 403)
  const s = await startServer({ BOTS: '0' }, { ready: 'http' })
  try {
    let limited = 0
    for (let i = 0; i < 30; i += 1) {
      const r = await fetch(s.url + '/api/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'A' }) })
      if (r.status === 429) limited += 1
    }
    assert.ok(limited >= 5, `bị giới hạn ${limited} lần`)
  } finally {
    await s.stop()
  }
})

/** Mở WS, trả { ws, setCookie, messages } sau khi bắt tay xong. */
function openWs(server, cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(server.wsUrl, { headers: cookie ? { cookie } : {} })
    const messages = []
    let setCookie = null
    ws.on('upgrade', (res) => (setCookie = (res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('hm_sid=')) ?? null))
    ws.on('message', (data, isBinary) => {
      if (!isBinary) messages.push(JSON.parse(data.toString()))
    })
    ws.on('open', () => resolve({ ws, messages, get setCookie() { return setCookie } }))
    ws.on('error', reject)
  })
}

test('WebSocket: không có cookie thì bắt tay cấp hm_sid mới; có cookie hợp lệ thì không cấp lại', async () => {
  const a = await openWs(servers.main)
  assert.match(a.setCookie ?? '', /^hm_sid=[A-Za-z0-9_-]{20,}$/)
  const b = await openWs(servers.main, a.setCookie)
  assert.equal(b.setCookie, null, 'đã có mã thì không cấp lại')
  const c = await openWs(servers.main, 'hm_sid=ngan')
  assert.match(c.setCookie ?? '', /^hm_sid=/, 'mã sai định dạng bị thay')
  for (const x of [a, b, c]) x.ws.terminate()
})

test('vào hang lưu hồ sơ theo mã người dùng → GET /api/me thấy tên + số áo vừa dùng; đổi tên khi vào lại thì cập nhật', async () => {
  const a = await openWs(servers.main)
  const cookie = a.setCookie
  a.ws.send(JSON.stringify({ t: 'enter', name: 'Cún Nha', number: 5, tab: 'tab-acc-1' }))
  await until(() => a.messages.find((m) => m.t === 'admitted'), { label: 'được nhận' })
  assert.deepEqual(await (await fetch(servers.main.url + '/api/me', { headers: { cookie } })).json(), { name: 'Cún Nha', number: 5, look: D })
  a.ws.terminate()
  const b = await openWs(servers.main, cookie)
  b.ws.send(JSON.stringify({ t: 'enter', name: 'Mây Sơn', tab: 'tab-acc-2' }))
  await until(() => b.messages.find((m) => m.t === 'admitted'), { label: 'được nhận lại' })
  assert.deepEqual(await (await fetch(servers.main.url + '/api/me', { headers: { cookie } })).json(), { name: 'Mây Sơn', number: null, look: D })
  b.ws.terminate()
})

test('hồ sơ sống sót qua khởi động lại server (lưu bền vững) và không lộ mã người dùng cho người khác', async () => {
  const dir = (await import('node:fs')).default.mkdtempSync((await import('node:path')).default.join((await import('node:os')).default.tmpdir(), 'hm-acc-'))
  let s = await startServer({ BOTS: '0', DATA_DIR: dir }, { ready: 'http' })
  const res = await fetch(s.url + '/api/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Bền', number: 9 }) })
  const cookie = cookieOf(res)
  await s.stop() // tắt êm → ghi tệp
  s = await startServer({ BOTS: '0', DATA_DIR: dir }, { ready: 'http' })
  try {
    assert.deepEqual(await (await fetch(s.url + '/api/me', { headers: { cookie } })).json(), { name: 'Bền', number: 9, look: D })
    const roster = await openWs(s)
    roster.ws.send(JSON.stringify({ t: 'enter', name: 'Người khác', tab: 'tab-acc-3' }))
    await until(() => roster.messages.find((m) => m.t === 'admitted'), { label: 'được nhận' })
    assert.ok(!JSON.stringify(roster.messages).includes(cookie.split('=')[1]), 'không gửi mã người dùng cho ai')
    roster.ws.terminate()
  } finally {
    await s.stop()
    ;(await import('node:fs')).default.rmSync(dir, { recursive: true, force: true })
  }
})

test('hồ sơ lưu cả mã ngoại hình: hợp lệ thì giữ, sai thì về mặc định; xuất/nhập giữ nguyên; hồ sơ cũ (4 cột, không có ngoại hình) nhập được', () => {
  const look = encodeLook({ team: 6, skin: 3, hair: 2, hairColor: 4 })
  assert.deepEqual(validateProfile({ name: 'A', number: 7, look }), { name: 'A', number: 7, look })
  assert.equal(validateProfile({ name: 'A', look: 99999 }).look, D)
  assert.equal(validateProfile({ name: 'A', look: 'x' }).look, D)
  const a = createAccounts()
  a.save('k'.repeat(24), { name: 'K', number: null, look }, 1000)
  assert.equal(a.get('k'.repeat(24), 1001).look, look)
  const b = createAccounts()
  b.import([...a.export(), ['o'.repeat(24), 'Cũ', 3, 1000]], 1001)
  assert.equal(b.get('k'.repeat(24), 1002).look, look)
  assert.deepEqual(b.get('o'.repeat(24), 1002), { name: 'Cũ', number: 3, look: D }, 'bản ghi cũ không có cột ngoại hình')
})
