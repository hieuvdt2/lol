import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { sleep, startServer } from '../helpers/server.mjs'
import { closeAll, connect } from '../helpers/wsclient.mjs'

let server
before(async () => {
  server = await startServer({ CAPACITY: '50', BOTS: '1', DUEL_COUNTDOWN_MS: '400', DUEL_ROUND_MS: '30000' })
})
after(async () => {
  closeAll()
  await server.stop()
})

async function pair(names, tabs) {
  const a = connect(server, names[0], { tab: tabs[0] })
  const b = connect(server, names[1], { tab: tabs[1] })
  const ai = (await a.admitted()).selfIndex
  const bi = (await b.admitted()).selfIndex
  return { a, b, ai, bi }
}
async function startDuel({ a, b, bi }) {
  a.send({ t: 'inviteAsk', kind: 'duel', target: bi })
  const invite = await b.until(() => b.find('invite'), 'duel invite')
  assert.equal(invite.kind, 'duel')
  b.send({ t: 'inviteAnswer', id: invite.id, accept: true })
  await a.until(() => a.game('duel').some((d) => d.a === 'go'), 'go')
  await b.until(() => b.game('duel').some((d) => d.a === 'go'), 'go (B)')
}

test('duel: start đúng luật, engaged, windup chỉ tới đối thủ, đòn trúng trừ 15 máu', async () => {
  const p = await pair(['DuelA', 'DuelB'], ['du-a', 'du-b'])
  const { a, b, ai, bi } = p
  a.send({ t: 'inviteAsk', kind: 'duel', target: bi })
  const invite = await b.until(() => b.find('invite'), 'invite')
  b.send({ t: 'inviteAnswer', id: invite.id, accept: true })
  const start = await a.until(() => a.game('duel').find((d) => d.a === 'start'), 'start')
  assert.equal(start.peer, bi)
  assert.deepEqual(start.rules, { hp: 100, dmg: 15, windupMs: 500, blockMs: 400, blockCdMs: 600, punchCdMs: 800 })
  assert.equal(start.roundMs, 30000)
  assert.ok(a.json.some((m) => m.t === 'engaged' && m.on?.some(([i, k]) => i === bi && k === 'duel')), 'engaged')
  await a.until(() => a.game('duel').some((d) => d.a === 'go'), 'go')

  a.send({ t: 'game', g: 'duel', d: { a: 'punch' } })
  const windup = await b.until(() => b.game('duel').find((d) => d.a === 'windup'), 'windup')
  assert.deepEqual([windup.by, windup.impactInMs], [ai, 500])
  assert.ok(!a.game('duel').some((d) => d.a === 'windup'), 'người đấm không nhận windup')
  const result = await b.until(() => b.game('duel').find((d) => d.a === 'result'), 'result')
  assert.equal(result.target, bi)
  assert.equal(result.blocked, false)
  assert.equal(result.hp.find(([i]) => i === bi)[1], 85)
  a.close()
  b.close()
})

test('duel: đỡ đúng lúc chặn được đòn, và chỉ đỡ được khi hết thời gian hồi', async () => {
  const p = await pair(['BlkA', 'BlkB'], ['bk-a', 'bk-b'])
  const { a, b, bi } = p
  await startDuel(p)
  a.send({ t: 'game', g: 'duel', d: { a: 'punch' } })
  await b.until(() => b.game('duel').some((d) => d.a === 'windup'), 'windup')
  await sleep(150) // đòn chạm sau 500ms, đỡ kéo dài 400ms: đỡ lúc ~150ms phủ tới 550ms
  b.send({ t: 'game', g: 'duel', d: { a: 'block' } })
  await a.until(() => a.game('duel').some((d) => d.a === 'guard'), 'guard')
  const result = await b.until(() => b.game('duel').find((d) => d.a === 'result'), 'result')
  assert.equal(result.blocked, true)
  assert.equal(result.hp.find(([i]) => i === bi)[1], 100)
  a.close()
  b.close()
})

test('duel: bỏ cuộc → đối thủ thắng, có notice, bảng xếp hạng và engaged tắt', async () => {
  const p = await pair(['QuitA', 'QuitB'], ['qt-a', 'qt-b'])
  const { a, b, ai, bi } = p
  await startDuel(p)
  b.send({ t: 'game', g: 'duel', d: { a: 'quit' } })
  const end = await a.until(() => a.game('duel').find((d) => d.a === 'end'), 'end')
  assert.deepEqual([end.winner, end.reason], [ai, 'quit'])
  assert.ok(Array.isArray(end.stats) && end.stats.length === 2)
  const notice = await a.until(() => a.find('notice'), 'notice')
  assert.deepEqual([notice.kind, notice.result, notice.names[0]], ['duel_result', 'quit', 'QuitA'])
  await a.until(() => a.json.some((m) => m.t === 'engaged' && m.off?.includes(bi)), 'engaged off')
  const rank = await a.until(() => a.game('duel').filter((d) => d.a === 'rank').at(-1)?.top?.find(([n]) => n === 'QuitA'), 'rank')
  assert.equal(rank[1], 1)
  a.close()
  b.close()
})

test('duel: đối thủ mất kết nối giữa trận bị xử thua', async () => {
  const p = await pair(['DropA', 'DropB'], ['dp-a', 'dp-b'])
  const { a, b, bi } = p
  await startDuel(p)
  a.close()
  const end = await b.until(() => b.game('duel').find((d) => d.a === 'end'), 'end')
  assert.deepEqual([end.winner, end.reason], [bi, 'left'])
  b.close()
})

test('duel: người đang bận không nhận thêm lời mời duel', async () => {
  const p = await pair(['BusyA', 'BusyB'], ['by-a', 'by-b'])
  const c = connect(server, 'BusyC', { tab: 'by-c' })
  await c.admitted()
  await startDuel(p)
  c.send({ t: 'inviteAsk', kind: 'duel', target: p.bi })
  const declined = await c.until(() => c.find('inviteDeclined'), 'bị từ chối')
  assert.equal(declined.reason, 'busy')
  p.a.close()
  p.b.close()
  c.close()
})

test('rage: nhãn mặc định, ném tăng bộ đếm, đổi nhãn phát cho mọi người, dữ liệu sai bị bỏ qua', async () => {
  const a = connect(server, 'RageA', { tab: 'rg-a' })
  const b = connect(server, 'RageB', { tab: 'rg-b' })
  await a.admitted()
  await b.admitted()
  assert.deepEqual((await a.until(() => a.game('rage')[0], 'state')).labels, [3, 1, 2, 0, 14])
  a.send({ t: 'game', g: 'rage', d: { a: 'throw', slot: 1, item: 2, u: 0.1, v: -0.2 } })
  await a.until(() => a.game('rage').at(-1)?.today === 1, 'today=1')
  a.send({ t: 'game', g: 'rage', d: { a: 'label', slot: 0, nick: 9 } })
  await b.until(() => b.game('rage').at(-1)?.labels[0] === 9, 'nhãn phát tới B')
  a.send({ t: 'game', g: 'rage', d: { a: 'label', slot: 9, nick: 99 } })
  a.send({ t: 'game', g: 'rage', d: { a: 'throw', slot: 1, item: 99, u: 0, v: 0 } })
  await sleep(300)
  assert.equal(b.game('rage').at(-1).labels[0], 9)
  assert.equal(a.game('rage').at(-1).today, 1, 'ném với dữ liệu sai không được tính')
  a.close()
  b.close()
})
