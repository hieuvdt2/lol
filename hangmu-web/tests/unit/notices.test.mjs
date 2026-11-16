// Thông báo (toast): kiểm tra dữ liệu, câu chữ, gộp, hàng đợi, tạm dừng.
import test from 'node:test'
import assert from 'node:assert/strict'
import { BATCH_FROM, EXPIRE_MS, GAP_MS, MAX_NAMES, MAX_QUEUE, NoticeQueue, RETRY_MS, SHOW_MS, mergeNotices, noticeSegments, noticeSub, parseNotice } from '../../src/game/notices.ts'

const text = (n) => noticeSegments(n).map((s) => s.text).join('')
const bold = (n) => noticeSegments(n).filter((s) => s.bold).map((s) => s.text)
const join = (names, more = 0, kind = 'room_join') => ({ kind, names, more })

test('parseNotice: nhận đúng dữ liệu hợp lệ, từ chối mọi thứ lạ', () => {
  assert.deepEqual(parseNotice({ kind: 'room_join', names: ['An'], more: 0 }), { kind: 'room_join', names: ['An'], more: 0 })
  assert.deepEqual(parseNotice({ kind: 'tele_join', names: [], more: 5 }), { kind: 'tele_join', names: [], more: 5 })
  assert.deepEqual(parseNotice({ kind: 'duel_result', names: ['A', 'B'], result: 'ko', hp: [60, 0] }), { kind: 'duel_result', names: ['A', 'B'], more: 0, result: 'ko', hp: [60, 0] })
  assert.deepEqual(parseNotice({ kind: 'duel_result', names: ['A', 'B'], result: 'draw', hp: [1, 'x'] }).hp, undefined, 'hp hỏng thì bỏ hp, vẫn nhận')
  assert.equal(parseNotice({ kind: 'tele_invite', variant: 2 }).variant, 2)
  for (const bad of [
    {}, { kind: 'khac' }, { kind: 'room_join' }, { kind: 'room_join', names: 'An', more: 1 }, { kind: 'room_join', names: ['A', 'B', 'C'], more: 0 },
    { kind: 'room_join', names: [], more: 0 }, { kind: 'room_join', names: [''], more: 0 }, { kind: 'room_join', names: ['x'.repeat(41)], more: 0 },
    { kind: 'room_join', names: ['A'], more: -1 }, { kind: 'room_join', names: ['A'], more: 1.5 }, { kind: 'room_join', names: ['A'], more: 100001 }, { kind: 'room_join', names: [5], more: 1 },
    { kind: 'duel_result', names: ['A'], result: 'ko' }, { kind: 'duel_result', names: ['A', 'B'], result: 'lạ' }, { kind: 'duel_result', names: ['A', ''], result: 'ko' }, { kind: 'duel_result', names: ['A', 'B'] },
  ]) assert.equal(parseNotice(bad), null, JSON.stringify(bad))
})

test('câu chữ vào hang: một, hai, nhiều người, chỉ có số lượng, gộp từ 10 người', () => {
  assert.equal(text(join(['An'])), 'An vừa mới vào hang, ae giao lưu tí nhỉ')
  assert.equal(text(join(['An', 'Bình'])), 'An và Bình vừa mới vào hang, ae giao lưu tí nhỉ')
  assert.equal(text(join(['An', 'Bình'], 3)), 'An, Bình và 3 anh em khác vừa mới vào hang, ae giao lưu tí nhỉ')
  assert.equal(text(join(['An'], 2)), 'An và 2 anh em khác vừa mới vào hang, ae giao lưu tí nhỉ')
  assert.equal(text(join([], 4)), '4 anh em vừa mới vào hang, ae giao lưu tí nhỉ')
  assert.equal(text(join([], BATCH_FROM - 1)), `${BATCH_FROM - 1} anh em vừa mới vào hang, ae giao lưu tí nhỉ`)
  assert.equal(text(join([], BATCH_FROM)), `🔥 ${BATCH_FROM} anh em vừa vào hang!`)
  assert.equal(text(join(['An', 'Bình'], 8)), '🔥 10 anh em vừa vào hang!', 'tổng tính cả tên')
  assert.equal(text(join(['An'], 0, 'tele_join')), 'An đã tham gia Tele HangMu.online')
  assert.equal(text(join([], 12, 'tele_join')), '🔥 12 anh em vừa vào group Tele!')
  assert.deepEqual(bold(join(['An', 'Bình'], 3)), ['An', 'Bình', '3'], 'tên và số được in đậm')
})

