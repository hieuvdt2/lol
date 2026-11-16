// Hạ tầng E2E: server game + Vite dev + Chrome headless (Playwright).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { chromium } from 'playwright-core'
import { freePort, root, sleep, startServer, until } from '../helpers/server.mjs'

export { sleep, until }

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

export const chromePath = () => CHROME_CANDIDATES.find((p) => fs.existsSync(p))

export async function launchStack(env = {}) {
  const server = await startServer({ CAPACITY: '500', BOTS: '4', DUEL_COUNTDOWN_MS: '800', INVITE_DECLINE_WAIT_MS: '1500', ...env })
  const vitePort = await freePort()
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
    cwd: root,
    env: { ...process.env, ROOM_PORT: String(server.port) },
    stdio: 'ignore',
  })
  const baseUrl = `http://127.0.0.1:${vitePort}`
  await until(async () => {
    try {
      return (await fetch(baseUrl)).ok
    } catch {
      return false
    }
  }, { timeout: 30000, label: 'Vite sẵn sàng' })
  return {
    baseUrl,
    server,
    stop: async () => {
      vite.kill()
      await server.stop()
    },
  }
}

export function launchBrowser() {
  return chromium.launch({
    executablePath: chromePath(),
    headless: true,
    // WebGL phần mềm: chậm (vài FPS) nhưng chạy được mà không cần GPU.
    args: [
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl',
      // Headless không có thiết bị âm thanh: tạo AudioContext với đầu ra thật làm đứng luồng chính của trang (đã gặp khi kiểm thử).
      '--mute-audio', '--disable-audio-output',
      ...(process.env.CHROME_EXTRA_ARGS ?? '').split(' ').filter(Boolean),
    ],
  })
}

