// Ngồi ghế hội trường (server giữ trạng thái, báo cả hang) và kiểm tra va chạm cho người thật.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { GATES, HALL_SEATS, LOUNGE_SEATS, PLAYER_RADIUS, SEATS, STAND_SEATS } from '../../shared/world.mjs'
import { sleep, startServer } from '../helpers/server.mjs'
import { closeAll, connect, moveBytes } from '../helpers/wsclient.mjs'

let server
before(async () => {
  // MAX_SPEED lớn: bài thử dịch chuyển tức thời tới ghế (giới hạn tốc độ có bài riêng ở room.test.mjs)
  server = await startServer({ BOTS: '0', MAX_SPEED: '1000', DUEL_COUNTDOWN_MS: '300' })
})
after(async () => {
  closeAll()
  await server.stop()
})

const FRONT = PLAYER_RADIUS + 0.375 + 0.01 // đứng sát phía trước (z lớn hơn) một ghế
const frontOf = (bench) => ({ x: HALL_SEATS[bench].x, z: HALL_SEATS[bench].z + FRONT })
const corrections = (c) => c.bin.filter((x) => x[0] === 130).map((x) => [x.readInt16LE(1) / 256, x.readInt16LE(3) / 256])
const seatMsgs = (c) => c.all('seat')

async function join(name, tab, at) {
  const c = connect(server, name, { tab })
  const index = (await c.admitted()).selfIndex
  if (at) {
    await sleep(200) // bước nhảy tới ghế chỉ được nhận khi khoảng cách thời gian đủ dài (MAX_SPEED × dt + 1 ≥ khoảng cách)
    c.sendBytes(moveBytes(at.x, at.z))
    await sleep(150)
  }
  return { c, index }
}

test('ngồi: server dịch người lên ghế, báo cả hang, người vào sau nhận danh sách ghế đang có người', async () => {
  const bench = 22
  const a = await join('SitA', 'st-a', frontOf(bench))
  const w = await join('SitWatch', 'st-w')
  a.c.send({ t: 'sit', bench })
  const msg = await w.c.until(() => seatMsgs(w.c).find((m) => m.i === a.index), 'người xem nhận seat')
  assert.deepEqual([msg.t, msg.i, msg.b], ['seat', a.index, bench])
  await a.c.until(() => seatMsgs(a.c).some((m) => m.i === a.index), 'chính người ngồi cũng nhận')
  const [x, z] = corrections(a.c).at(-1)
  assert.ok(Math.hypot(x - HALL_SEATS[bench].x, z - HALL_SEATS[bench].z) < 0.01, `server đặt người ngồi lên ghế: (${x}, ${z})`)
  const late = await join('SitLate', 'st-l')
  const seats = await late.c.until(() => late.c.find('seats'), 'người mới nhận seats')
  assert.deepEqual(seats.on, [[a.index, bench]])
  for (const p of [a, w, late]) p.c.close()
})

test('ngồi bị từ chối: ghế đã có người, quá xa, ghế không tồn tại, dữ liệu sai kiểu, đã đang ngồi', async () => {
  const bench = 31
  const a = await join('DenyA', 'sd-a', frontOf(bench))
  a.c.send({ t: 'sit', bench })
  await a.c.until(() => seatMsgs(a.c).some((m) => m.i === a.index && m.b === bench), 'A ngồi')
  const b = await join('DenyB', 'sd-b', { x: HALL_SEATS[bench].x + 0.5, z: HALL_SEATS[bench].z + FRONT })
  b.c.send({ t: 'sit', bench })
  await b.c.until(() => b.c.find('seatDenied'), 'ghế có người')
  const far = await join('DenyFar', 'sd-f', { x: 0, z: 20 })
  far.c.send({ t: 'sit', bench: 5 })
  await far.c.until(() => far.c.find('seatDenied'), 'quá xa')
  for (const bad of [-1, 50, 3.5, '7', null, undefined, {}, [], NaN]) {
    const before = far.c.all('seatDenied').length
    far.c.send({ t: 'sit', bench: bad })
    await far.c.until(() => far.c.all('seatDenied').length > before, `bench=${JSON.stringify(bad)} bị từ chối`)
  }
  a.c.send({ t: 'sit', bench: 32 })
  await sleep(200)
  assert.equal(seatMsgs(a.c).filter((m) => m.i === a.index).length, 1, 'đang ngồi thì không ngồi thêm ghế khác')
  for (const p of [a, b, far]) p.c.close()
})

