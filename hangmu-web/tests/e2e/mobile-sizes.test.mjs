// Các cỡ màn hình điện thoại: dọc nhỏ 360×640, dọc 390×844, ngang 844×390 (iPhone 17 Pro) — vào được hang, thanh đầu gọn một hàng,
// bảng tỷ số treo vừa khung, không tràn ngang, không chồng chéo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { LAYOUT_SELECTORS, audit, chromePath, enterCave, launchBrowser, launchStack, newPage, sleep } from './helpers.mjs'

const skip = chromePath() ? false : 'Không tìm thấy Chrome: đặt CHROME_PATH'
const SIZES = [
  ['dọc nhỏ 360×640', 360, 640],
  ['dọc 390×844', 390, 844],
  ['ngang 844×390', 844, 390],
]

test('các cỡ màn hình điện thoại', { skip, timeout: 600_000 }, async (t) => {
  const stack = await launchStack()
  const browser = await launchBrowser()
  const errors = []
  try {
    for (const [label, width, height] of SIZES) {
      await t.test(label, async () => {
        const page = await newPage(browser, label, { width, height }, { mobile: true, errors })
        // enterCave đi hết sảnh → tên → quiz → hang: ở màn hình thấp, nút "Vào hang" từng nằm ngoài màn hình và không cuộn tới được.
        await enterCave(page, stack.baseUrl, `Mob${width}`, 9)
        await sleep(2500)

        const head = await page.evaluate(() => {
          const top = document.querySelector('.hang-top')
          const box = top.getBoundingClientRect()
          const children = [...top.querySelectorAll('.hang-top-left > *, .hang-count')].filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.getBoundingClientRect())
          return { height: box.height, left: Math.min(...children.map((c) => c.left)), right: Math.max(...children.map((c) => c.right)), rows: new Set(children.map((c) => Math.round(c.top / 10))).size }
        })
        assert.ok(head.height <= 62, `thanh đầu cao ${Math.round(head.height)}px (một hàng)`)
        assert.ok(head.left >= 0 && head.right <= width, `nút nằm trong màn hình: ${Math.round(head.left)}–${Math.round(head.right)} / ${width}`)

        const board = await page.evaluate(() => window.__hangStats().boardScreen)
        const shown = Math.min(width, board.maxX) - Math.max(0, board.minX)
        assert.ok(board.maxX - board.minX < width * 1.05, `bảng treo rộng ${Math.round(board.maxX - board.minX)}px so với màn hình ${width}px`)
        assert.ok(shown > width * 0.2, 'bảng treo nằm trong tầm nhìn')

        const r = await audit(page, LAYOUT_SELECTORS)
        assert.deepEqual(r.overlaps, [], 'chồng chéo')
        assert.deepEqual(r.off, [], 'tràn khỏi màn hình')
        assert.equal(r.hScroll, false, 'cuộn ngang')

        const reach = await page.evaluate(() => ['.touch-joy', '.touch-btn--hit'].map((sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b ? [b.left >= 0, b.right <= innerWidth, b.top >= 0, b.bottom <= innerHeight] : null }))
        assert.ok(reach.every((r2) => r2 && r2.every(Boolean)), `cần điều khiển và nút đấm nằm trong màn hình: ${JSON.stringify(reach)}`)
        await page.context().close()
      })
    }
  } finally {
    await browser.close()
    await stack.stop()
  }
  assert.deepEqual(errors, [], 'không có lỗi console/trang')
})
