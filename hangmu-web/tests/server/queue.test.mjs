import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { startServer } from '../helpers/server.mjs'
import { closeAll, connect } from '../helpers/wsclient.mjs'

let server
before(async () => {
  // 2 bot + 1 người = đầy, hàng chờ tối đa 2.
  server = await startServer({ CAPACITY: '3', BOTS: '2', QUEUE_MAX: '2' })
})
after(async () => {
  closeAll()
  await server.stop()
})

test('hàng chờ: xếp vị trí, cập nhật khi có người rời, từ chối khi hàng đầy', async () => {
  const a = connect(server, 'First', { tab: 'q-a' })
  await a.admitted()
  const b = connect(server, 'Second', { tab: 'q-b' })
  const c = connect(server, 'Third', { tab: 'q-c' })
  const qb = await b.until(() => b.find('queued'), 'B xếp hàng')
  const qc = await c.until(() => c.find('queued'), 'C xếp hàng')
  assert.deepEqual([qb.position, qc.position], [1, 2])
  assert.equal(qb.inRoom, 3)
  const status = await (await fetch(`${server.url}/api/room/status`)).json()
  assert.deepEqual(status, { inRoom: 3, capacity: 3, waiting: 2 })

  const d = connect(server, 'Fourth', { tab: 'q-d' })
  assert.equal((await d.until(() => d.find('rejected'), 'hàng đầy')).reason, 'full')

  a.send({ t: 'leave' })
  await b.until(() => b.find('admitted'), 'B vào hang khi A rời')
  const last = c.all('queued').at(-1)
  assert.equal(last.position, 1, 'C tiến lên đầu hàng')
  b.close()
  c.close()
})
