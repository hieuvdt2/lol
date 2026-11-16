// Đám đông 400 người trên màn hình điện thoại: hạn mức nhân vật đầy đủ, nhân vật ở xa là ảnh (không phải khối trụ), ngân sách draw call.
import test from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { moveBytes } from '../helpers/wsclient.mjs'
import { chromePath, enterCave, launchBrowser, launchStack, newPage, sceneStats, sleep, until } from './helpers.mjs'

const skip = chromePath() ? false : 'Không tìm thấy Chrome: đặt CHROME_PATH'

test('đám đông 400 người trên điện thoại 402×684', { skip, timeout: 420_000 }, async () => {
  const stack = await launchStack()
  const browser = await launchBrowser()
  const crowd = []
  const errors = []
  try {
    const page = await newPage(browser, 'phone', { width: 402, height: 684 }, { mobile: true, errors })
    await enterCave(page, stack.baseUrl, 'Phone', 5)
    for (let i = 0; i < 400; i += 1) {
      const ws = new WebSocket(stack.server.wsUrl)
      ws.on('message', () => {})
      ws.on('open', () => ws.send(JSON.stringify({ t: 'enter', name: `Fan ${i + 1}`, number: 1 + (i % 99), tab: `crowd-${i}` })))
      const a = Math.random() * Math.PI * 2
      const r = 4 + Math.random() * 36
      const goal = { x: Math.sin(a) * r, z: Math.cos(a) * r }
      const at = { x: 0, z: 36 }
      const walk = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return
        const dx = goal.x - at.x
        const dz = goal.z - at.z
        const d = Math.hypot(dx, dz)
        if (d < 0.5) return clearInterval(walk)
        at.x += (dx / d) * 0.6
        at.z += (dz / d) * 0.6
        ws.send(moveBytes(at.x, at.z, { dir: 7 << 5 }))
      }, 100)
      crowd.push(ws)
    }
    await until(() => page.evaluate(() => window.__hangNet.actors.size >= 405), { timeout: 60000, label: 'đủ 405 diễn viên' })
    await sleep(12000)
    const stats = await page.evaluate(() => window.__hangStats())
    assert.equal(stats.impostor, true, 'nhân vật ở xa phải dùng ảnh, không phải khối trụ')
    assert.ok(stats.full <= 81, `nhân vật đầy đủ: ${stats.full} (hạn mức 80 + bản thân)`)
    assert.ok(stats.liteVisible > 0, 'có nhân vật ở mức đơn giản trong khung nhìn')
    assert.ok(stats.calls < 2200, `draw call: ${stats.calls}`)
    // Cảnh đấu trường cố định ~95 geometry (khán đài, màn LED, giàn đèn...); ngưỡng chặn việc tăng theo số người chơi (400 người ở đây).
    assert.ok(stats.geometries < 120, `geometry không được tăng theo số người: ${stats.geometries}`)
    const scene = await sceneStats(page, await page.screenshot())
    assert.ok(scene.colors > 60, `canvas trống? colors=${scene.colors}`)
  } finally {
    for (const ws of crowd) ws.terminate()
    await browser.close()
    await stack.stop()
  }
  assert.deepEqual([...new Set(errors)], [], 'không có lỗi console / pageerror')
})
