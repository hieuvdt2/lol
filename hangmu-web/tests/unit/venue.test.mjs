import test from 'node:test'
import assert from 'node:assert/strict'
import { drawWall } from '../../src/game/venue.ts'

/** Canvas 2D giả: ghi lại lệnh vẽ để kiểm tra nội dung và độ ổn định mà không cần trình duyệt. */
function fakeContext() {
  const log = { texts: [], calls: 0 }
  const grad = { addColorStop() {} }
  const ctx = new Proxy({}, {
    get(_, key) {
      if (key === 'createLinearGradient') return () => grad
      if (key === 'fillText') return (text) => { log.texts.push(String(text)); log.calls += 1 }
      return (...args) => { void args; log.calls += 1 }
    },
    set() { return true },
  })
  return { ctx, log }
}

test('màn hình LED: vẽ đủ thanh điểm số, đồng hồ, bảng bên phải theo chu kỳ 8 s; mọi thời điểm đều vẽ được', () => {
  const seen = new Set()
  for (const t of [0, 3, 9, 17, 25, 123.4, 99999]) {
    const { ctx, log } = fakeContext()
    drawWall(ctx, t)
    assert.ok(log.calls > 100, `t=${t}: số lệnh vẽ ${log.calls}`)
    for (const need of ['TÊ ĐỎ', 'ĐỐI THỦ']) assert.ok(log.texts.includes(need), `t=${t}: thiếu "${need}"`)
    for (const text of log.texts) assert.ok(!/NaN|undefined|Infinity/.test(text), `t=${t}: chữ lỗi "${text}"`)
    for (const text of log.texts) seen.add(text)
  }
  // ba bảng bên phải xuất hiện lần lượt
  for (const need of ['CHUNG KẾT', 'ĐỘI HÌNH RA SÂN', 'MUÔN NĂM']) assert.ok(seen.has(need), `chưa thấy bảng "${need}"`)
})

test('màn hình LED: không có logo, tên đội hay người thật — chỉ chữ tự đặt', () => {
  const { ctx, log } = fakeContext()
  for (let t = 0; t < 30; t += 1) drawWall(ctx, t)
  const all = log.texts.join(' ').toLowerCase()
  for (const banned of ['hanwha', 'gen.g', 'faker', 'riot', 'lck', 'worlds', 'viper', 'peanut', 'zeus', 'delight', 'ruler']) assert.ok(!all.includes(banned), `không được chứa "${banned}"`)
})
