// Bảng "Võ công cao nhất hang": theo mã người dùng, theo tuần, top 8.
import test from 'node:test'
import assert from 'node:assert/strict'
import { LADDER_KEEP_MS, LADDER_TOP, createLadder } from '../../server/lib/ladder.mjs'
import { weekStart } from '../../server/lib/accounts.mjs'
import { startServer, until } from '../helpers/server.mjs'
import { closeAll, connect } from '../helpers/wsclient.mjs'

const DAY = 86_400_000
const sid = (c) => String(c).repeat(24)
const MON = Date.UTC(2026, 10, 8, 17, 0, 0) // thứ Hai 9/11/2026 00:00 giờ Việt Nam

test('đếm thắng theo mã người dùng, không theo tên: hai người cùng tên là hai dòng; đổi tên thì dòng đó đổi tên', () => {
  const l = createLadder()
  l.win(sid('a'), 'Mắc Gai', MON + 1000)
  l.win(sid('b'), 'Mắc Gai', MON + 2000)
  l.win(sid('a'), 'Mắc Gai', MON + 3000)
  assert.deepEqual(l.top(8, MON + 4000), [['Mắc Gai', 2], ['Mắc Gai', 1]])
  l.win(sid('a'), 'Tên Mới', MON + 5000)
  assert.deepEqual(l.top(8, MON + 6000)[0], ['Tên Mới', 3])
})

test('sắp xếp: nhiều thắng trước; bằng nhau thì ai đạt sớm hơn xếp trước; chỉ lấy top 8', () => {
  const l = createLadder()
  for (let i = 0; i < 12; i += 1) l.win(sid(i), `N${i}`, MON + 1000 + i)
  l.win(sid(5), 'N5', MON + 5000)
  l.win(sid(5), 'N5', MON + 5001)
  l.win(sid(9), 'N9', MON + 6000)
  const top = l.top(LADDER_TOP, MON + 7000)
  assert.equal(top.length, 8)
  assert.deepEqual(top.slice(0, 3), [['N5', 3], ['N9', 2], ['N0', 1]])
  assert.deepEqual(top.slice(3).map((r) => r[0]), ['N1', 'N2', 'N3', 'N4', 'N6'])
})

test('sang tuần mới: bảng trống, và người thắng lại bắt đầu từ 1', () => {
  const l = createLadder()
  l.win(sid('a'), 'A', MON + DAY)
  l.win(sid('a'), 'A', MON + 2 * DAY)
  assert.deepEqual(l.top(8, MON + 6 * DAY + 16 * 3_600_000), [['A', 2]], 'Chủ nhật 23:00 vẫn tuần này')
  assert.deepEqual(l.top(8, MON + 7 * DAY), [], 'thứ Hai 00:00 bảng làm mới')
  assert.equal(l.win(sid('a'), 'A', MON + 7 * DAY + 1000), 1)
  assert.deepEqual(l.top(8, MON + 7 * DAY + 2000), [['A', 1]])
})

test('thứ Hai theo múi giờ cấu hình: offset khác thì mốc khác', () => {
  const l = createLadder({ offsetHours: 0 })
  const utcMon = Date.UTC(2026, 10, 9, 0, 0, 0)
  l.win(sid('a'), 'A', utcMon - 1000)
  assert.deepEqual(l.top(8, utcMon + 1000), [], 'UTC: qua 00:00 thứ Hai là tuần mới')
  assert.equal(weekStart(utcMon, 0), utcMon)
})

test('prune xoá bản ghi quá ~8 ngày kể từ trận thắng gần nhất', () => {
  const l = createLadder()
  l.win(sid('a'), 'A', MON)
  l.win(sid('b'), 'B', MON + 5 * DAY)
  assert.equal(l.prune(MON + LADDER_KEEP_MS), 0)
  assert.equal(l.prune(MON + LADDER_KEEP_MS + 1), 1)
  assert.equal(l.size, 1)
})

