// PWA + phát hiện bản mới trên bản PRODUCTION (đã build, phục vụ bởi chính server game).
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { root, startServer } from '../helpers/server.mjs'
import { chromePath, launchBrowser, newPage, until } from './helpers.mjs'

const skip = chromePath() ? false : 'Không tìm thấy Chrome: đặt CHROME_PATH'
const run = (args, env = {}) => spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } })

/** Kích thước thật của tệp PNG (đọc từ tiêu đề IHDR). */
const pngSize = (buffer) => {
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'không phải PNG')
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)]
}

test('PWA + bản mới (bản production)', { skip, timeout: 300_000 }, async (t) => {
  const build = run(['build'])
  assert.equal(build.status, 0, `build lỗi:\n${build.stdout}\n${build.stderr}`)
  const dist = path.join(root, 'dist')
  const server = await startServer({ CAPACITY: '20', BOTS: '1', STATIC_DIR: dist })
  const browser = await launchBrowser()
  const errors = []
  const versionFile = path.join(dist, 'version.json')
  const originalVersion = fs.readFileSync(versionFile, 'utf8')
  try {
    await t.test('manifest hợp lệ: đủ trường, mọi icon tồn tại, đúng kích thước khai báo, có icon maskable', async () => {
      const response = await fetch(`${server.url}/site.webmanifest`)
      assert.equal(response.status, 200)
      const manifest = await response.json()
      for (const key of ['name', 'short_name', 'start_url', 'scope', 'display', 'theme_color', 'background_color']) assert.ok(manifest[key], `thiếu ${key}`)
      assert.equal(manifest.display, 'standalone')
      assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'cần icon maskable')
      for (const icon of manifest.icons) {
        const res = await fetch(`${server.url}${icon.src}`)
        assert.equal(res.status, 200, icon.src)
        if (icon.type === 'image/png') {
          const [w, h] = pngSize(Buffer.from(await res.arrayBuffer()))
          assert.equal(`${w}x${h}`, icon.sizes, `${icon.src}: kích thước thật khác khai báo`)
        }
      }
    })

    await t.test('service worker: đúng loại tệp, không cache, KHÔNG có handler fetch, và được đăng ký thật', async () => {
      const res = await fetch(`${server.url}/sw.js`)
      assert.equal(res.status, 200)
      assert.match(res.headers.get('content-type') ?? '', /javascript/)
      assert.match(res.headers.get('cache-control') ?? '', /no-store|no-cache/)
      const code = (await res.text()).replace(/\/\*[\s\S]*?\*\//g, '')
      assert.ok(!/addEventListener\(\s*['"]fetch['"]/.test(code), 'có handler fetch: sẽ chặn/cache yêu cầu và giữ người dùng ở bản cũ')
      const page = await newPage(browser, 'sw', { width: 1000, height: 700 }, { errors })
      await page.goto(server.url, { waitUntil: 'load' })
      const script = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL ?? null)
      assert.ok(script?.endsWith('/sw.js'), `scriptURL=${script}`)
      await page.context().close()
    })

    await t.test('index.html: có thẻ chia sẻ/SEO; không đặt SITE_URL thì không để sót %SITE_URL% hay URL tuyệt đối giả', async () => {
      const html = await (await fetch(server.url)).text()
      for (const needle of ['name="description"', 'property="og:title"', 'property="og:image:width"', 'name="twitter:card"', 'rel="manifest"', 'rel="apple-touch-icon"', 'name="theme-color"']) assert.ok(html.includes(needle), needle)
      assert.ok(!html.includes('%SITE_URL%'), 'còn sót %SITE_URL%')
      assert.ok(!/rel="canonical"/.test(html) && !/property="og:(url|image)"/.test(html), 'URL tuyệt đối phải bị bỏ khi không có SITE_URL')
      assert.ok(!/__SITE_URL__|site-url:(start|end)/.test(html), 'còn sót dấu hiệu của plugin')
    })

    await t.test('đặt SITE_URL lúc build thì canonical / og:url / og:image thành URL tuyệt đối', async () => {
      const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hangmu-site-'))
      try {
        const b = run(['build', '--outDir', out, '--emptyOutDir'], { SITE_URL: 'https://hang.example.test/' })
        assert.equal(b.status, 0, b.stderr)
        const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8')
        assert.match(html, /<link rel="canonical" href="https:\/\/hang\.example\.test\/"/)
        assert.match(html, /property="og:url" content="https:\/\/hang\.example\.test\/"/)
        assert.match(html, /property="og:image" content="https:\/\/hang\.example\.test\/og-image\.png"/)
        assert.ok(!html.includes('%SITE_URL%'))
      } finally {
        fs.rmSync(out, { recursive: true, force: true })
      }
    })

    await t.test('banner "có bản mới": không hiện khi cùng mã; hiện khi server phát hành mã khác; bấm Tải lại thì tải lại trang', async () => {
      const page = await newPage(browser, 'ver', { width: 1000, height: 700 }, { errors })
      await page.addInitScript(() => { window.__HANGMU_VERSION_POLL_MS = 250 })
      await page.goto(server.url, { waitUntil: 'load' })
      await page.waitForSelector('.home-panel')
      await new Promise((r) => setTimeout(r, 1200))
      assert.equal(await page.locator('.update-banner').count(), 0, 'cùng mã build thì không được báo')
      fs.writeFileSync(versionFile, JSON.stringify({ id: 'ban-moi-gia-lap' }))
      await page.waitForSelector('.update-banner', { timeout: 5000 })
      assert.match((await page.locator('.update-banner').textContent()) ?? '', /Có bản mới/)
      const reloaded = page.waitForEvent('framenavigated', { timeout: 5000 })
      await page.click('.update-banner button')
      await reloaded
      await page.context().close()
    })

    await t.test('nút "Cài như app": iPhone thấy hướng dẫn Safari, Android dùng được lời nhắc cài của trình duyệt, đã cài thì ẩn', async () => {
      const iosUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
      const ios = await (await browser.newContext({ userAgent: iosUa, viewport: { width: 390, height: 844 } })).newPage()
      await ios.goto(server.url, { waitUntil: 'load' })
      await ios.click('.home-install')
      const text = (await ios.locator('.install-steps').textContent()) ?? ''
      assert.match(text, /Chia sẻ/)
      assert.match(text, /Thêm vào Màn hình chính/)
      await ios.context().close()

      const android = await newPage(browser, 'android', { width: 390, height: 844 }, { errors })
      await android.goto(server.url, { waitUntil: 'load' })
      await android.waitForSelector('.home-install')
      await android.evaluate(() => {
        const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
          prompt: async () => { window.__prompted = true },
          userChoice: Promise.resolve({ outcome: 'accepted' }),
        })
        window.dispatchEvent(event)
      })
      await android.click('.home-install')
      await until(() => android.evaluate(() => window.__prompted === true), { label: 'lời nhắc cài của trình duyệt được gọi' })
      assert.equal(await android.locator('.install-steps').count(), 0, 'có lời nhắc gốc thì không cần hộp hướng dẫn')
      await android.context().close()

      const standalone = await newPage(browser, 'standalone', { width: 390, height: 844 }, { errors })
      await standalone.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))
      await standalone.goto(server.url, { waitUntil: 'load' })
      await standalone.waitForSelector('.home-panel')
      assert.equal(await standalone.locator('.home-install').count(), 0, 'đã chạy như ứng dụng thì ẩn nút cài')
      await standalone.context().close()
    })
  } finally {
    fs.writeFileSync(versionFile, originalVersion)
    await browser.close()
    await server.stop()
  }
  assert.deepEqual([...new Set(errors)], [], 'không có lỗi console / pageerror')
})
