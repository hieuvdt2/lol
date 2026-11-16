// Server: trò "Bẫy Độc Noxus" — mời, giấu nấm, dò đường theo lượt, thắng/thua, thông báo cho cả hang.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startServer } from '../helpers/server.mjs'
import { closeAll, connect } from '../helpers/wsclient.mjs'
import { TRAP, cellOf } from '../../shared/trap.mjs'

let server
before(async () => {
  server = await startServer({ CAPACITY: '50', BOTS: '0', TRAP_PLACE_MS: '3000', TRAP_TURN_MS: '2500', TRAP_REVEAL_MS: '0' })
})
after(async () => {
  closeAll()
  await server.stop()
})

async function startTrap(names) {
  const a = connect(server, names[0], { tab: `${names[0]}-t` })
  const b = connect(server, names[1], { tab: `${names[1]}-t` })
  const ai = (await a.admitted()).selfIndex
  const bi = (await b.admitted()).selfIndex
  a.send({ t: 'inviteAsk', kind: 'trap', target: bi })
  const invite = await b.until(() => b.find('invite'), 'lời mời')
  assert.equal(invite.kind, 'trap')
  b.send({ t: 'inviteAnswer', id: invite.id, accept: true })
  await a.until(() => a.game('trap').some((d) => d.a === 'start'), 'start A')
  await b.until(() => b.game('trap').some((d) => d.a === 'start'), 'start B')
  return { a, b, ai, bi }
}
const SAFE_COL0 = [cellOf(0, 1), cellOf(1, 1), cellOf(2, 1), cellOf(3, 1), cellOf(4, 1)] // cột 0 an toàn cả đường
const TRAP_COL0 = [cellOf(0, 0), cellOf(1, 0), cellOf(2, 0), cellOf(3, 0), cellOf(4, 0)] // cột 0 toàn nấm (5 hàng đầu)

test('trap: mời → start đúng luật, cả hai "bận"; cắm sai luật bị từ chối; giấu xong hết thì bắt đầu dò đường ngay, mỗi người biết nấm mình đã cắm', async () => {
  const { a, b, ai, bi } = await startTrap(['NamA', 'NamB'])
  const start = a.game('trap').find((d) => d.a === 'start')
  assert.equal(start.peer, bi)
  assert.equal(start.rules.rows, TRAP.rows)
  assert.equal(start.rules.mushrooms, 5)
  assert.ok(a.json.some((m) => m.t === 'engaged' && m.on?.some(([i, k]) => i === bi && k === 'trap')), 'engaged trap')
  a.send({ t: 'game', g: 'trap', d: { a: 'place', cells: [0, 1, 2, 4, 6] } }) // 2 nấm hàng 0 (chặn hết lối)
  await a.until(() => a.game('trap').some((d) => d.a === 'placeRejected'), 'từ chối cắm sai luật')
  a.send({ t: 'game', g: 'trap', d: { a: 'place', cells: TRAP_COL0 } }) // lên đường của B
  await b.until(() => b.game('trap').some((d) => d.a === 'ready' && d.by === ai), 'B biết A đã giấu xong')
  b.send({ t: 'game', g: 'trap', d: { a: 'place', cells: TRAP_COL0 } }) // lên đường của A
  const walkA = await a.until(() => a.game('trap').find((d) => d.a === 'walk'), 'walk A')
  assert.deepEqual(walkA.mine, TRAP_COL0, 'A thấy nấm mình cắm trên đường B')
  assert.ok(!JSON.stringify(a.game('trap')).includes('"board"'), 'không lộ nấm trên đường mình')
  a.close()
  b.close()
})

