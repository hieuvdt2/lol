// Tạo nhân vật trước khi vào hang (xem trước 3D, chọn đội/da/tóc, ngẫu nhiên, nhớ lựa chọn) và đổi trang phục ngay trong hang.
import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeLook } from '../../shared/look.mjs'
import { LAYOUT_SELECTORS, audit, chromePath, enterCave, launchBrowser, launchStack, newPage, sleep, until } from './helpers.mjs'

const skip = chromePath() ? false : 'không có Chrome (đặt CHROME_PATH)'

test('tạo nhân vật và đổi trang phục', { skip, timeout: 420_000 }, async (t) => {
  const stack = await launchStack({ BOTS: '0' })
  const browser = await launchBrowser()
  const errors = []
  try {
    const A = await newPage(browser, 'A', { width: 1280, height: 800 }, { errors })

    await t.test('hộp thoại tạo nhân vật: có khung xem trước 3D, 10 đội, 5 màu da, 4 kiểu tóc, 5 màu tóc; mặc định áo T1; bố cục không tràn', async () => {
      await A.goto(stack.baseUrl, { waitUntil: 'load' })
      await A.waitForSelector('.home-panel .home-enter:not([disabled])', { timeout: 30000 })
      await A.locator('button', { hasText: 'Từ chối' }).first().click().catch(() => {})
      await A.click('.home-panel .home-enter')
      await A.waitForSelector('.char-dialog')
      assert.match((await A.locator('.char-dialog h2').textContent()) ?? '', /Tạo nhân vật/)
      await A.waitForSelector('.char-preview canvas')
      assert.equal(await A.locator('.char-team').count(), 10)
      assert.equal(await A.locator('.char-group').nth(1).locator('.char-swatch').count(), 5)
      assert.equal(await A.locator('.char-group').nth(2).locator('.char-chip').count(), 4)
      assert.equal(await A.locator('.char-group').nth(3).locator('.char-swatch').count(), 5)
      assert.match((await A.locator('.char-team[aria-pressed="true"]').textContent()) ?? '', /^T1$/)
      const box = await A.locator('.char-dialog').boundingBox()
      assert.ok(box.x >= 0 && box.x + box.width <= 1280 && box.y >= 0 && box.y + box.height <= 800, `hộp thoại nằm trong màn hình: ${JSON.stringify(box)}`)
      const preview = await A.locator('.char-preview').boundingBox()
      assert.ok(preview.width > 200 && preview.height > 250, `khung xem trước đủ lớn: ${JSON.stringify(preview)}`)
    })

    await t.test('chọn đội Hanjin BRION, da 4, tóc dài, tóc bạch kim; ngẫu nhiên đổi lựa chọn; ăn mừng không lỗi; vào hang với ngoại hình đã chọn', async () => {
      await A.locator('.char-random').click()
      await A.locator('.char-cheer').click()
      await A.locator('.char-team', { hasText: 'Hanjin BRION' }).click()
      await A.locator('.char-group').nth(1).locator('.char-swatch').nth(3).click()
      await A.locator('.char-chip', { hasText: 'Dài' }).click()
      await A.locator('.char-group').nth(3).locator('.char-swatch').nth(4).click()
      // "Ngẫu nhiên" cũng chọn phụ kiện: chọn hẳn kính cận, bình oxi, xe lăn ngay lúc tạo (lỗi đã gặp: vào hang thì mất hết ngoại hình)
      await A.locator('.char-acc[aria-label="Trên mặt"] .char-chip', { hasText: 'Kính cận' }).click()
      await A.locator('.char-acc[aria-label="Mang theo"] .char-chip', { hasText: 'Bình oxi' }).click()
      await A.locator('.char-chip', { hasText: 'Xe lăn' }).click()
      assert.equal(await A.locator('.char-team[aria-pressed="true"]').count(), 1)
      await A.locator('.name-input').first().fill('Fan Brion')
      assert.equal(await A.locator('.name-number').count(), 0, 'không còn ô số áo')
      await A.click('.char-dialog button[type=submit]')
      await A.waitForSelector('.quiz-dialog .quiz-answer')
      await A.locator('.quiz-answer').first().click()
      await A.waitForSelector('.quiz-dialog .home-enter')
      await A.click('.quiz-dialog .home-enter')
      await A.waitForFunction(() => /anh em trong hang/.test(document.querySelector('.hang-top p')?.textContent ?? ''), null, { timeout: 30000 })
      const code = await A.evaluate(() => window.__hangNet.local.look)
      assert.deepEqual(decodeLook(code), { team: 6, skin: 3, hair: 2, hairColor: 4, face: 1, carry: 1, ride: 1 })
      assert.equal(await A.evaluate(() => localStorage.getItem('hangmu.look')), String(code), 'lựa chọn được nhớ trên máy')
      // server trả đúng mã cho mọi người (danh sách người chơi) và nhân vật của mình có xe lăn
      const B = await newPage(browser, 'B', { width: 1280, height: 800 }, { errors })
      await enterCave(B, stack.baseUrl, 'Người xem')
      const seen = await B.evaluate(() => [...window.__hangNet.actors.values()].find((a) => a.name === 'Fan Brion')?.look ?? null)
      assert.equal(seen, code, 'người khác thấy đúng ngoại hình')
      await B.close()
      await until(async () => A.evaluate(() => window.__hangStats().rides.some((r) => r.i === window.__hangNet.local.index)), { timeout: 15000, label: 'xe lăn của mình' })
      // Đổi về đi bộ, không phụ kiện cho bài thử xe lăn phía sau
      await A.click('.hang-outfit-btn')
      await A.waitForSelector('.char-dialog')
      for (const group of ['Trên mặt', 'Mang theo']) await A.locator(`.char-acc[aria-label="${group}"] .char-chip`, { hasText: 'Không' }).click()
      await A.locator('.char-chip', { hasText: 'Đi bộ' }).click()
      await A.click('.char-dialog button[type=submit]')
      await A.waitForSelector('.char-dialog', { state: 'detached' })
      await until(async () => !(await A.evaluate(() => window.__hangStats().rides.some((r) => r.i === window.__hangNet.local.index))), { timeout: 15000, label: 'hết xe lăn' })
      await sleep(1700) // server chỉ cho đổi trang phục mỗi 1,5 s
    })

    await t.test('phụ kiện: xe lăn hiện dưới nhân vật, đi thì bánh lăn (quay tiếp theo quãng đường), đứng yên thì bánh dừng; ăn mừng thì nâng xe qua đầu; đổi lại đi bộ thì hết xe', async () => {
      await A.click('.hang-outfit-btn')
      await A.waitForSelector('.char-dialog')
      for (const label of ['Kính râm', 'Bình oxi', 'Xe lăn']) await A.locator('.char-chip', { hasText: label }).click()
      await A.click('.char-dialog button[type=submit]')
      await A.waitForSelector('.char-dialog', { state: 'detached' })
      const mine = () => A.evaluate(() => {
        const self = window.__hangNet.local.index
        return window.__hangStats().rides.find((r) => r.i === self) ?? null
      })
      await until(async () => (await mine()) !== null, { timeout: 15000, label: 'có xe lăn' })
      const lookNow = decodeLook(await A.evaluate(() => window.__hangNet.local.look))
      assert.deepEqual([lookNow.face, lookNow.carry, lookNow.ride], [2, 1, 1])
      assert.equal((await mine()).visible, true)
      const w0 = (await mine()).wheel
      await sleep(600)
      assert.ok(Math.abs((await mine()).wheel - w0) < 1e-6, 'đứng yên thì bánh không quay')
      await A.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await A.keyboard.down('KeyW')
      await sleep(1200)
      const moving = (await mine()).wheel
      await A.keyboard.up('KeyW')
      assert.ok(moving - w0 > 1, `đi tới thì bánh lăn: quay ${(moving - w0).toFixed(2)} rad`)
      // ăn mừng (G) khi ngồi xe lăn: đứng dậy nâng cả xe lên quá đầu như nâng cúp, xong thì hạ xe ngồi lại
      await sleep(600)
      await A.keyboard.press('KeyG')
      let high = 0
      const t0 = Date.now()
      while (Date.now() - t0 < 2000) {
        high = Math.max(high, (await mine()).chairY)
        await sleep(50)
      }
      assert.ok(high > 1.5, `nâng xe lên quá đầu: ${high.toFixed(2)} m`)
      await until(async () => (await mine()).chairY < 1e-3, { timeout: 12000, label: 'hạ xe sau khi ăn mừng' }) // ăn mừng 5,4 s
      await A.click('.hang-outfit-btn')
      await A.waitForSelector('.char-dialog')
      await A.locator('.char-chip', { hasText: 'Đi bộ' }).click()
      await A.click('.char-dialog button[type=submit]')
      await A.waitForSelector('.char-dialog', { state: 'detached' })
      await sleep(1700) // giới hạn đổi trang phục 1,5 s ở server
      await until(async () => (await mine()) === null, { timeout: 15000, label: 'đổi đi bộ thì hết xe lăn' })
    })

    const B = await newPage(browser, 'B', { width: 900, height: 600 }, { errors })
    await enterCave(B, stack.baseUrl, 'Bạn', 9)
    const lookOfA = () => B.evaluate(() => [...window.__hangNet.actors.values()].find((a) => a.name === 'Fan Brion')?.look ?? null)

    await t.test('người khác thấy đúng ngoại hình', async () => {
      await until(async () => (await lookOfA()) !== null, { timeout: 20000, label: 'B thấy A' })
      assert.deepEqual(decodeLook(await lookOfA()), { team: 6, skin: 3, hair: 2, hairColor: 4, face: 2, carry: 1, ride: 0 })
    })

    await t.test('đổi trang phục trong hang (nút 👕 Áo): hộp thoại chỉ đổi ngoại hình, Esc đóng mà không rời hang; lưu thì cả hang thấy và lần sau vẫn nhớ', async () => {
      await A.click('.hang-outfit-btn')
      await A.waitForSelector('.char-dialog')
      assert.match((await A.locator('.char-dialog h2').textContent()) ?? '', /Đổi trang phục/)
      assert.equal(await A.locator('.char-dialog .name-input').count(), 0, 'trong hang không đổi tên')
      await A.keyboard.press('Escape')
      await A.waitForSelector('.char-dialog', { state: 'detached' })
      assert.match((await A.locator('.hang-top p').textContent()) ?? '', /anh em trong hang/, 'Esc chỉ đóng hộp thoại')
      await A.click('.hang-outfit-btn')
      await A.waitForSelector('.char-dialog')
      const r = await audit(A, [...LAYOUT_SELECTORS, '.char-dialog'])
      assert.equal(r.hScroll, false)
      await A.locator('.char-team', { hasText: 'Gen.G' }).click()
      await A.click('.char-dialog button[type=submit]')
      await A.waitForSelector('.char-dialog', { state: 'detached' })
      await until(async () => decodeLook(await lookOfA()).team === 0, { timeout: 15000, label: 'B thấy áo Gen.G' })
      assert.equal(decodeLook(await A.evaluate(() => Number(localStorage.getItem('hangmu.look')))).team, 0)
      await sleep(500)
    })
  } finally {
    await browser.close()
    await stack.stop()
  }
  assert.deepEqual([...new Set(errors)], [], 'không có lỗi console / pageerror')
})