test('đang ngồi thì vị trí do server giữ (bản tin di chuyển bị bỏ qua); đứng dậy ra hành lang trước ghế và báo cả hang', async () => {
  const bench = 14
  const a = await join('StandA', 'ss-a', frontOf(bench))
  const w = await join('StandW', 'ss-w')
  a.c.send({ t: 'sit', bench })
  await w.c.until(() => seatMsgs(w.c).some((m) => m.i === a.index && m.b === bench), 'ngồi')
  const before = corrections(a.c).length
  a.c.sendBytes(moveBytes(5, 10)) // đang ngồi mà báo đi chỗ khác
  await sleep(300)
  assert.equal(corrections(a.c).length, before, 'bỏ qua, không sửa, không phát đi')
  a.c.send({ t: 'stand' })
  await w.c.until(() => seatMsgs(w.c).some((m) => m.i === a.index && m.b === -1), 'đứng dậy được báo')
  const [x, z] = corrections(a.c).at(-1)
  assert.ok(Math.hypot(x - HALL_SEATS[bench].x, z - (HALL_SEATS[bench].z + 1.15)) < 0.01, `đứng ở hành lang: (${x}, ${z})`)
  a.c.send({ t: 'stand' }) // đứng khi không ngồi: bỏ qua
  await sleep(150)
  assert.equal(seatMsgs(w.c).filter((m) => m.b === -1).length, 1)
  for (const p of [a, w]) p.c.close()
})

test('rời hang thì nhả ghế cho người khác; chat riêng hoặc đấu võ buộc đứng dậy', async () => {
  const bench = 8
  const a = await join('FreeA', 'sf-a', frontOf(bench))
  a.c.send({ t: 'sit', bench })
  await a.c.until(() => seatMsgs(a.c).some((m) => m.b === bench), 'A ngồi')
  a.c.send({ t: 'leave' })
  a.c.close()
  await sleep(300)
  const b = await join('FreeB', 'sf-b', frontOf(bench))
  b.c.send({ t: 'sit', bench })
  await b.c.until(() => seatMsgs(b.c).some((m) => m.i === b.index && m.b === bench), 'B ngồi được ghế vừa nhả')

  const near = await join('TalkPeer', 'sf-t', frontOf(bench + 1))
  near.c.send({ t: 'inviteAsk', kind: 'talk', target: b.index })
  const inv = await b.c.until(() => b.c.find('invite'), 'B nhận lời mời')
  b.c.send({ t: 'inviteAnswer', id: inv.id, accept: true })
  await b.c.until(() => b.c.find('talkOpen'), 'chat riêng mở')
  await b.c.until(() => seatMsgs(b.c).some((m) => m.i === b.index && m.b === -1), 'mở chat riêng thì buộc đứng dậy')
  for (const p of [b, near]) p.c.close()
})

// ---------- kiểm tra va chạm cho người thật ----------
test('vị trí báo lên nằm trong ghế/lửa/hình nộm bị sửa (correction); sát ngoài rìa hoặc ở chỗ trống thì nhận', async () => {
  const cases = [
    ['trong ghế hội trường', { x: 1.2, z: -26.6 }, true],
    ['sát ghế (ngoài rìa)', frontOf(5), false],
    ['chỗ trống ngoài bậc thang', { x: 20, z: 30 }, false],
    ['sát vành bục thi đấu (không đứng sát vành được)', { x: 0, z: 11.6 }, true],
    ['trong bệ cúp', { x: 0.3, z: 0.4 }, true],
    ['bên trong bục, chỗ trống', { x: 0, z: 9.8 }, false],
    ['xuyên ghế bậc thang', { x: Math.sin(0.5) * 9.2, z: Math.cos(0.5) * 9.2 }, null], // chỉ kiểm tra không sập
  ]
  for (const [label, at, rejected] of cases) {
    const p = connect(server, `Col${Math.round(at.x * 10)}`, { tab: `col-${label}` })
    await p.admitted()
    await sleep(200)
    p.sendBytes(moveBytes(at.x, at.z))
    await sleep(350)
    const got = corrections(p).length > 0
    if (rejected !== null) assert.equal(got, rejected, `${label}: ${got ? 'bị sửa' : 'được nhận'}`)
    p.close()
  }
})

