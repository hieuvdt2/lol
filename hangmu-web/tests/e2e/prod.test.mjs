// Kiểm tra khói bản PRODUCTION (đã build, phục vụ bởi chính server game): chạy được trên máy tính lẫn điện thoại giả lập.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { root, startServer } from '../helpers/server.mjs'
import { chromePath, enterCave, launchBrowser, newPage, sceneStats, sleep, until } from './helpers.mjs'

const skip = chromePath() ? false : 'Không tìm thấy Chrome: đặt CHROME_PATH'

test('bản production chạy được (máy tính + điện thoại, có bảng thông số ?debug=1)', { skip, timeout: 300_000 }, async (t) => {
  const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: root, encoding: 'utf8' })
  assert.equal(build.status, 0, `build lỗi:\n${build.stdout}\n${build.stderr}`)
  const server = await startServer({ CAPACITY: '50', BOTS: '3', STATIC_DIR: path.join(root, 'dist') })
  const browser = await launchBrowser()
  const errors = []
  try {
    await t.test('sảnh hiện số người thật từ /api/room/status của server', async () => {
      const page = await newPage(browser, 'lobby', { width: 1280, height: 800 }, { errors })
      await page.goto(server.url, { waitUntil: 'load' })
      await page.waitForSelector('.home-count strong', { timeout: 15000 })
      assert.equal(Number(await page.locator('.home-count strong').textContent()), 3, 'khớp số bot đang trong hang')
      await page.context().close()
    })

    await t.test('máy tính: vào hang, cảnh render, bảng thông số hiện số liệu', async () => {
      const page = await newPage(browser, 'desk', { width: 1280, height: 800 }, { errors })
      await enterCave(page, `${server.url}/?debug=1`, 'ProdDesk', 5)
      await until(async () => /FPS/.test((await page.locator('.debug-hud').textContent()) ?? ''), { timeout: 10000, label: 'bảng thông số có FPS' })
      const stats = await sceneStats(page, await page.screenshot())
      assert.ok(stats.colors > 60 && stats.std > 8, `canvas trống? colors=${stats.colors} std=${stats.std}`)
      assert.equal(await page.evaluate(() => typeof window.__hangNet), 'undefined', 'móc debug dev không lọt vào bản production')
      await page.context().close()
    })

    await t.test('điện thoại: điều khiển cảm ứng, bảng thông số, ping > 0 sau vài giây', async () => {
      const page = await newPage(browser, 'phone', { width: 390, height: 844 }, { mobile: true, errors })
      await enterCave(page, `${server.url}/?debug=1`, 'ProdPhone', 9)
      assert.equal(await page.locator('.touch-joy').count(), 1)
      await until(async () => /ping \d+ms/.test((await page.locator('.debug-hud').textContent()) ?? ''), { timeout: 15000, label: 'ping hiện số' })
      await sleep(500)
      const stats = await sceneStats(page, await page.screenshot())
      assert.ok(stats.colors > 60, `canvas trống? colors=${stats.colors}`)
      const hud = await page.locator('.debug-hud').boundingBox()
      assert.ok(hud.x >= 0 && hud.x + hud.width <= 390, `bảng thông số tràn ngang: ${JSON.stringify(hud)}`)
      await page.context().close()
    })
  } finally {
    await browser.close()
    await server.stop()
  }
  assert.deepEqual([...new Set(errors)], [], 'không có lỗi console / pageerror')
})