test('trap: lật cùng lúc khi cả hai đã chọn; dẫm nấm mất mạng và đứng yên; tới đích trước thì thắng; cả hang nhận thông báo người thắng', async () => {
  const { a, b, ai, bi } = await startTrap(['Faker', 'Keria'])
  const watcher = connect(server, 'Xem', { tab: 'xem-t' })
  await watcher.admitted()
  a.send({ t: 'game', g: 'trap', d: { a: 'place', cells: TRAP_COL0 } }) // đường B: cột 0 toàn nấm
  b.send({ t: 'game', g: 'trap', d: { a: 'place', cells: SAFE_COL0 } }) // đường A: cột 0 an toàn
  await a.until(() => a.game('trap').some((d) => d.a === 'walk'), 'walk')
  // lượt 1: A đi cột 0 (an toàn), B đi cột 0 (nấm)
  a.send({ t: 'game', g: 'trap', d: { a: 'step', col: 0 } })
  await b.until(() => b.game('trap').some((d) => d.a === 'locked' && d.by === ai), 'B biết A đã chọn')
  assert.ok(!b.game('trap').some((d) => d.a === 'round'), 'chưa lật khi B chưa chọn')
  b.send({ t: 'game', g: 'trap', d: { a: 'step', col: 0 } })
  const r1 = await a.until(() => a.game('trap').find((d) => d.a === 'round'), 'lượt 1')
  assert.deepEqual(r1.steps.find(([p]) => p === ai), [ai, 0, 0, 0])
  assert.deepEqual(r1.steps.find(([p]) => p === bi), [bi, 0, 0, 1])
  assert.equal(r1.lives.find(([p]) => p === bi)[1], TRAP.lives - 1)
  assert.equal(r1.rows.find(([p]) => p === bi)[1], 0, 'dẫm nấm thì đứng yên')
  // các lượt sau: A cột 0; B cột 1 (an toàn)
  for (let round = 2; round <= TRAP.rows; round += 1) {
    a.send({ t: 'game', g: 'trap', d: { a: 'step', col: 0 } })
    b.send({ t: 'game', g: 'trap', d: { a: 'step', col: 1 } })
    await a.until(() => a.game('trap').filter((d) => d.a === 'round').length >= round, `lượt ${round}`)
  }
  const end = await b.until(() => b.game('trap').find((d) => d.a === 'end'), 'kết thúc')
  assert.equal(end.winner, ai)
  assert.equal(end.reason, 'goal')
  assert.deepEqual(end.boards.find(([p]) => p === bi)[1], TRAP_COL0, 'hết trận thì lộ toàn bộ nấm')
  const notice = await watcher.until(() => watcher.json.find((m) => m.t === 'notice' && m.kind === 'trap_result'), 'thông báo toàn hang')
  assert.deepEqual(notice.names, ['Faker', 'Keria'])
  assert.equal(notice.result, 'win')
  assert.deepEqual(notice.lives, [3, 2])
  await a.until(() => a.json.some((m) => m.t === 'engaged' && m.off?.includes(ai)), 'hết bận')
  a.close()
  b.close()
  watcher.close()
})

test('trap: hết giờ giấu nấm thì máy cắm hộ; hết giờ chọn ô thì máy chọn hộ; hết 3 mạng thì thua', async () => {
  const { a, b, ai, bi } = await startTrap(['ChamA', 'ChamB'])
  // đường A: cột 0 toàn nấm (hàng 0–4). A không cắm gì (máy cắm hộ khi hết giờ).
  b.send({ t: 'game', g: 'trap', d: { a: 'place', cells: TRAP_COL0 } })
  const walk = await a.until(() => a.game('trap').find((d) => d.a === 'walk'), 'hết giờ giấu nấm')
  assert.equal(walk.mine.length, 5, 'máy cắm hộ A đủ 5 nấm')
  // A: (0,trái) nấm, (0,phải) an toàn, (1,trái) nấm, (1,phải) an toàn, (2,trái) nấm → hết 3 mạng sau 5 lượt;
  // B không chọn gì (máy chọn hộ, cần ít nhất 6 lượt mới tới đích)
  const plan = [0, 1, 0, 1, 0]
  for (let round = 1; round <= plan.length; round += 1) {
    a.send({ t: 'game', g: 'trap', d: { a: 'step', col: plan[round - 1] } })
    await a.until(() => a.game('trap').filter((d) => d.a === 'round').length >= round, `lượt ${round} (máy chọn hộ B sau 2,5 s)`)
  }
  const rounds = a.game('trap').filter((d) => d.a === 'round')
  assert.deepEqual(rounds.map((r) => r.steps.find(([p]) => p === ai).slice(1)), [[0, 0, 1], [0, 1, 0], [1, 0, 1], [1, 1, 0], [2, 0, 1]])
  assert.ok(rounds.every((r) => r.steps.some(([p, , col]) => p === bi && col >= 0 && col < TRAP.cols)), 'máy chọn hộ B mỗi lượt')
  const end = await a.until(() => a.game('trap').find((d) => d.a === 'end'), 'kết thúc')
  assert.equal(end.winner, bi)
  assert.equal(end.reason, 'dead')
  assert.equal(end.lives.find(([p]) => p === ai)[1], 0)
  a.close()
  b.close()
})

test('trap: bỏ cuộc hoặc mất kết nối giữa trận thì xử thua', async () => {
  const p1 = await startTrap(['ChayA', 'ChayB'])
  p1.a.send({ t: 'game', g: 'trap', d: { a: 'quit' } })
  const end1 = await p1.b.until(() => p1.b.game('trap').find((d) => d.a === 'end'), 'bỏ cuộc')
  assert.equal(end1.winner, p1.bi)
  assert.equal(end1.reason, 'quit')
  p1.a.close()
  p1.b.close()
  const p2 = await startTrap(['RotA', 'RotB'])
  p2.b.close()
  const end2 = await p2.a.until(() => p2.a.game('trap').find((d) => d.a === 'end'), 'mất kết nối')
  assert.equal(end2.winner, p2.ai)
  assert.equal(end2.reason, 'left')
  p2.a.close()
})