test('giới hạn số người: đầy thì bỏ tuần cũ/ít thắng nhất, không bao giờ bỏ người vừa thắng', () => {
  const l = createLadder({ max: 3 })
  l.win(sid('a'), 'A', MON)
  l.win(sid('a'), 'A', MON + 1)
  l.win(sid('b'), 'B', MON + 2)
  l.win(sid('c'), 'C', MON + 3)
  l.win(sid('d'), 'D', MON + 4)
  assert.equal(l.size, 3)
  const names = l.top(8, MON + 5).map((r) => r[0])
  assert.ok(names.includes('A') && names.includes('D'), names.join())
  assert.ok(!names.includes('B'), 'B ít thắng và cũ nhất bị bỏ')
  // sang tuần mới: bản ghi tuần trước bị bỏ trước
  l.win(sid('e'), 'E', MON + 8 * DAY)
  assert.ok(l.top(8, MON + 8 * DAY + 1).some((r) => r[0] === 'E'))
  assert.equal(l.size, 3)
})

test('xuất/nhập giữ nguyên; bỏ hàng hỏng, mã sai, quá hạn; nhập vượt max thì cắt', () => {
  const l = createLadder()
  l.win(sid('a'), 'A', MON + 1000)
  l.win(sid('b'), 'B', MON + 2000)
  const m = createLadder()
  m.import([...l.export(), null, 'x', ['ngan', 'X', 1, MON, MON], [sid('c'), '', 1, MON, MON], [sid('d'), 'D', 0, MON, MON], [sid('e'), 'E', 'x', MON, MON], [sid('f'), 'F', 1, MON, MON - 20 * DAY]], MON + 3000)
  assert.deepEqual(m.top(8, MON + 3000), [['A', 1], ['B', 1]])
  const small = createLadder({ max: 1 })
  small.import(l.export(), MON + 3000)
  assert.equal(small.size, 1)
})

// ---------- server thật ----------
async function duelWin(server, winnerName, loserName, tag) {
  const winner = connect(server, winnerName, { tab: `lad-w-${tag}` })
  const loser = connect(server, loserName, { tab: `lad-l-${tag}` })
  await winner.admitted()
  const li = (await loser.admitted()).selfIndex
  winner.send({ t: 'inviteAsk', kind: 'duel', target: li })
  const inv = await loser.until(() => loser.find('invite'), 'mời')
  loser.send({ t: 'inviteAnswer', id: inv.id, accept: true })
  await winner.until(() => winner.game('duel').some((d) => d.a === 'go'), 'go')
  loser.send({ t: 'game', g: 'duel', d: { a: 'quit' } })
  await winner.until(() => winner.game('duel').some((d) => d.a === 'end'), 'end')
  return { winner, loser }
}

test('server: thắng duel hiện trong bảng cho người vào sau; hai người cùng tên thắng riêng vẫn là hai dòng', async () => {
  const server = await startServer({ BOTS: '0', DUEL_COUNTDOWN_MS: '200' })
  try {
    const a = await duelWin(server, 'TrùngTên', 'Thua1', 'a')
    a.winner.send({ t: 'leave' }); a.loser.send({ t: 'leave' })
    const b = await duelWin(server, 'TrùngTên', 'Thua2', 'b')
    const obs = connect(server, 'Xem', { tab: 'lad-x' })
    await obs.admitted()
    const rank = await obs.until(() => obs.game('duel').find((d) => d.a === 'rank'), 'rank')
    assert.deepEqual(rank.top, [['TrùngTên', 1], ['TrùngTên', 1]])
    void b
  } finally {
    closeAll()
    await server.stop()
  }
})

test('server: qua thứ Hai bảng được làm mới và báo cho người đang trong hang (mốc tuần đặt cách 3 giây)', async () => {
  // offset sao cho "thứ Hai 00:00" rơi vào ~3 giây nữa
  const H = 3_600_000
  const need = ((4 * DAY - Date.now() - 3000) % (7 * DAY) + 7 * DAY) % (7 * DAY)
  const server = await startServer({ BOTS: '0', DUEL_COUNTDOWN_MS: '200', WEEK_OFFSET_HOURS: String(need / H), RANK_CHECK_MS: '300' })
  try {
    const { winner } = await duelWin(server, 'Tuan', 'Thua', 'wk')
    const before = winner.game('duel').filter((d) => d.a === 'rank')
    assert.ok(before.at(-1)?.top.some(([n]) => n === 'Tuan'), 'trong tuần: có tên')
    await until(() => winner.game('duel').filter((d) => d.a === 'rank').at(-1)?.top.length === 0, { timeout: 8000, label: 'bảng được làm mới sau mốc tuần' })
  } finally {
    closeAll()
    await server.stop()
  }
})
