// Đấu trường đầy đủ (khán giả, chùm đèn, màn LED động): vẽ được, không lỗi, khung hình vẫn chạy.
import test from 'node:test'
import assert from 'node:assert/strict'
import { chromePath, enterCave, launchBrowser, launchStack, newPage, sceneStats, sleep } from './helpers.mjs'

const skip = chromePath() ? false : 'không có Chrome (đặt CHROME_PATH)'

test('đấu trường chung kết: bản đầy đủ render được và khung hình vẫn chạy', { skip, timeout: 240_000 }, async (t) => {
  const stack = await launchStack({ BOTS: '2' })
  const browser = await launchBrowser()
  const errors = []
  try {
    const A = await newPage(browser, 'A', { width: 1000, height: 640 }, { errors, full: true })
    await enterCave(A, stack.baseUrl, 'Fan', 7)
    await t.test('cảnh đầy đủ vẽ được và có nhiều chi tiết', async () => {
      await sleep(2500)
      const stats = await sceneStats(A, await A.screenshot())
      assert.ok(stats.colors > 80 && stats.std > 8, `colors=${stats.colors} std=${stats.std}`)
      const info = await A.evaluate(() => window.__hangStats())
      assert.ok(info.triangles > 50000, `có khán đài, bục và giàn đèn: ${info.triangles} tam giác`)
    })
    await t.test('khung hình tiếp tục chạy (không treo vì cập nhật đèn/màn LED)', async () => {
      const frames = await A.evaluate(() => new Promise((resolve) => { let n = 0; const t0 = performance.now(); const tick = () => { n += 1; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve(n) }; requestAnimationFrame(tick) }))
      assert.ok(frames >= 6, `chỉ ${frames} khung trong 2 s`)
    })
    await t.test('màn hình lớn YouTube: không gọi bên thứ ba trước khi bấm; dán link và phát thì iframe nằm ở lớp CSS3D và lộ ra qua "lỗ" của cảnh 3D', async () => {
      const thirdParty = []
      await A.route('https://www.youtube-nocookie.com/**', (route) => {
        thirdParty.push(route.request().url())
        return route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;background:#00ff00"></body></html>' })
      })
      await A.click('.hang-tv-btn')
      await A.waitForSelector('.hang-tv')
      assert.deepEqual(thirdParty, [], 'mở bảng điều khiển chưa được tải gì của bên thứ ba')
      assert.equal(await A.locator('.hang-tv-layer iframe').count(), 0)
      assert.equal(await A.locator('.hang-tv .carved-btn--primary', { hasText: 'Phát video của hang' }).isDisabled(), true, 'hang chưa có video thì nút phát của hang bị khoá')
      await A.fill('.hang-tv-link input', 'không phải link')
      await A.click('.hang-tv-link button')
      assert.match((await A.locator('.hang-tv-error').textContent()) ?? '', /chưa đúng/)
      assert.deepEqual(thirdParty, [])
      await A.fill('.hang-tv-link input', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      await A.click('.hang-tv-link button')
      await A.waitForSelector('.hang-tv-layer iframe', { state: 'attached' })
      const src = await A.locator('.hang-tv-layer iframe').getAttribute('src')
      assert.match(src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/)
      assert.match(src, /enablejsapi=1/)
      assert.equal(await A.locator('.hang-tv-layer iframe').getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-presentation')
      assert.ok(thirdParty.length > 0, 'sau khi bấm phát mới gọi trình phát')
      // đứng trong khu hội trường nhìn về màn hình ở vách phía −z (camera mặc định nhìn về −z): iframe (nền xanh giả) phải lộ ra trong ảnh
      await A.evaluate(() => {
        const me = window.__hangNet.local
        for (const b of [me.curr, me.prev, me.draw]) { b.x = 0; b.z = -14; b.vx = 0; b.vz = 0 }
        window.__hangSetYaw(0)
      })
      await sleep(2500)
      const shot = (await A.screenshot()).toString('base64')
      const count = await A.evaluate(async (b64) => {
        const image = new Image()
        image.src = 'data:image/png;base64,' + b64
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const g = canvas.getContext('2d')
        g.drawImage(image, 0, 0)
        const data = g.getImageData(0, 0, canvas.width, canvas.height).data
        let n = 0
        for (let i = 0; i < data.length; i += 4) if (data[i + 1] > 200 && data[i] < 80 && data[i + 2] < 80) n += 1
        return n
      }, shot)
      assert.ok(count > 4000, `iframe phải lộ ra qua lỗ của màn hình: ${count} điểm ảnh xanh`)
      // điều khiển: tạm dừng/tắt tiếng không lỗi; tắt thì iframe biến mất và áp phích quay lại
      await A.click('.hang-tv-controls button[aria-label="Tạm dừng"]')
      await A.click('.hang-tv-controls button[aria-label="Tắt tiếng video"]')
      await A.click('.hang-tv-controls button:has-text("Tắt")')
      assert.equal(await A.locator('.hang-tv-layer iframe').count(), 0)
      await A.unroute('https://www.youtube-nocookie.com/**')
    })
    assert.deepEqual(errors, [], errors.join('\n'))
  } finally {
    await browser.close()
    await stack.stop()
  }
})