test('người đi đúng luật (đi sát ghế bằng mô phỏng chung) không bao giờ bị sửa nhầm', async () => {
  const { makeBody, stepBody, SIM_DT } = await import('../../shared/world.mjs')
  const p = await join('Honest', 'col-honest', { x: 13.5, z: -35.7 })
  await sleep(100)
  const body = makeBody(13.5, -35.7, 0)
  const before = corrections(p.c).length
  // đi dọc hành lang giữa hai hàng ghế rồi đẩy vào ghế, báo vị trí như client thật
  for (let i = 0; i < 150; i += 1) {
    stepBody(body, { mx: i < 100 ? -1 : 0, mz: i < 100 ? 0 : -1 }, SIM_DT)
    if (i % 3 === 0) p.c.sendBytes(moveBytes(body.x, body.z, { dir: 0 }))
    if (i % 30 === 0) await sleep(40)
  }
  await sleep(300)
  assert.equal(corrections(p.c).length, before, 'vị trí hợp lệ sát vật cản không bị coi là xuyên')
  p.c.close()
})

test('phòng chờ: ngồi sofa (chỉ số 50+) — server đặt người lên ghế, quay đúng hướng, đứng dậy thì ra trước sofa; ghế đã có người bị từ chối; xa thì bị từ chối', async () => {
  const seat = LOUNGE_SEATS[4] // sofa phải, ghế giữa
  assert.ok(seat.bench >= HALL_SEATS.length)
  const front = { x: seat.x + Math.sin(seat.heading) * 0.85, z: seat.z + Math.cos(seat.heading) * 0.85 }
  const a = await join('LoungeA', 'lg-a', front)
  const w = await join('LoungeWatch', 'lg-w')
  a.c.send({ t: 'sit', bench: seat.bench })
  const msg = await w.c.until(() => seatMsgs(w.c).find((m) => m.i === a.index), 'người xem nhận seat')
  assert.deepEqual([msg.t, msg.i, msg.b], ['seat', a.index, seat.bench])
  await a.c.until(() => seatMsgs(a.c).some((m) => m.i === a.index), 'chính người ngồi cũng nhận')
  const [x, z] = corrections(a.c).at(-1)
  assert.ok(Math.hypot(x - seat.x, z - seat.z) < 0.01, `server đặt người lên sofa: (${x}, ${z})`)
  // người thứ hai đứng sát cũng không ngồi được vào ghế đã có người
  const b = await join('LoungeB', 'lg-b', { x: front.x + Math.sin(seat.heading) * 0.2, z: front.z + Math.cos(seat.heading) * 0.2 })
  const denied = b.c.all('seatDenied').length
  b.c.send({ t: 'sit', bench: seat.bench })
  await b.c.until(() => b.c.all('seatDenied').length > denied, 'ghế có người bị từ chối')
  // chỉ số vượt quá danh sách ghế bị từ chối
  const before = b.c.all('seatDenied').length
  b.c.send({ t: 'sit', bench: SEATS.length })
  await b.c.until(() => b.c.all('seatDenied').length > before, 'chỉ số ngoài danh sách bị từ chối')
  // đứng dậy: ra đúng chỗ trước sofa
  a.c.send({ t: 'stand' })
  await w.c.until(() => seatMsgs(w.c).some((m) => m.i === a.index && m.b === -1), 'đứng dậy được báo')
  const [sx, sz] = corrections(a.c).at(-1)
  assert.ok(Math.hypot(sx - seat.exit.x, sz - seat.exit.z) < 0.01, `đứng dậy trước sofa: (${sx}, ${sz}) kỳ vọng (${seat.exit.x}, ${seat.exit.z})`)
  for (const p of [a, w, b]) p.c.close()
})

