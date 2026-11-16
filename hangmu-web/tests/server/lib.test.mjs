// Các module nhỏ của server: log, lưu trữ nguyên tử, kiểm tra dữ liệu quản trị.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanNotice, cleanPoll, cleanSysText, normalizeIds } from '../../server/lib/ids.mjs'
import { createLogger } from '../../server/lib/log.mjs'
import { createStore } from '../../server/lib/store.mjs'
import { sleep } from '../helpers/server.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hangmu-lib-'))
const silent = { error() {}, info() {}, debug() {} }

test('log: mỗi sự kiện một dòng JSON, lọc theo mức, trường tùy ý không ghi đè level/msg', () => {
  const lines = []
  const info = createLogger('info', (l) => lines.push(l))
  info.debug('ẩn')
  info.info('thấy', { level: 'giả', msg: 'giả', a: 1 })
  info.error('lỗi')
  assert.equal(lines.length, 2)
  const first = JSON.parse(lines[0])
  assert.deepEqual([first.level, first.msg, first.a], ['info', 'thấy', 1])
  assert.ok(!Number.isNaN(Date.parse(first.time)))
  const quiet = []
  createLogger('error', (l) => quiet.push(l)).info('không thấy')
  assert.equal(quiet.length, 0)
  assert.equal(createLogger('lung-tung').level, 'info', 'mức lạ rơi về info')
})

test('ids: loại trùng giữ thứ tự, đếm mục sai, cắt ở 200', () => {
  assert.deepEqual(normalizeIds(['abcdef', 'abcdef', 'ghijkl']).ids, ['abcdef', 'ghijkl'])
  assert.equal(normalizeIds(['abcde']).invalid, 1, 'ngắn hơn 6 ký tự')
  assert.equal(normalizeIds(['a'.repeat(21)]).invalid, 1, 'dài hơn 20 ký tự')
  assert.equal(normalizeIds(['abc def', 'abc/def', '<script>']).invalid, 3)
  assert.equal(normalizeIds('abcdef').invalid, 1, 'không phải mảng')
  assert.equal(normalizeIds([123456, null]).invalid, 2)
  const many = Array.from({ length: 250 }, (_, i) => `id${String(i).padStart(5, '0')}`)
  const r = normalizeIds(many)
  assert.equal(r.ids.length, 200)
  assert.equal(r.truncated, true)
  assert.equal(r.ids[0], 'id00000')
})

test('ids: văn bản hệ thống, notice và poll', () => {
  assert.equal(cleanSysText('  a \r\n\n b\u0007 ').text, 'a\nb')
  assert.ok(cleanSysText('').error && cleanSysText(5).error && cleanSysText('   \n  ').error)
  assert.ok(cleanSysText(Array.from({ length: 31 }, (_, i) => `d${i}`).join('\n')).error, '31 dòng')
  assert.equal(cleanSysText(Array.from({ length: 30 }, (_, i) => `d${i}`).join('\n')).error, undefined, '30 dòng')
  assert.ok(cleanSysText('x'.repeat(301)).error)

  assert.deepEqual(cleanNotice({ kind: 'tele_join', names: ['An'], more: 3 }).notice, { t: 'notice', kind: 'tele_join', names: ['An'], more: 3 })
  assert.equal(cleanNotice({ kind: 'room_join', names: ['An', 'Bình'] }).notice.more, 0)
  for (const bad of [null, { kind: 'x', names: ['a'] }, { kind: 'tele_join', names: ['a', 'b', 'c'] }, { kind: 'tele_join', names: [] }, { kind: 'tele_join', names: [''] }, { kind: 'tele_join', names: ['a'], more: -1 }, { kind: 'tele_join', names: ['a'], more: 1.5 }, { kind: 'tele_join', names: ['a'], more: 1e6 }, { kind: 'tele_join', names: ['x'.repeat(41)] }]) {
    assert.ok(cleanNotice(bad).error, JSON.stringify(bad))
  }

  assert.deepEqual(cleanPoll({ q: ' Ai thắng? ', options: ['A', 'B'] }), { q: 'Ai thắng?', options: ['A', 'B'] })
  for (const bad of [{}, { q: '', options: ['A', 'B'] }, { q: 'x', options: ['A'] }, { q: 'x', options: Array(7).fill('o').map((o, i) => o + i) }, { q: 'x', options: ['A', 'A'] }, { q: 'x', options: ['A', ''] }, { q: 'x'.repeat(201), options: ['A', 'B'] }]) {
    assert.ok(cleanPoll(bad).error, JSON.stringify(bad))
  }
})

test('store: ghi nguyên tử, không để tệp tạm, gộp nhiều thay đổi thành một lần ghi', async () => {
  const dir = tmp()
  let writes = 0
  let value = 1
  const store = createStore({ dir, log: silent, debounceMs: 80, getState: () => ((writes += 1), { value }) })
  store.schedule()
  value = 2
  store.schedule()
  value = 3
  store.schedule()
  assert.equal(fs.existsSync(store.target), false, 'chưa ghi trước khi hết thời gian gộp')
  await sleep(250)
  assert.equal(writes, 1, 'ba thay đổi gộp thành một lần ghi')
  assert.equal(JSON.parse(fs.readFileSync(store.target, 'utf8')).value, 3, 'ghi giá trị mới nhất')
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), [], 'không còn tệp tạm')
  assert.equal(store.flush(), false, 'không có thay đổi thì flush không ghi')
  value = 4
  store.schedule()
  assert.equal(store.flush(), true, 'flush ghi ngay')
  assert.equal(JSON.parse(fs.readFileSync(store.target, 'utf8')).value, 4)
  assert.equal(writes, 2)
})

test('store: nạp lại đúng; tệp hỏng được giữ lại và bắt đầu trống; thư mục không ghi được thì chạy tiếp', () => {
  const dir = tmp()
  const a = createStore({ dir, log: silent, getState: () => ({ x: [1, 2, 3] }) })
  a.schedule()
  a.flush()
  const b = createStore({ dir, log: silent, getState: () => ({}) })
  assert.deepEqual(b.load().x, [1, 2, 3])

  fs.writeFileSync(b.target, '{ không phải json')
  const errors = []
  const c = createStore({ dir, log: { ...silent, error: (m) => errors.push(m) }, getState: () => ({}) })
  assert.equal(c.load(), null)
  assert.equal(errors.length, 1)
  assert.ok(fs.readdirSync(dir).some((f) => f.includes('.corrupt-')), 'tệp hỏng được giữ lại để điều tra')
  fs.writeFileSync(b.target, '[1,2]')
  assert.equal(createStore({ dir, log: silent, getState: () => ({}) }).load(), null, 'JSON hợp lệ nhưng không phải đối tượng')

  const blocker = path.join(dir, 'blocker')
  fs.writeFileSync(blocker, 'là tệp, không phải thư mục')
  const blocked = createStore({ dir: path.join(blocker, 'x'), log: { ...silent, error: (m) => errors.push(m) }, getState: () => ({}) })
  assert.equal(blocked.enabled, false)
  blocked.schedule()
  assert.equal(blocked.flush(), false)
  assert.equal(blocked.load(), null)
})