test('câu chữ kết quả võ thuật và lời mời Telegram', () => {
  const d = (result) => ({ kind: 'duel_result', names: ['Thắng', 'Thua'], more: 0, result })
  assert.equal(text(d('ko')), 'Thắng đã đấm vỡ mồm Thua')
  assert.equal(text(d('big')), 'Thắng đã đấm Thua bầm dập')
  assert.equal(text(d('close')), 'Thắng thắng Thua sát nút')
  assert.equal(text(d('draw')), 'Thắng và Thua bất phân thắng bại')
  assert.equal(text(d('quit')), 'Thua bỏ chạy, Thắng thắng')
  for (let v = 0; v < 8; v += 1) assert.match(text({ kind: 'tele_invite', names: [], more: 0, variant: v }), /Tele HangMu/)
  assert.notEqual(text({ kind: 'tele_invite', names: [], more: 0, variant: 0 }), text({ kind: 'tele_invite', names: [], more: 0, variant: 1 }))
})

test('dòng phụ: theo loại; kết quả kèm máu còn lại; bỏ cuộc có câu riêng', () => {
  const title = (r) => ({ ko: 'HẠ ĐO VÁN', big: 'HẾT GIỜ · THẮNG ĐẬM', close: 'X', draw: 'Y', quit: 'Z' }[r])
  assert.equal(noticeSub(join(['A']), title), '', 'lời rủ giao lưu đã nằm trong câu chính')
  assert.match(noticeSub(join(['A'], 0, 'tele_join'), title), /nút ✈/)
  assert.match(noticeSub({ kind: 'tele_invite', names: [], more: 0 }, title), /nút ✈/)
  assert.equal(noticeSub({ kind: 'duel_result', names: ['A', 'B'], more: 0, result: 'ko', hp: [55, 0] }, title), 'Hạ đo ván · 55 – 0')
  assert.equal(noticeSub({ kind: 'duel_result', names: ['A', 'B'], more: 0, result: 'big' }, title), 'Hết giờ · thắng đậm')
  assert.equal(noticeSub({ kind: 'duel_result', names: ['A', 'B'], more: 0, result: 'quit', hp: [30, 10] }, title), 'Bỏ cuộc giữa trận · 30 – 10')
})

test('mergeNotices: giữ tối đa 2 tên đầu, phần còn lại thành "more"', () => {
  assert.deepEqual(mergeNotices(join(['A']), join(['B'])), join(['A', 'B']))
  assert.deepEqual(mergeNotices(join(['A', 'B']), join(['C'])), join(['A', 'B'], 1))
  assert.deepEqual(mergeNotices(join(['A', 'B'], 2), join(['C', 'D'], 1)), join(['A', 'B'], 2 + 1 + 2))
  assert.equal(MAX_NAMES, 2)
})

// ---------- hàng đợi ----------
function harness(over = {}) {
  let t = 1000
  const timers = []
  let hidden = false
  let busy = false
  const q = new NoticeQueue({
    now: () => t,
    setTimer: (fn, ms) => { const h = { fn, at: t + ms }; timers.push(h); return h },
    clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1) },
    isHidden: () => hidden,
    isBusy: () => busy,
    ...over,
  })
  const api = {
    q,
    advance(ms) { const end = t + ms; for (;;) { const due = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); t = Math.max(t, due.at); due.fn() } t = end },
    set hidden(v) { hidden = v },
    set busy(v) { busy = v },
    get timers() { return timers.length },
    shown: () => q.getSnapshot(),
  }
  return api
}

test('hàng đợi: hiện ngay khi rảnh 4,2 s rồi tắt, nghỉ 0,5 s mới hiện cái kế; hết thì dừng', () => {
  const h = harness()
  h.q.push(join(['A']))
  assert.equal(h.shown().names[0], 'A')
  h.q.push({ kind: 'tele_join', names: ['T'], more: 0 })
  assert.equal(h.shown().names[0], 'A', 'chưa tới lượt')
  h.advance(SHOW_MS - 1)
  assert.ok(h.shown() !== null)
  h.advance(1)
  assert.ok(h.shown() === null, 'tắt sau 4,2 s')
  h.advance(GAP_MS - 1)
  assert.ok(h.shown() === null, 'đang nghỉ')
  h.advance(1)
  assert.equal(h.shown().kind, 'tele_join')
  h.advance(SHOW_MS + GAP_MS + 10)
  assert.ok(h.shown() === null)
  assert.equal(h.timers, 0, 'không còn hẹn giờ treo')
})