test('cửa: đứng gần đầu ngoài thì sang đầu trong (server ép vị trí), đứng gần đầu trong thì ra ngoài; xa cửa, id lạ hoặc đang ngồi thì bị từ chối', async () => {
  for (const gate of GATES) {
    const a = await join(`Gate-${gate.id}`, `gt-${gate.id}`, { x: gate.outside.x, z: gate.outside.z })
    const denied = () => a.c.all('gateDenied').length
    a.c.send({ t: 'gate', id: gate.id })
    await a.c.until(() => corrections(a.c).length > 0, 'bị dịch chuyển vào trong')
    let [x, z] = corrections(a.c).at(-1)
    assert.ok(Math.hypot(x - gate.inside.x, z - gate.inside.z) < 0.01, `${gate.id}: vào tới (${x}, ${z}) kỳ vọng (${gate.inside.x}, ${gate.inside.z})`)
    // báo vị trí mới (đã ở trong) rồi bấm lần nữa: ra ngoài
    a.c.sendBytes(moveBytes(gate.inside.x, gate.inside.z))
    await sleep(150)
    const before = corrections(a.c).length
    a.c.send({ t: 'gate', id: gate.id })
    await a.c.until(() => corrections(a.c).length > before, 'bị dịch chuyển ra ngoài')
    ;[x, z] = corrections(a.c).at(-1)
    assert.ok(Math.hypot(x - gate.outside.x, z - gate.outside.z) < 0.01, `${gate.id}: ra tới (${x}, ${z})`)
    assert.equal(denied(), 0)
    // xa cửa và id lạ
    a.c.sendBytes(moveBytes(0, 30))
    await sleep(150)
    a.c.send({ t: 'gate', id: gate.id })
    await a.c.until(() => denied() === 1, 'xa cửa bị từ chối')
    for (const bad of ['khong-co', 7, null, undefined, '__proto__']) {
      const n = denied()
      a.c.send({ t: 'gate', id: bad })
      await a.c.until(() => denied() > n, `id ${JSON.stringify(bad)} bị từ chối`)
    }
    a.c.close()
  }
})

test('ngồi ghế khán đài (chỉ số 60+): server đặt người lên ghế, báo cả hang; đang ngồi thì không qua cửa được', async () => {
  const seat = STAND_SEATS[300]
  assert.ok(seat.bench >= 60)
  const front = { x: seat.x + Math.sin(seat.heading) * 0.85, z: seat.z + Math.cos(seat.heading) * 0.85 }
  const a = await join('StandSit', 'sk-a', front)
  const w = await join('StandWatch', 'sk-w')
  a.c.send({ t: 'sit', bench: seat.bench })
  const msg = await w.c.until(() => seatMsgs(w.c).find((m) => m.i === a.index), 'người xem nhận seat')
  assert.equal(msg.b, seat.bench)
  const [x, z] = corrections(a.c).at(-1)
  assert.ok(Math.hypot(x - seat.x, z - seat.z) < 0.01, `ngồi lên ghế khán đài: (${x}, ${z})`)
  const n = a.c.all('gateDenied').length
  a.c.send({ t: 'gate', id: GATES[0].id })
  await a.c.until(() => a.c.all('gateDenied').length > n, 'đang ngồi không qua cửa được')
  a.c.send({ t: 'stand' })
  await w.c.until(() => seatMsgs(w.c).some((m) => m.i === a.index && m.b === -1), 'đứng dậy')
  const [sx, sz] = corrections(a.c).at(-1)
  assert.ok(Math.hypot(sx - seat.exit.x, sz - seat.exit.z) < 0.01)
  for (const p of [a, w]) p.c.close()
})
