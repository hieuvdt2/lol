// E2E chat nhanh: nút ⚡ mở danh sách câu có sẵn, chọn là gửi (người khác nhận được), Esc chỉ đóng danh sách, bố cục không tràn.
import test from 'node:test'
import assert from 'node:assert/strict'
import { LAYOUT_SELECTORS, audit, chromePath, enterCave, launchBrowser, launchStack, newPage, until } from './helpers.mjs'
import { QUICK_CHAT } from '../../src/content/quickChat.ts'

const skip = chromePath() ? false : 'Không tìm thấy Chrome: đặt CHROME_PATH'

async function layoutOk(page, label) {
  const r = await audit(page, LAYOUT_SELECTORS) // danh sách nằm trong khung chat (.hang-chat): khung chat không được đè thứ khác, không tràn
  assert.deepEqual(r.overlaps, [], `${label}: chồng chéo`)
  assert.deepEqual(r.off, [], `${label}: tràn khỏi màn hình`)
  assert.equal(r.hScroll, false, `${label}: cuộn ngang`)
}

test('chat nhanh', { skip, timeout: 420_000 }, async (t) => {
  const stack = await launchStack({ BOTS: '0' })
  const browser = await launchBrowser()
  const errors = []
  try {
    const A = await newPage(browser, 'A', { width: 1280, height: 800 }, { errors })
    const B = await newPage(browser, 'B', { width: 1100, height: 700 }, { errors })
    await enterCave(A, stack.baseUrl, 'Nhanh')
    await enterCave(B, stack.baseUrl, 'Nghe')

    await t.test('máy tính: ⚡ mở danh sách 6 câu; bố cục không tràn; chọn câu thì gửi, danh sách đóng, người khác nhận được', async () => {
      await A.click('.hang-quick-btn')
      await A.waitForSelector('.hang-quick')
      assert.equal(await A.getAttribute('.hang-quick-btn', 'aria-expanded'), 'true')
      assert.deepEqual(await A.locator('.hang-quick-item').allTextContents(), QUICK_CHAT.map((text, i) => `${i + 1} ${text}`), 'mỗi câu kèm số phím tắt')
      await layoutOk(A, 'danh sách chat nhanh mở (1280×800)')
      const pick = QUICK_CHAT[3]
      await A.locator('.hang-quick-item', { hasText: pick }).click()
      assert.equal(await A.locator('.hang-quick').count(), 0, 'chọn xong thì đóng danh sách')
      await A.waitForSelector('.hang-chat li[data-state="sent"]', { timeout: 6000 })
      assert.match((await A.locator('.hang-chat li[data-state="sent"]').last().textContent()) ?? '', /Faker, what was that\?!/)
      await until(async () => (await B.locator('.hang-chat li', { hasText: pick }).count()) >= 1, { timeout: 8000, label: 'người khác nhận được câu chat nhanh' })
      assert.ok(await B.evaluate((text) => [...window.__hangNet.bubbles.values()].some((b) => b.text === text), pick), 'hiện bong bóng trên đầu người gửi')
    })

    await t.test('câu có dấu * (dễ vãi l**) gửi nguyên văn', async () => {
      await A.waitForTimeout(1600) // giới hạn 1,5 s giữa hai tin
      await A.click('.hang-quick-btn')
      await A.locator('.hang-quick-item').nth(1).click()
      await until(async () => (await B.locator('.hang-chat li', { hasText: QUICK_CHAT[1] }).count()) >= 1, { timeout: 8000, label: 'nhận nguyên văn câu 2' })
    })

    await t.test('gõ chat rồi Enter: gửi xong tự rời ô chat, W đi được ngay; Enter khi ô trống cũng thoát; đang gõ có dòng nhắc Enter/Esc', async () => {
      await A.waitForTimeout(1600)
      await A.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await A.keyboard.press('Enter')
      await until(() => A.evaluate(() => document.activeElement?.matches('.hang-chat input') ?? false), { label: 'Enter mở ô chat' })
      assert.match((await A.locator('.hang-chat-tip').textContent()) ?? '', /Enter.*gửi.*Esc.*thoát/)
      await A.keyboard.type('Chào cả hang')
      await A.keyboard.press('Enter')
      await until(() => A.evaluate(() => !document.activeElement?.matches('.hang-chat input')), { label: 'gửi xong rời ô chat' })
      assert.equal(await A.locator('.hang-chat-tip').count(), 0)
      await A.keyboard.press('Escape') // thói quen "thoát ô chat" ngay sau khi gửi: không được rời hang
      assert.equal(await A.locator('.hang-scene').count(), 1, 'Esc ngay sau khi gửi không làm rời hang')
      await until(async () => (await B.locator('.hang-chat li', { hasText: 'Chào cả hang' }).count()) >= 1, { timeout: 8000, label: 'tin đã gửi' })
      const pos = () => A.evaluate(() => { const m = window.__hangNet.local.draw; return { x: m.x, z: m.z } })
      const p0 = await pos()
      await A.keyboard.down('KeyW')
      await A.waitForTimeout(700)
      await A.keyboard.up('KeyW')
      const p1 = await pos()
      assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, 'W điều khiển nhân vật ngay sau khi gửi')
      await A.keyboard.press('Enter')
      await until(() => A.evaluate(() => document.activeElement?.matches('.hang-chat input') ?? false), { label: 'mở lại ô chat' })
      await A.keyboard.press('Enter')
      await until(() => A.evaluate(() => !document.activeElement?.matches('.hang-chat input')), { label: 'Enter ô trống thì thoát' })
      assert.equal(await A.locator('.hang-scene').count(), 1, 'vẫn ở trong hang')
    })

    await t.test('phím tắt 1–6: bấm 5 gửi thẳng câu 5 (không cần mở danh sách); đang gõ chat thì phím 5 chỉ là chữ; bảng phím H có dòng chat nhanh', async () => {
      await A.waitForTimeout(1600)
      await A.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await A.keyboard.press('Digit5')
      await until(async () => (await B.locator('.hang-chat li', { hasText: QUICK_CHAT[4] }).count()) >= 1, { timeout: 8000, label: 'phím 5 gửi câu 5' })
      assert.equal(await A.locator('.hang-quick').count(), 0, 'không cần mở danh sách')
      await A.waitForTimeout(1600)
      await A.keyboard.press('Enter')
      await until(() => A.evaluate(() => document.activeElement?.matches('.hang-chat input') ?? false), { label: 'mở ô chat' })
      await A.keyboard.type('top 5')
      assert.equal(await A.inputValue('.hang-chat input'), 'top 5', 'đang gõ thì 5 là chữ')
      await A.keyboard.press('Enter')
      await until(async () => (await B.locator('.hang-chat li', { hasText: 'top 5' }).count()) >= 1, { timeout: 8000, label: 'tin gõ tay' })
      assert.equal(await B.locator('.hang-chat li', { hasText: QUICK_CHAT[4] }).count(), 1, 'không gửi nhầm câu 5 lần nữa')
      await A.keyboard.press('KeyH')
      await A.waitForSelector('.hang-keys')
      assert.match((await A.locator('.hang-keys').textContent()) ?? '', /1 – 6\s*Chat nhanh/)
      await A.keyboard.press('KeyH')
    })

    await t.test('Esc khi danh sách đang mở: chỉ đóng danh sách, không rời hang; bấm ⚡ lần nữa cũng đóng', async () => {
      await A.click('.hang-quick-btn')
      await A.waitForSelector('.hang-quick')
      await A.keyboard.press('Escape')
      assert.equal(await A.locator('.hang-quick').count(), 0)
      assert.equal(await A.locator('.hang-scene').count(), 1, 'vẫn ở trong hang')
      await A.click('.hang-quick-btn')
      await A.waitForSelector('.hang-quick')
      await A.click('.hang-quick-btn')
      assert.equal(await A.locator('.hang-quick').count(), 0)
    })

    await t.test('điện thoại 390×844: mở chat bằng 💬, có ⚡, danh sách vừa màn hình, chọn câu thì gửi', async () => {
      await A.close() // bớt một trang vẽ WebGL phần mềm (máy thử chậm)
      const M = await newPage(browser, 'M', { width: 390, height: 844 }, { mobile: true, errors })
      await enterCave(M, stack.baseUrl, 'Cảm ứng')
      await M.tap('button[aria-label="Mở chat"]')
      await M.waitForSelector('.hang-quick-btn')
      await M.tap('.hang-quick-btn')
      await M.waitForSelector('.hang-quick')
      await layoutOk(M, 'danh sách chat nhanh mở (390×844)')
      const box = await M.locator('.hang-quick').boundingBox()
      assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, `nằm trong màn hình: ${JSON.stringify(box)}`)
      await M.locator('.hang-quick-item').first().tap()
      await until(async () => (await B.locator('.hang-chat li', { hasText: QUICK_CHAT[0] }).count()) >= 1, { timeout: 8000, label: 'người khác nhận câu từ điện thoại' })
    })
  } finally {
    await browser.close()
    await stack.stop()
  }
  assert.deepEqual([...new Set(errors)], [], 'không có lỗi console / pageerror')
})
