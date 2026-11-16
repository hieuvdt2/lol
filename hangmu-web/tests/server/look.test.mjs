// Ngoại hình nhân vật qua mạng: gửi kèm khi vào hang, có trong danh sách người chơi và tin "join"; đổi trang phục trong hang thì cả hang thấy.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LOOK_CODE, encodeLook } from '../../shared/look.mjs'
import { sleep, startServer } from '../helpers/server.mjs'
import { closeAll, connect } from '../helpers/wsclient.mjs'

let server
before(async () => {
  server = await startServer({ BOTS: '3' })
})
after(async () => {
  closeAll()
  await server.stop()
})

const rowOf = (client, index) => client.find('admitted').roster.find((r) => r.i === index)

test('vào hang kèm mã ngoại hình: người khác thấy trong "join" và danh sách; thiếu hoặc sai mã → mặc định; bot có ngoại hình hợp lệ', async () => {
  const look = encodeLook({ team: 6, skin: 4, hair: 3, hairColor: 2 })
  const watcher = connect(server, 'Xem', { tab: 'lk-w' })
  await watcher.admitted()
  const a = connect(server, 'Áo Xanh', { tab: 'lk-a', look })
  await a.admitted()
  const self = a.find('admitted').selfIndex
  assert.equal(rowOf(a, self).k, look, 'chính mình trong danh sách')
  const join = await watcher.until(() => watcher.all('join').find((m) => m.i === self), 'người xem nhận join')
  assert.equal(join.k, look)
  for (const r of a.find('admitted').roster) assert.ok(Number.isInteger(r.k) && r.k >= 0 && r.k <= 0x1ffff, `mã ngoại hình của ${r.name}`)
  const plain = connect(server, 'Không Mã', { tab: 'lk-p' })
  await plain.admitted()
  assert.equal(rowOf(plain, plain.find('admitted').selfIndex).k, DEFAULT_LOOK_CODE)
  const bad = connect(server, 'Mã Sai', { tab: 'lk-b', look: 999999 })
  await bad.admitted()
  assert.equal(rowOf(bad, bad.find('admitted').selfIndex).k, DEFAULT_LOOK_CODE)
  for (const c of [watcher, a, plain, bad]) c.close()
})

test('đổi trang phục trong hang: cả hang (kể cả mình) nhận {t:"look"}; mã sai về mặc định; bấm liên tục bị giới hạn; người vào sau thấy trang phục mới', async () => {
  const a = connect(server, 'Đổi Áo', { tab: 'lk-c' })
  await a.admitted()
  const w = connect(server, 'Nhìn', { tab: 'lk-d' })
  await w.admitted()
  const self = a.find('admitted').selfIndex
  const next = encodeLook({ team: 0, skin: 1, hair: 1, hairColor: 1 })
  a.send({ t: 'look', look: next })
  const got = await w.until(() => w.all('look').find((m) => m.i === self), 'người khác nhận look')
  assert.equal(got.k, next)
  await a.until(() => a.all('look').some((m) => m.i === self && m.k === next), 'chính mình cũng nhận')
  // gửi ngay lần nữa: trong thời gian chờ thì bỏ qua
  a.send({ t: 'look', look: encodeLook({ team: 1, skin: 0, hair: 0, hairColor: 0 }) })
  await sleep(400)
  assert.equal(w.all('look').filter((m) => m.i === self).length, 1)
  await sleep(1300)
  a.send({ t: 'look', look: 'bậy' })
  await w.until(() => w.all('look').filter((m) => m.i === self).length === 2, 'mã sai cũng được nhận (về mặc định)')
  assert.equal(w.all('look').filter((m) => m.i === self).at(-1).k, DEFAULT_LOOK_CODE)
  await sleep(1600)
  a.send({ t: 'look', look: next })
  await w.until(() => w.all('look').filter((m) => m.i === self).length === 3, 'đổi lại')
  const late = connect(server, 'Đến Sau', { tab: 'lk-e' })
  await late.admitted()
  assert.equal(rowOf(late, self).k, next)
  for (const c of [a, w, late]) c.close()
})