export async function newPage(browser, label, viewport, { mobile = false, errors, full = false } = {}) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 })
  const page = await context.newPage()
  // WebGL phần mềm rất chậm: mặc định chạy chế độ nhẹ của cảnh (bỏ khán giả/chùm đèn). Bài thử `venue` tắt chế độ này để kiểm tra bản đầy đủ.
  if (!full) await page.addInitScript(() => { try { localStorage.setItem('hangmu.lite', '1') } catch { /* bỏ qua */ } })
  page.label = label
  page.on('pageerror', (e) => errors?.push(`[${label}] PAGEERROR ${String(e).slice(0, 240)}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text()
    // Cảnh báo dev quen thuộc: React StrictMode mount hai lần làm socket đầu bị đóng khi chưa kịp mở.
    if (!errors || /closed before the connection/.test(text)) return
    errors.push(`[${label}] console.error ${text.slice(0, 240)}`)
  })
  return page
}

/** Sảnh → nhập tên → quiz → vào hang (đã có người trong hang). */
export async function enterCave(page, baseUrl, name, number) {
  await page.goto(baseUrl, { waitUntil: 'load' })
  await page.waitForSelector('.home-panel .home-enter:not([disabled])', { timeout: 30000 })
  const covered = await page.evaluate(() => {
    const button = document.querySelector('.home-panel .home-enter')
    const box = button.getBoundingClientRect()
    return !button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
  })
  await page.locator('button', { hasText: 'Từ chối' }).first().click().catch(() => {})
  await page.click('.home-panel .home-enter')
  await page.waitForSelector('.name-dialog')
  await page.locator('.name-input').first().fill(name)
  void number // áo esport không có số: hộp thoại không còn ô số áo (tham số giữ cho các bài thử cũ)
  await page.click('.name-dialog button[type=submit]')
  await page.waitForSelector('.quiz-dialog .quiz-answer')
  // Câu hỏi do server ra và chấm; đúng hay sai đều được vào hang: chọn đáp án đầu rồi bấm "Vào hang" ở bước kết quả.
  await page.locator('.quiz-answer').first().click()
  await page.waitForSelector('.quiz-dialog .home-enter')
  await page.click('.quiz-dialog .home-enter')
  await page.waitForFunction(() => /anh em trong hang/.test(document.querySelector('.hang-top p')?.textContent ?? ''), null, { timeout: 30000 })
  return { lobbyButtonWasCovered: covered }
}

/** Đo chồng chéo giữa các thành phần giao diện và phần tử tràn khỏi màn hình. */
/**
 * Thông báo nổi (biểu ngữ ai vào hang / kết quả trò chơi): cố ý nổi trên mọi thứ, không chặn bấm (pointer-events: none) và tự tắt sau vài giây,
 * nên không tính chồng chéo; vẫn phải nằm trong màn hình.
 */
export const OVERLAY_SELECTORS = ['.hang-event']

export async function audit(page, selectors) {
  return page.evaluate(([sels, overlays]) => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const items = []
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const b = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        if (!b.width || !b.height || cs.display === 'none' || cs.visibility === 'hidden') continue
        items.push({ sel, x: b.left, y: b.top, r: b.right, b: b.bottom })
      }
    }
    const overlaps = []
    const off = []
    for (let i = 0; i < items.length; i += 1) {
      const a = items[i]
      if (a.x < -1 || a.y < -1 || a.r > vw + 1 || a.b > vh + 1) off.push(`${a.sel} [${Math.round(a.x)},${Math.round(a.y)},${Math.round(a.r)},${Math.round(a.b)}]`)
      for (let j = i + 1; j < items.length; j += 1) {
        const c = items[j]
        if (overlays.includes(a.sel) || overlays.includes(c.sel)) continue
        const w = Math.min(a.r, c.r) - Math.max(a.x, c.x)
        const h = Math.min(a.b, c.b) - Math.max(a.y, c.y)
        if (w > 4 && h > 4) overlaps.push(`${a.sel}×${c.sel} (${Math.round(w)}×${Math.round(h)}px)`)
      }
    }
    return { overlaps, off, hScroll: document.documentElement.scrollWidth > vw }
  }, [selectors, OVERLAY_SELECTORS])
}

export const LAYOUT_SELECTORS = [
  '.hang-top', '.hang-hint', '.hang-chat', '.hang-talk-btn', '.hang-notice', '.hang-banner', '.hang-invites', '.hang-poll',
  '.hang-rage', '.hang-rank', '.hang-weekly', '.hang-corner', '.hang-keys', '.hang-event', '.hang-volume', '.hang-lck', '.hang-talk', '.touch-joy', '.touch-actions', '.duel-bars', '.duel-actions', '.duel-quit', '.duel-end',
  '.duel-banner', '.duel-taunt', '.hang-punched',
]

/** Phân tích ảnh chụp bằng canvas ngay trong trình duyệt (không cần Python). */
async function analyse(page, buffers, fn) {
  const urls = buffers.map((b) => `data:image/png;base64,${b.toString('base64')}`)
  return page.evaluate(
    async ({ urls, body }) => {
      const load = (url) => new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = url
      })
      const pixels = async (url) => {
        const img = await load(url)
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        return { data: ctx.getImageData(0, 0, img.width, img.height).data, width: img.width, height: img.height }
      }
      const imgs = await Promise.all(urls.map(pixels))
      // eslint-disable-next-line no-new-func
      return new Function('imgs', `return (${body})(imgs)`)(imgs)
    },
    { urls, body: fn.toString() },
  )
}

/** Số màu khác nhau và độ lệch chuẩn trong vùng cảnh (bỏ phần giao diện): ảnh trống sẽ gần như bằng 0. */
export const sceneStats = (page, buffer) =>
  analyse(page, [buffer], (imgs) => {
    const { data, width, height } = imgs[0]
    const y0 = Math.floor(height * 0.1)
    const y1 = Math.floor(height * 0.7)
    const seen = new Set()
    let sum = 0
    let sumSq = 0
    let n = 0
    for (let y = y0; y < y1; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const i = (y * width + x) * 4
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
        seen.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`)
        sum += lum
        sumSq += lum * lum
        n += 1
      }
    }
    const mean = sum / n
    return { colors: seen.size, std: Math.sqrt(sumSq / n - mean * mean) }
  })

/** Độ khác biệt trung bình (0–255) giữa hai ảnh trong vùng cảnh. */
export const sceneDiff = (page, a, b) =>
  analyse(page, [a, b], (imgs) => {
    const [p, q] = imgs
    const y0 = Math.floor(p.height * 0.12)
    const y1 = Math.floor(p.height * 0.62)
    let total = 0
    let n = 0
    for (let y = y0; y < y1; y += 3) {
      for (let x = 0; x < p.width; x += 3) {
        const i = (y * p.width + x) * 4
        total += (Math.abs(p.data[i] - q.data[i]) + Math.abs(p.data[i + 1] - q.data[i + 1]) + Math.abs(p.data[i + 2] - q.data[i + 2])) / 3
        n += 1
      }
    }
    return total / n
  })

/** Gửi một cử chỉ chạm qua CDP và giữ cho tới khi `pred()` đúng (FPS headless rất thấp nên không giữ theo thời gian). */
export async function holdTouch(cdp, from, to, pred = async () => true, timeout = 20000) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] })
  for (let i = 1; i <= 6; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 6, y: from.y + ((to.y - from.y) * i) / 6, id: 1 }],
    })
    await sleep(20)
  }
  const end = Date.now() + timeout
  while (Date.now() < end && !(await pred())) await sleep(150)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
