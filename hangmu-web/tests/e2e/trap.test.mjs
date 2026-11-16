// E2E "Bẫy Độc Noxus": mời bằng phím B, đồng ý bằng Y, giấu nấm (2 ô mỗi hàng, tối đa 1 nấm), dò đường bằng phím 1–2 / bấm ô,
// dẫm nấm mất mạng, tới đích thì thắng, màn kết quả, thông báo cho cả hang.
import test from 'node:test'
import assert from 'node:assert/strict'
import { chromePath, enterCave, launchBrowser, launchStack, newPage, until } from './helpers.mjs'
import { TRAP, cellOf } from '../../shared/trap.mjs'

const skip = chromePath() ? false : 'Không tìm thấy Chrome: đặt CHROME_PATH'
const SHOTS = process.env.TRAP_SHOTS // thư mục lưu ảnh chụp (tuỳ chọn, để xem giao diện)
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` })
const foeCell = (page, cell) => page.locator(`.trap-lane[data-who="foe"] .trap-cell[data-cell="${cell}"]`)
const myCell = (page, cell) => page.locator(`.trap-lane[data-who="me"] .trap-cell[data-cell="${cell}"]`)

async function inBox(page, w, h) {
  // cả khung lẫn từng phần bên trong (làn, nút, ô) đều nằm trong màn hình (phần tử con có thể tràn khỏi khung)
  for (const sel of ['.trap', '.trap-head', '.trap-quit', '.trap-lane', '.trap-cell']) {
    for (const box of await page.locator(sel).evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().toJSON()))) {
      assert.ok(box.x >= -1 && box.y >= -1 && box.right <= w + 1 && box.bottom <= h + 1, `${sel} nằm trong màn hình ${w}×${h}: ${JSON.stringify(box)}`)
    }
  }
}

test('Bẫy Độc Noxus', { skip, timeout: 420_000 }, async (t) => {
  const stack = await launchStack({ BOTS: '0', TRAP_PLACE_MS: '60000', TRAP_TURN_MS: '20000', TRAP_REVEAL_MS: '300' })
  const browser = await launchBrowser()
  const errors = []
  try {
    const A = await newPage(browser, 'A', { width: 1280, height: 800 }, { errors })
    const B = await newPage(browser, 'B', { width: 1100, height: 700 }, { errors })
    await enterCave(A, stack.baseUrl, 'Teemo')
    await enterCave(B, stack.baseUrl, 'Keria')

    await t.test('mời bằng phím B (nút 🍄 cũng có), đồng ý bằng Y → cả hai vào giai đoạn giấu nấm', async () => {
      await until(async () => (await A.locator('.hang-trap-btn').count()) === 1, { timeout: 20000, label: 'nút 🍄 khi đứng gần' })
      await A.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await A.keyboard.press('KeyB')
      await B.waitForSelector('.hang-invite[role="alertdialog"]', { timeout: 10000 })
      assert.match((await B.locator('.hang-invite[role="alertdialog"]').textContent()) ?? '', /Teemo.*Bẫy Độc Noxus/)
      await B.keyboard.press('KeyY')
      await A.waitForSelector('.trap[data-phase="place"]', { timeout: 10000 })
      await B.waitForSelector('.trap[data-phase="place"]', { timeout: 10000 })
      assert.match((await A.locator('.trap-head').textContent()) ?? '', /Bẫy Độc Noxus.*Keria/)
      await inBox(A, 1280, 800)
      await inBox(B, 1100, 700)
    })

    await t.test('giấu nấm: làn đối thủ đứng trước và nổi bật (nhãn ĐỐI THỦ), làn mình mờ (nhãn BẠN); bấm ô kia cùng hàng thì nấm đổi bên; quá 5 nấm thì báo; đủ 5 mới xác nhận được', async () => {
      const foeLane = A.locator('.trap-lane[data-who="foe"]')
      const meLane = A.locator('.trap-lane[data-who="me"]')
      assert.equal(await foeLane.getAttribute('data-active'), 'true', 'đang thao tác trên đường đối thủ')
      assert.equal(await meLane.getAttribute('data-active'), null)
      assert.ok((await foeLane.boundingBox()).x < (await meLane.boundingBox()).x, 'làn đang thao tác đứng trước')
      assert.match((await foeLane.locator('.trap-lane-head').textContent()) ?? '', /ĐỐI THỦ.*Đường của Keria/)
      assert.match((await meLane.locator('.trap-lane-head').textContent()) ?? '', /BẠN.*Đường của bạn/)
      assert.match((await meLane.locator('.trap-caption').textContent()) ?? '', /Keria đang giấu nấm/)
      assert.ok((await foeLane.boundingBox()).width > (await meLane.boundingBox()).width, 'làn đang thao tác to hơn')
      const confirm = A.locator('.trap-confirm')
      const drafts = () => A.locator('.trap-lane[data-who="foe"] .trap-cell[data-mushroom="draft"]')
      await foeCell(A, cellOf(0, 0)).click()
      await foeCell(A, cellOf(0, 1)).click() // cùng hàng: đổi bên
      assert.equal(await drafts().count(), 1)
      assert.equal(await foeCell(A, cellOf(0, 1)).getAttribute('data-mushroom'), 'draft')
      await foeCell(A, cellOf(0, 1)).click() // nhổ lên
      assert.equal(await drafts().count(), 0)
      assert.equal(await confirm.isDisabled(), true)
      for (let row = 0; row <= 4; row += 1) await foeCell(A, cellOf(row, 0)).click() // đường của Keria: bên trái toàn nấm (hàng 1–5)
      await foeCell(A, cellOf(5, 1)).click()
      await A.waitForSelector('.trap-tip')
      assert.match((await A.locator('.trap-tip').textContent()) ?? '', /Chỉ có 5 nấm/)
      assert.match((await confirm.textContent()) ?? '', /5\/5/)
      await shot(A, '1-place')
      await confirm.click()
      await B.waitForFunction(() => /Teemo đã giấu xong/.test(document.querySelector('.trap-status')?.textContent ?? ''), null, { timeout: 8000 })
      // Keria giấu nấm bên phải trên đường Teemo (bên trái của Teemo an toàn) và xác nhận bằng Enter
      for (let row = 0; row <= 4; row += 1) await foeCell(B, cellOf(row, 1)).click()
      await B.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await B.keyboard.press('Enter')
      await A.waitForSelector('.trap[data-phase="walk"]', { timeout: 10000 })
      await B.waitForSelector('.trap[data-phase="walk"]', { timeout: 10000 })
      assert.equal(await A.locator('.trap-lane[data-who="foe"] .trap-cell[data-mushroom="mine"]').count(), 5, 'thấy nấm mình đã giấu trên đường đối thủ')
      assert.equal(await A.locator('.trap-lane[data-who="me"] .trap-cell[data-mushroom]').count(), 0, 'không thấy nấm trên đường mình')
      assert.equal(await meLane.getAttribute('data-active'), 'true', 'lúc dò đường: làn của mình nổi bật')
      assert.ok((await meLane.boundingBox()).x < (await foeLane.boundingBox()).x, 'làn của mình đứng trước')
    })

    await t.test('dò đường: lượt 1 Teemo bấm phím 1 (bên trái, an toàn), Keria bấm ô bên trái (dẫm nấm) → Keria mất 1 mạng, nấm lộ; tiếp tục tới khi Teemo về đích', async () => {
      const ready = (page, row) => until(async () => !(await myCell(page, cellOf(row, 0)).isDisabled()) || !(await myCell(page, cellOf(row, 1)).isDisabled()), { timeout: 15000, label: `hàng ${row + 1} mở` })
      await ready(A, 0)
      await A.keyboard.press('Digit1')
      await until(async () => (await A.locator('.trap-cell[data-picked]').count()) === 1, { label: 'đã chọn' })
      await ready(B, 0)
      await myCell(B, cellOf(0, 0)).click() // nấm
      await until(async () => (await B.locator('.trap-lane[data-who="me"] .trap-cell[data-mushroom="hit"]').count()) === 1, { label: 'Keria dẫm nấm' })
      assert.match((await B.locator('.trap-lane[data-who="me"] .trap-hearts').textContent()) ?? '', /^❤❤♡$/)
      assert.equal(await A.locator('.trap-lane[data-who="foe"] .trap-cell[data-mushroom="hit"]').count(), 1, 'Teemo thấy Keria dẫm nấm')
      assert.equal(await A.locator('.trap-lane[data-who="me"] .trap-cell[data-path]').count(), 1, 'Teemo tiến 1 hàng')
      await shot(B, '2-hit')
      for (let row = 1; row < TRAP.rows; row += 1) {
        await ready(A, row)
        await A.keyboard.press('Digit1')
        const bRow = await B.evaluate(() => window.__hangNet.trap.getSnapshot().me.row)
        await ready(B, bRow)
        await myCell(B, cellOf(bRow, 1)).click() // bên phải an toàn
        await until(async () => (await A.locator('.trap-lane[data-who="me"] .trap-cell[data-path]').count()) === row + 1 || (await A.locator('.trap-end').count()) === 1, { timeout: 15000, label: `lượt ${row + 1}` })
      }
      await A.waitForSelector('.trap-end', { timeout: 15000 })
      await B.waitForSelector('.trap-end', { timeout: 15000 })
      assert.match((await A.locator('.trap-end').textContent()) ?? '', /BẠN THẮNG.*về đích trước/)
      assert.match((await B.locator('.trap-end').textContent()) ?? '', /THUA RỒI.*Teemo về đích trước/)
      assert.ok((await B.locator('.trap-lane[data-who="me"] .trap-cell[data-mushroom]').count()) >= 5, 'hết trận: lộ hết nấm trên đường Keria')
      await shot(A, '3-end')
    })

    await t.test('đóng màn kết quả → thấy thông báo nổi bật cho cả hang "Teemo thắng Bẫy Độc Noxus trước Keria"', async () => {
      await A.locator('.trap-end button').click()
      assert.equal(await A.locator('.trap').count(), 0)
      const banner = A.locator('.hang-event', { hasText: 'Bẫy Độc Noxus' })
      await banner.waitFor({ timeout: 15000 })
      assert.match((await banner.textContent()) ?? '', /Teemo thắng Bẫy Độc Noxus trước Keria/)
      await shot(A, '4-banner')
      await B.keyboard.press('Escape') // Esc đóng màn kết quả
      assert.equal(await B.locator('.trap').count(), 0)
      assert.equal(await B.locator('.hang-scene').count(), 1, 'Esc không làm rời hang')
    })

    await t.test('bỏ cuộc giữa trận: Esc hỏi lại, xác nhận thì xử thua', async () => {
      await B.waitForTimeout(800)
      await until(async () => (await B.locator('.hang-trap-btn').count()) === 1, { timeout: 10000, label: 'nút 🍄' })
      await B.locator('.hang-trap-btn').click()
      await A.waitForSelector('.hang-invite[role="alertdialog"]', { timeout: 10000 })
      await A.keyboard.press('KeyY')
      await B.waitForSelector('.trap[data-phase="place"]', { timeout: 10000 })
      await B.keyboard.press('Escape')
      await B.waitForSelector('.trap-confirm-quit')
      await B.locator('.trap-confirm-quit .carved-btn--primary').click()
      await A.waitForSelector('.trap-end', { timeout: 10000 })
      assert.match((await A.locator('.trap-end').textContent()) ?? '', /BẠN THẮNG.*bỏ chạy/)
    })

    await t.test('điện thoại 390×844: bàn chơi vừa màn hình; lúc giấu nấm chỉ hiện làn đối thủ; chạm ô để cắm và để bước', async () => {
      await A.locator('.trap-end button').click()
      await B.close()
      const M = await newPage(browser, 'M', { width: 390, height: 844 }, { mobile: true, errors })
      await enterCave(M, stack.baseUrl, 'Dế Mèn')
      await until(async () => (await M.locator('.hang-trap-btn').count()) === 1, { timeout: 20000, label: 'nút 🍄 trên điện thoại' })
      await M.locator('.hang-trap-btn').tap()
      await A.waitForSelector('.hang-invite[role="alertdialog"]', { timeout: 10000 })
      await A.keyboard.press('KeyY')
      await M.waitForSelector('.trap[data-phase="place"]', { timeout: 10000 })
      await inBox(M, 390, 844)
      assert.equal(await M.locator('.trap-lane[data-who="me"]').isVisible(), false, 'lúc giấu nấm ẩn làn của mình cho đỡ chật')
      for (let row = 0; row <= 4; row += 1) await foeCell(M, cellOf(row, 1)).tap()
      await M.locator('.trap-confirm').tap()
      await shot(M, '5-mobile-place')
      for (let row = 0; row <= 4; row += 1) await foeCell(A, cellOf(row, 1)).click()
      await A.locator('.trap-confirm').click()
      await M.waitForSelector('.trap[data-phase="walk"]', { timeout: 10000 })
      await inBox(M, 390, 844)
      await until(async () => !(await myCell(M, cellOf(0, 0)).isDisabled()), { timeout: 10000, label: 'ô mở trên điện thoại' })
      await myCell(M, cellOf(0, 0)).tap()
      await until(async () => (await M.locator('.trap-cell[data-picked]').count()) === 1, { label: 'chạm để bước' })
      await shot(M, '6-mobile-walk')
      await M.locator('.trap-quit').tap()
      await M.locator('.trap-confirm-quit .carved-btn--primary').tap()
      await A.waitForSelector('.trap-end', { timeout: 10000 })
    })
  } finally {
    await browser.close()
    await stack.stop()
  }
  assert.deepEqual([...new Set(errors)], [], 'không có lỗi console / pageerror')
})
