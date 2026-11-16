// E2E cảm ứng 390×844: joystick, kéo để nhìn, nút hành động, chat gập, mời, duel, bố cục.
import test from 'node:test'
import assert from 'node:assert/strict'
import { LAYOUT_SELECTORS, audit, chromePath, enterCave, holdTouch, launchBrowser, launchStack, newPage, sceneDiff, sleep, until } from './helpers.mjs'

const skip = chromePath() ? false : 'Không tìm thấy Chrome: đặt CHROME_PATH'
const myZ = (page) => page.evaluate(() => window.__hangNet.local.draw.z)
const nearestHuman = (page) =>
  page.evaluate(() => {
    const n = window.__hangNet
    const me = n.local
    let best = Infinity
    for (const a of n.actors.values()) if (!a.local && !a.bot) best = Math.min(best, Math.hypot(a.draw.x - me.draw.x, a.draw.z - me.draw.z))
    return best
  })
async function layoutOk(page, label) {
  const r = await audit(page, LAYOUT_SELECTORS)
  assert.deepEqual(r.overlaps, [], `${label}: chồng chéo`)
  assert.deepEqual(r.off, [], `${label}: tràn khỏi màn hình`)
  assert.equal(r.hScroll, false, `${label}: cuộn ngang`)
}

test('điều khiển cảm ứng 390×844', { skip, timeout: 600_000 }, async (t) => {
  const stack = await launchStack()
  const browser = await launchBrowser()
  const errors = []
  try {
    const B = await newPage(browser, 'B', { width: 1100, height: 700 }, { errors })
    await enterCave(B, stack.baseUrl, 'Bob')
    const M = await newPage(browser, 'M', { width: 390, height: 844 }, { mobile: true, errors })
    const lobby = await enterCave(M, stack.baseUrl, 'Mobile', 9)
    await sleep(1500)
    const cdp = await M.context().newCDPSession(M)

    await t.test('sảnh trên điện thoại: banner cookie không che nút', () => assert.equal(lobby.lobbyButtonWasCovered, false))

    await t.test('nhận ra màn hình cảm ứng: có điều khiển ảo, ẩn chú thích phím, chat gập, gợi ý cảm ứng', async () => {
      assert.equal(await M.evaluate(() => matchMedia('(pointer: coarse)').matches), true)
      assert.equal(await M.locator('.touch-joy').count(), 1)
      assert.equal(await M.locator('.touch-btn--hit').count(), 1)
      assert.equal(await M.evaluate(() => [...document.querySelectorAll('.kbd-hint')].every((e) => getComputedStyle(e).display === 'none')), true)
      assert.equal(await M.locator('.hang-chat').count(), 0)
      await layoutOk(M, 'touch idle')
    })

    await t.test('chạm 👊 khi đứng gần người khác: server nhận đòn, chat mở bằng 💬', async () => {
      await until(async () => /Bob/.test((await M.locator('.hang-hint').textContent()) ?? ''), { timeout: 10000, label: 'gợi ý có Bob' })
      assert.match((await M.locator('.hang-hint').textContent()) ?? '', /👊/)
      await M.tap('.touch-btn--hit')
      await M.tap('button[aria-label="Mở chat"]')
      await M.waitForSelector('.hang-chat')
      await until(async () => (await M.locator('.hang-chat li', { hasText: 'đã 👊 Bob' }).count()) >= 1, { label: 'dòng "đã 👊 Bob"' })
      await layoutOk(M, 'touch chat open')
    })

    await t.test('joystick đứng yên khi chat mở/đóng (không dịch dưới ngón tay)', async () => {
      const open = await M.locator('.touch-joy').boundingBox()
      await M.tap('button[aria-label="Mở chat"]')
      await sleep(300)
      const closed = await M.locator('.touch-joy').boundingBox()
      assert.ok(Math.abs(open.y - closed.y) < 1, `open=${open.y} closed=${closed.y}`)
    })

    const joy = await M.locator('.touch-joy').boundingBox()
    const c = { x: joy.x + joy.width / 2, y: joy.y + joy.height / 2 }

    await t.test('kéo joystick thì đi tới; thả ra cần về giữa', async () => {
      const before = await M.screenshot()
      const z0 = await myZ(M)
      await holdTouch(cdp, c, { x: c.x, y: c.y - 46 }, async () => Math.abs((await myZ(M)) - z0) > 5)
      await sleep(300)
      assert.ok(Math.abs((await myZ(M)) - z0) > 5, 'đã đi được')
      assert.ok((await sceneDiff(M, before, await M.screenshot())) > 1.5)
      assert.match(await M.evaluate(() => document.querySelector('.touch-joy-knob').style.transform), /translate\(0px, 0px\)/)
    })

    await t.test('kéo màn hình xoay camera, trang không bị cuộn, gợi ý trở về mặc định khi không còn ai gần', async () => {
      const before = await M.screenshot()
      await holdTouch(cdp, { x: 200, y: 300 }, { x: 330, y: 300 })
      await sleep(300)
      assert.ok((await sceneDiff(M, before, await M.screenshot())) > 2, 'camera đã xoay')
      assert.equal(await M.evaluate(() => scrollX === 0 && scrollY === 0), true)
      await until(async () => !/đang đứng gần/.test((await M.locator('.hang-hint').textContent()) ?? ''), { label: 'gợi ý quay về mặc định' })
    })

    await t.test('widget LCK trên điện thoại: chip gọn không tràn, mở ra có bảng xếp hạng cuộn được, không chồng chéo', async () => {
      const chip = M.locator('.hang-lck-chip')
      await chip.waitFor({ timeout: 30000 })
      await layoutOk(M, 'chip LCK')
      await chip.tap()
      await M.waitForSelector('.hang-lck-table tbody tr')
      await layoutOk(M, 'LCK mở rộng')
      const box = await M.locator('.hang-lck').boundingBox()
      assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `widget nằm trong màn hình: ${JSON.stringify(box)}`)
      await chip.tap()
      assert.equal(await M.locator('.hang-lck-table').count(), 0)
    })

    await t.test('bảng ném đồ trên điện thoại không chồng chéo', async () => {
      await M.tap('.hang-top .carved-btn:has-text("Ném đồ")')
      await M.waitForSelector('.hang-rage')
      await layoutOk(M, 'rage open')
      await M.tap('.hang-rage header button')
    })

    await t.test('đi lại gần Bob (hoàn lại góc nhìn trước)', async () => {
      await holdTouch(cdp, { x: 330, y: 300 }, { x: 200, y: 300 })
      await holdTouch(cdp, c, { x: c.x, y: c.y + 46 }, async () => (await nearestHuman(M)) < 3.5)
      await until(async () => (await nearestHuman(M)) < 5, { label: 'đã lại gần Bob' })
      await sleep(1000)
    })

    await t.test('Bob mời chat riêng: hộp thoại và khung chat không chồng chéo trên điện thoại', async () => {
      await B.locator('.hang-talk-btn button:has-text("Giao lưu mồm")').click({ timeout: 10000 })
      await M.waitForSelector('.hang-invite')
      await layoutOk(M, 'invite dialog')
      await M.tap('.hang-invite button:has-text("Đồng ý")')
      await M.waitForSelector('.hang-talk')
      await B.fill('.hang-talk input', 'chào bạn mobile')
      await B.keyboard.press('Enter')
      await M.waitForSelector('.hang-talk li:has-text("chào bạn mobile")')
      assert.equal(await M.locator('.hang-touch').count(), 0, 'điều khiển ẩn khi đang chat riêng')
      await layoutOk(M, 'talk panel')
      await B.click('.hang-talk header button')
      await B.click('.hang-talk header button')
      await M.locator('.hang-talk header button', { hasText: 'Đóng' }).tap()
      await B.locator('.hang-talk header button', { hasText: 'Đóng' }).click()
      await until(async () => (await M.locator('.hang-touch').count()) === 1, { label: 'điều khiển trở lại' })
    })

    await t.test('đặt ngón trên cần điều khiển rồi bị gỡ cần (chat riêng bắt đầu): quay lại không tự đi', async () => {
      const pos = () => M.evaluate(() => { const d = window.__hangNet.local.draw; return { x: d.x, z: d.z } })
      const box = await M.locator('.touch-joy').boundingBox()
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centre.x, y: centre.y, id: 7 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: centre.x + 30, y: centre.y - 30, id: 7 }] })
      // ngón vẫn đặt trên cần; Bob mời chat riêng, Mobile đồng ý bằng phím (ngón đang bận)
      await B.locator('.hang-talk-btn button:has-text("Giao lưu mồm")').click({ timeout: 10000 })
      await M.waitForSelector('.hang-invite')
      await M.keyboard.press('KeyY')
      await M.waitForSelector('.hang-talk')
      assert.equal(await M.locator('.hang-touch').count(), 0, 'cần bị gỡ')
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) // nhả khi cần đã không còn
      await B.click('.hang-talk header button')
      await B.click('.hang-talk header button')
      await M.locator('.hang-talk header button', { hasText: 'Đóng' }).tap()
      await B.locator('.hang-talk header button', { hasText: 'Đóng' }).click()
      await until(async () => (await M.locator('.hang-touch').count()) === 1, { label: 'điều khiển trở lại' })
      const before = await pos()
      await sleep(2500)
      const after = await pos()
      const moved = Math.hypot(after.x - before.x, after.z - before.z)
      assert.ok(moved < 0.3, `nhân vật tự đi ${moved.toFixed(2)} đơn vị khi không ai chạm`)
    })

    await t.test('ném đồ trên điện thoại: bảng gọn dán đáy, hình nộm đẩy lên nửa trên, không che', async () => {
      await M.tap('.hang-top .carved-btn:has-text("Ném đồ")')
      await M.waitForSelector('.hang-rage')
      await sleep(2500) // camera lướt tới hình nộm
      const panel = await M.locator('.hang-rage').boundingBox()
      assert.ok(panel.height < 844 * 0.38, `bảng cao ${Math.round(panel.height)}px (tối đa 38% màn hình)`)
      assert.ok(panel.y + panel.height <= 844 + 1 && panel.y > 844 * 0.55, `bảng nằm ở đáy: y=${Math.round(panel.y)}`)
      assert.equal(await M.locator('.hang-touch').count(), 0, 'ẩn cần điều khiển khi ném đồ')
      assert.equal(await M.locator('.hang-dock').isVisible(), false, 'ẩn khung chat khi ném đồ')
      await layoutOk(M, 'ném đồ gọn')
      // Hình nộm phải nằm phía trên bảng: lấy mẫu điểm ảnh vùng giữa-trên khác với nền trời/đất (có nội dung)
      const before = await M.evaluate(() => window.__hangStats().rageFlying)
      await M.tap('.hang-rage .carved-btn--primary:has-text("Ném nhanh")')
      await M.mouse.click(195, 250) // chạm vào vùng hình nộm (nửa trên)
      void before
      await M.tap('.hang-rage header button')
      assert.equal(await M.locator('.hang-rage').count(), 0)
    })

    await t.test('duel bằng chạm: nút Đỡ/Đấm, ẩn điều khiển, bố cục ổn, thoát về hang', async () => {
      await B.locator('.hang-talk-btn button:has-text("Giao lưu võ thuật")').click({ timeout: 10000 })
      await M.waitForSelector('.hang-invite')
      await M.tap('.hang-invite button:has-text("Đồng ý")')
      await M.waitForSelector('.duel')
      assert.equal(await M.locator('.hang-touch').count(), 0)
      await M.waitForSelector('.duel-actions', { timeout: 10000 })
      assert.equal(await M.evaluate(() => window.__hangStats().arena), true, 'điện thoại cũng vẽ sàn đấu 3D')
      assert.equal(await M.evaluate(() => [...document.querySelectorAll('.duel .kbd-hint')].every((e) => getComputedStyle(e).display === 'none')), true)
      await M.tap('.duel-actions .carved-btn--primary')
      await until(() => M.locator('.duel-actions .carved-btn--primary').isDisabled(), { label: 'đấm xong thì hồi chiêu' })
      await layoutOk(M, 'duel fight')
      await M.tap('.duel-quit button')
      await M.tap('.duel-quit button:has-text("Bỏ cuộc")')
      await M.waitForSelector('.duel-end')
      await M.tap('.duel-end .carved-btn--primary')
      await until(async () => (await M.locator('.hang-touch').count()) === 1, { label: 'điều khiển trở lại sau duel' })
    })
  } finally {
    await browser.close()
    await stack.stop()
  }
  assert.deepEqual([...new Set(errors)], [], 'không có lỗi console / pageerror')
})
