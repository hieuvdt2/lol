// Lọc cập nhật vị trí theo tầng khoảng cách: gần ~10Hz, trung ~3,3Hz, xa ~1Hz; bản mới nhất luôn đến nơi.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { sleep, startServer } from '../helpers/server.mjs'
import { closeAll, connect, moveBytes } from '../helpers/wsclient.mjs'

let on
let off
before(async () => {
  // MAX_SPEED lớn để test đặt người chơi vào vị trí bất kỳ trong hang mà không bị "correction".
  on = await startServer({ CAPACITY: '20', BOTS: '0', INTEREST: 'on', MAX_SPEED: '100000' })
  off = await startServer({ CAPACITY: '20', BOTS: '0', INTEREST: 'off', MAX_SPEED: '100000' })
})
after(async () => {
  closeAll()
  await on.stop()
  await off.stop()
})

/** Các bản ghi vị trí (op 129) mà `client` đã nhận, theo thứ tự đến. */
function records(client) {
  const out = []
  for (const buf of client.bin) {
    if (buf[0] !== 129) continue
    const count = buf.readUInt16LE(3)
    for (let i = 0, o = 5; i < count; i += 1, o += 10) {
      out.push({ index: buf.readUInt16LE(o), x: buf.readInt16LE(o + 4) / 256, z: buf.readInt16LE(o + 6) / 256, dir: buf[o + 9] })
    }
  }
  return out
}

/** Quan sát viên đứng ở (0,36); ba người gửi vị trí 10 lần/giây trong `ms` mili giây từ ba khoảng cách khác nhau. */
async function scenario(server, ms = 2000) {
  const observer = connect(server, 'Observer', { tab: `i-o-${server.port}` })
  const near = connect(server, 'Near', { tab: `i-n-${server.port}` })
  const mid = connect(server, 'Mid', { tab: `i-m-${server.port}` })
  const far = connect(server, 'Far', { tab: `i-f-${server.port}` })
  await observer.admitted()
  const ids = { near: (await near.admitted()).selfIndex, mid: (await mid.admitted()).selfIndex, far: (await far.admitted()).selfIndex }
  observer.sendBytes(moveBytes(0, 36))
  // khoảng cách tới quan sát viên: gần ≈ 6, trung ≈ 35, xa ≈ 71 (các điểm phải nằm ngoài vật cản: server từ chối vị trí trong ghế/lửa)
  const base = { near: [0, 30], mid: [24, 10], far: [-30, -28] }
  for (const key of ['near', 'mid', 'far']) ({ near, mid, far })[key].sendBytes(moveBytes(...base[key]))
  await sleep(300)
  observer.bin.length = 0
  const last = {}
  const steps = Math.round(ms / 100)
  for (let step = 1; step <= steps; step += 1) {
    for (const key of ['near', 'mid', 'far']) {
      const x = base[key][0] + step * 0.05
      last[key] = { x, z: base[key][1] }
      ;({ near, mid, far })[key].sendBytes(moveBytes(x, base[key][1], { dir: 7 << 5 | 3 }))
    }
    await sleep(100)
  }
  // người ngừng gửi; chờ đủ lâu để cả tầng xa nhận được bản mới nhất
  last.stopAt = Date.now()
  await sleep(1600)
  return { observer, near, mid, far, ids, last }
}
const count = (observer, index) => records(observer).filter((r) => r.index === index).length

test('lọc bật: tần suất giảm dần theo khoảng cách, nhưng vẫn có cập nhật ở mọi tầng', async () => {
  const s = await scenario(on)
  const n = count(s.observer, s.ids.near)
  const m = count(s.observer, s.ids.mid)
  const f = count(s.observer, s.ids.far)
  assert.ok(n >= 12, `gần: ${n} bản ghi trong 2 giây, cần ≥ 12`)
  assert.ok(m >= 3 && m <= 9, `trung: ${m} bản ghi, cần 3–9 (~3,3Hz)`)
  assert.ok(f >= 1 && f <= 4, `xa: ${f} bản ghi, cần 1–4 (~1Hz)`)
  assert.ok(n > m && m > f, `thứ tự tần suất gần > trung > xa: ${n} > ${m} > ${f}`)
})

test('lọc bật: bản cập nhật cuối cùng của người ở xa vẫn tới nơi đúng vị trí', async () => {
  const s = await scenario(on)
  for (const key of ['near', 'mid', 'far']) {
    const rs = records(s.observer).filter((r) => r.index === s.ids[key])
    assert.ok(rs.length > 0, `${key}: có bản ghi`)
    const final = rs.at(-1)
    assert.ok(Math.abs(final.x - s.last[key].x) < 0.05 && Math.abs(final.z - s.last[key].z) < 0.05, `${key}: cuối (${final.x}, ${final.z}) khác thực tế (${s.last[key].x}, ${s.last[key].z})`)
  }
})

test('người gửi không nhận lại bản ghi của chính mình', async () => {
  const s = await scenario(on, 1000)
  for (const key of ['near', 'mid', 'far']) assert.equal(count(s[key], s.ids[key]), 0, `${key} nhận lại bản ghi của chính nó`)
})

test('lọc tắt: mọi người nhận mọi bản cập nhật như trước (kể cả người ở xa)', async () => {
  const s = await scenario(off)
  assert.ok(count(s.observer, s.ids.far) >= 12, `xa: ${count(s.observer, s.ids.far)} bản ghi, cần ≥ 12`)
  assert.ok(count(s.observer, s.ids.mid) >= 12)
})

test('người vào sau vẫn biết vị trí mọi người qua gói welcome, kể cả khi họ đứng yên', async () => {
  const a = connect(on, 'StillA', { tab: 'i-sa' })
  await a.admitted()
  a.sendBytes(moveBytes(-30, -28))
  await sleep(1500) // đứng yên một lúc: không còn hoạt động
  const late = connect(on, 'Late', { tab: 'i-late' })
  await late.admitted()
  const welcome = await late.until(() => late.bin.find((b) => b[0] === 128), 'welcome')
  const entries = []
  for (let i = 0, o = 3; i < welcome.readUInt16LE(1); i += 1, o += 8) entries.push({ x: welcome.readInt16LE(o + 2) / 256, z: welcome.readInt16LE(o + 4) / 256 })
  assert.ok(entries.some((e) => Math.abs(e.x + 30) < 0.1 && Math.abs(e.z + 28) < 0.1), 'welcome chứa vị trí của người đứng yên')
})
