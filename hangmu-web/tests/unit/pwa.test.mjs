import test from 'node:test'
import assert from 'node:assert/strict'
import { sleep } from '../helpers/server.mjs'
import { BUILD_ID, checkForUpdate, watchForUpdate } from '../../src/version.ts'
import { detectPlatform, installSteps } from '../../src/install.ts'

const ok = (body) => async () => ({ ok: true, json: async () => body })

test('BUILD_ID là "dev" khi chạy ngoài Vite', () => assert.equal(BUILD_ID, 'dev'))

test('checkForUpdate: chỉ true khi server báo mã khác bản đang chạy', async () => {
  assert.equal(await checkForUpdate(ok({ id: 'abc' }), 'abc'), false)
  assert.equal(await checkForUpdate(ok({ id: 'xyz' }), 'abc'), true)
})

test('checkForUpdate: dev server (không có version.json) và mọi lỗi đều là "không biết"', async () => {
  let called = false
  assert.equal(await checkForUpdate(async () => ((called = true), { ok: true, json: async () => ({ id: 'x' }) }), 'dev'), false)
  assert.equal(called, false, 'ở chế độ dev không được gọi mạng')
  assert.equal(await checkForUpdate(async () => ({ ok: false, json: async () => ({ id: 'x' }) }), 'abc'), false)
  assert.equal(await checkForUpdate(async () => ({ ok: true, json: async () => { throw new Error('HTML, không phải JSON') } }), 'abc'), false)
  assert.equal(await checkForUpdate(async () => { throw new Error('mất mạng') }, 'abc'), false)
  for (const body of [{}, { id: '' }, { id: 5 }, null]) assert.equal(await checkForUpdate(ok(body), 'abc'), false, JSON.stringify(body))
})

test('checkForUpdate: tránh cache (no-store + tham số chống cache)', async () => {
  let seen
  await checkForUpdate(async (url, init) => ((seen = { url, init }), { ok: true, json: async () => ({ id: 'abc' }) }), 'abc')
  assert.match(seen.url, /^\/version\.json\?ts=\d+$/)
  assert.deepEqual(seen.init, { cache: 'no-store' })
})

function fakeDocument() {
  const listeners = new Map()
  globalThis.document = {
    hidden: false,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  }
  return listeners
}

test('watchForUpdate: bản mới thì gọi onNew đúng một lần rồi ngừng hỏi server và gỡ sự kiện', async () => {
  const listeners = fakeDocument()
  let fetches = 0
  let notified = 0
  watchForUpdate(() => (notified += 1), 15, async () => ((fetches += 1), { ok: true, json: async () => ({ id: 'moi' }) }), 'cu')
  await sleep(120)
  assert.equal(notified, 1, 'chỉ báo một lần')
  const after = fetches
  await sleep(100)
  assert.equal(fetches, after, 'đã báo thì không hỏi server nữa')
  assert.equal(listeners.size, 0, 'đã gỡ visibilitychange')
})

test('watchForUpdate: cùng mã thì không bao giờ báo, vẫn tiếp tục hỏi định kỳ', async () => {
  fakeDocument()
  let fetches = 0
  let notified = 0
  const stop = watchForUpdate(() => (notified += 1), 15, async () => ((fetches += 1), { ok: true, json: async () => ({ id: 'cu' }) }), 'cu')
  await sleep(100)
  assert.equal(notified, 0)
  assert.ok(fetches >= 3, `hỏi định kỳ: ${fetches} lần`)
  stop()
})

test('watchForUpdate: hàm dừng chặn cả thông báo lẫn việc hỏi tiếp', async () => {
  const listeners = fakeDocument()
  let fetches = 0
  let notified = 0
  const stop = watchForUpdate(() => (notified += 1), 15, async () => ((fetches += 1), { ok: true, json: async () => ({ id: 'moi' }) }), 'cu')
  stop()
  const before = fetches
  await sleep(80)
  assert.equal(notified, 0)
  assert.equal(fetches, before)
  assert.equal(listeners.size, 0)
})

test('watchForUpdate: tab hiện lại thì kiểm tra ngay; tab đang ẩn thì không', async () => {
  const listeners = fakeDocument()
  let fetches = 0
  const stop = watchForUpdate(() => {}, 60_000, async () => ((fetches += 1), { ok: true, json: async () => ({ id: 'cu' }) }), 'cu')
  globalThis.document.hidden = true
  listeners.get('visibilitychange')()
  await sleep(20)
  assert.equal(fetches, 0, 'ẩn thì bỏ qua')
  globalThis.document.hidden = false
  listeners.get('visibilitychange')()
  await sleep(20)
  assert.equal(fetches, 1, 'hiện lại thì kiểm tra ngay, không chờ hết chu kỳ')
  stop()
})

test('detectPlatform: iOS (Safari, Chrome, trình duyệt khác, iPad chế độ máy tính), Android, máy tính', () => {
  const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const iphoneChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1'
  const iphoneFirefox = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15'
  const macSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
  const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  assert.equal(detectPlatform(iphoneSafari), 'ios-safari')
  assert.equal(detectPlatform(iphoneChrome), 'ios-chrome')
  assert.equal(detectPlatform(iphoneFirefox), 'ios-other')
  assert.equal(detectPlatform(macSafari, 'MacIntel', 5), 'ios-safari', 'iPad ở chế độ trang web máy tính giả làm Mac nhưng có đa chạm')
  assert.equal(detectPlatform(macSafari, 'MacIntel', 0), 'desktop')
  assert.equal(detectPlatform(android), 'android')
  assert.equal(detectPlatform(windows, 'Win32', 0), 'desktop')
})

test('installSteps: mỗi nền tảng có hướng dẫn riêng, đủ bước, iOS nhắc đúng tên mục', () => {
  const all = ['ios-safari', 'ios-chrome', 'ios-other', 'android', 'desktop']
  const seen = new Set()
  for (const platform of all) {
    const steps = installSteps(platform)
    assert.ok(steps.length >= 2 && steps.every((s) => s.trim().length > 10), platform)
    seen.add(steps.join('|'))
  }
  assert.equal(seen.size, all.length, 'mỗi nền tảng có nội dung khác nhau')
  assert.match(installSteps('ios-safari').join(' '), /Thêm vào Màn hình chính/)
})
