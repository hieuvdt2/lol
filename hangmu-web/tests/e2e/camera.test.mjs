// E2E: vào hang, nhìn thẳng, chạy về phía trước từ chỗ xuất hiện (phòng chờ ngay sau lưng) — camera không được giật.
import test from 'node:test'
import assert from 'node:assert/strict'
import { chromePath, enterCave, launchBrowser, launchStack, newPage, sleep } from './helpers.mjs'

const skip = chromePath() ? false : 'Không tìm thấy Chrome: đặt CHROME_PATH'

test('camera sau lưng: chạy thẳng từ chỗ xuất hiện không giật', { skip, timeout: 300_000 }, async () => {
  const stack = await launchStack({ BOTS: '0' })
  const browser = await launchBrowser()
  const errors = []
  try {
    for (const pitch of [0, -0.08]) {
      // vào hang mới: đứng ở chỗ xuất hiện (sát phòng chờ phía sau), nhìn thẳng về phía bắc
      const page = await newPage(browser, `C${pitch}`, { width: 1280, height: 800 }, { errors })
      await enterCave(page, stack.baseUrl, `Camera${pitch}`)
      await page.evaluate((p) => window.__hangSetYaw(0, p), pitch)
      await sleep(1500)
      const start = await page.evaluate(() => window.__hangStats().me)
      assert.ok(start && start[2] > 33, `đứng gần chỗ xuất hiện: ${JSON.stringify(start)}`)
      // ghi lại độ lệch camera − người chơi mỗi khung hình trong lúc giữ W
      const sampling = page.evaluate(() => new Promise((resolve) => {
        const rows = []
        const t0 = performance.now()
        const tick = () => {
          const s = window.__hangStats()
          if (s.me) rows.push({ t: performance.now(), off: [s.cameraAt[0] - s.me[0], s.cameraAt[1] - s.me[1], s.cameraAt[2] - s.me[2]], z: s.me[2] })
          if (performance.now() - t0 < 2200) requestAnimationFrame(tick)
          else resolve(rows)
        }
        requestAnimationFrame(tick)
      }))
      await page.keyboard.down('KeyW')
      const rows = await sampling
      await page.keyboard.up('KeyW')
      assert.ok(rows.length > 10, `đủ khung hình: ${rows.length}`)
      assert.ok(rows[0].z - rows.at(-1).z > 5, `đã chạy về phía trước: ${rows[0].z.toFixed(1)} → ${rows.at(-1).z.toFixed(1)}`)
      // Độ lệch camera so với người chơi chỉ được đổi từ từ (lùi ra ~0,1 m mỗi khung 60 Hz); lỗi cũ nhảy cả nấc 0,6–1,7 m trong một khung.
      // Khung bị rớt (cách nhau > 1/60 s) thì chia theo số khung; hai mẫu sát nhau (cùng một khung vẽ) thì gộp.
      let worst = 0
      let last = rows[0]
      for (const row of rows.slice(1)) {
        const dt = (row.t - last.t) / 1000
        if (dt < 0.01) continue
        worst = Math.max(worst, Math.hypot(...row.off.map((v, k) => v - last.off[k])) / Math.max(1, dt * 60))
        last = row
      }
      console.log(`pitch ${pitch}: ${rows.length} khung, độ lệch camera nhảy nhiều nhất ${worst.toFixed(2)} m/khung`)
      assert.ok(worst < 0.35, `pitch ${pitch}: độ lệch camera nhảy ${worst.toFixed(2)} m trong một khung (giật)`)
      await page.close()
    }
  } finally {
    await browser.close()
    await stack.stop()
  }
  assert.deepEqual([...new Set(errors)], [], 'không có lỗi console / pageerror')
})