test('hàng đợi: cùng loại đang chờ thì gộp; id tăng dần; người đăng ký được báo', () => {
  const h = harness()
  let emits = 0
  h.q.subscribe(() => (emits += 1))
  h.q.push({ kind: 'tele_join', names: ['T'], more: 0 }) // hiện ngay
  h.q.push(join(['A']))
  h.q.push(join(['B']))
  h.q.push(join(['C']))
  assert.equal(h.q.length, 1, 'ba thông báo vào hang gộp thành một')
  const first = h.shown().id
  h.advance(SHOW_MS + GAP_MS)
  assert.deepEqual([h.shown().names, h.shown().more], [['A', 'B'], 1])
  assert.ok(h.shown().id > first)
  assert.ok(emits >= 3)
})

test('hàng đợi: tối đa 3; đầy thì bỏ cái cũ không phải kết quả võ thuật; kết quả võ thuật chen lên trước, không gộp', () => {
  const h = harness()
  const duel = (n) => ({ kind: 'duel_result', names: [`W${n}`, `L${n}`], more: 0, result: 'ko' })
  h.q.push(join(['now'])) // đang hiện
  h.q.push({ kind: 'tele_join', names: ['T'], more: 0 })
  h.q.push({ kind: 'tele_invite', names: [], more: 0, variant: 0 })
  h.q.push(duel(1))
  assert.equal(h.q.length, MAX_QUEUE)
  h.q.push(duel(2))
  assert.equal(h.q.length, MAX_QUEUE, 'đầy: bỏ bớt')
  h.advance(SHOW_MS + GAP_MS)
  assert.equal(h.shown().kind, 'duel_result', 'kết quả võ thuật được ưu tiên')
  assert.equal(h.shown().names[0], 'W1')
  h.advance(SHOW_MS + GAP_MS)
  assert.equal(h.shown().names[0], 'W2', 'hai kết quả không gộp')
})

test('hàng đợi: chờ quá 15 giây thì bỏ', () => {
  const h = harness()
  h.q.push(join(['A']))
  h.q.push({ kind: 'tele_join', names: ['T'], more: 0 })
  h.advance(SHOW_MS)
  h.busy = true // bận: không hiện được
  h.advance(GAP_MS + EXPIRE_MS + 1000)
  h.busy = false
  h.advance(RETRY_MS * 2)
  assert.ok(h.shown() === null, 'thông báo chờ quá hạn đã bị bỏ')
  assert.equal(h.q.length, 0)
})

test('hàng đợi: tab ẩn thì không hiện; hiện lại + pump thì hiện', () => {
  const h = harness()
  h.hidden = true
  h.q.push(join(['A']))
  assert.ok(h.shown() === null)
  h.hidden = false
  h.q.pump()
  assert.equal(h.shown().names[0], 'A')
})

test('hàng đợi: bận (đang ăn mừng bàn thắng) thì chờ rồi hiện khi hết bận; hold() trả thông báo đang hiện về hàng đợi', () => {
  const h = harness()
  h.busy = true
  h.q.push(join(['A']))
  assert.ok(h.shown() === null)
  h.advance(RETRY_MS * 3)
  assert.ok(h.shown() === null)
  h.busy = false
  h.advance(RETRY_MS)
  assert.equal(h.shown().names[0], 'A')
  const release = h.q.hold()
  assert.ok(h.shown() === null, 'giữ: ẩn thông báo đang hiện')
  assert.equal(h.q.length, 1, 'và trả về hàng đợi')
  h.advance(10_000)
  assert.ok(h.shown() === null, 'đang giữ thì không hiện')
  release()
  assert.equal(h.shown().names[0], 'A')
  release() // nhả hai lần: không lỗi
  const r1 = h.q.hold()
  const r2 = h.q.hold()
  r1()
  h.advance(SHOW_MS * 2)
  assert.ok(h.shown() === null, 'còn một người giữ')
  r2()
})

test('hold(): thông báo đang hiện cùng loại với cái đang chờ thì gộp, không lặp', () => {
  const h = harness()
  h.q.push(join(['A'])) // hiện
  h.q.push(join(['B'])) // chờ
  const release = h.q.hold()
  assert.equal(h.q.length, 1)
  release()
  assert.deepEqual([h.shown().names, h.shown().more], [['A', 'B'], 0])
})

test('reset(): xoá hết và dừng hẹn giờ', () => {
  const h = harness()
  h.q.push(join(['A']))
  h.q.push({ kind: 'tele_join', names: ['T'], more: 0 })
  h.q.reset()
  assert.ok(h.shown() === null)
  assert.equal(h.q.length, 0)
  assert.equal(h.timers, 0)
  h.advance(60_000)
  assert.ok(h.shown() === null)
})
