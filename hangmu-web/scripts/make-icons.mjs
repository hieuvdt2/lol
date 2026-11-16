// Dựng các biểu tượng ứng dụng (PNG) và ảnh chia sẻ từ public/images/emblem.svg bằng Chrome headless.
//   node scripts/make-icons.mjs        (cần Chrome; đặt CHROME_PATH nếu không ở chỗ mặc định)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { chromePath } from '../tests/e2e/helpers.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pub = path.join(root, 'public')
const emblem = fs.readFileSync(path.join(pub, 'images/emblem.svg'), 'utf8')
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(emblem).toString('base64')}`

const BG = 'radial-gradient(circle at 50% 30%, #4a2a1c, #1b1210 70%)'
const targets = [
  // [tệp, rộng, cao, tỉ lệ biểu tượng so với cạnh ngắn, bo góc]
  ['icon-192.png', 192, 192, 0.78, 0],
  ['icon-512.png', 512, 512, 0.78, 0],
  ['apple-touch-icon.png', 180, 180, 0.8, 0],
  ['favicon-48.png', 48, 48, 0.92, 0],
]

const browser = await chromium.launch({ executablePath: chromePath(), headless: true })
const page = await browser.newPage()
for (const [file, w, h, scale] of targets) {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(
    `<style>html,body{margin:0}body{width:${w}px;height:${h}px;background:${BG};display:grid;place-items:center}img{width:${Math.round(Math.min(w, h) * scale)}px;height:auto}</style><img src="${dataUrl}">`,
  )
  await page.waitForFunction(() => document.images[0]?.complete)
  await page.screenshot({ path: path.join(pub, file) })
  console.log('đã tạo', file)
}
// Ảnh chia sẻ 1200×630 (Open Graph): biểu tượng + tên + khẩu hiệu, toàn bộ vẽ mới.
await page.setViewportSize({ width: 1200, height: 630 })
await page.setContent(`<style>
  html,body{margin:0} body{width:1200px;height:630px;background:${BG};display:flex;align-items:center;gap:56px;padding:0 90px;box-sizing:border-box;font-family:Georgia,'Times New Roman',serif;color:#efe9dd}
  img{width:380px;height:380px} h1{margin:0;font-size:150px;line-height:1;letter-spacing:2px;white-space:nowrap;color:#ecd08c;text-shadow:0 4px 0 #000a} p{margin:18px 0 0;font-size:33px;line-height:1.35;color:#efe9ddcc;white-space:nowrap} small{display:block;margin-top:26px;font-size:26px;color:#c9a24e}
</style><img src="${dataUrl}"><div><h1>Hang MU</h1><p>Nơi anh em trú sau mỗi trận thua,<br>và cùng ra hang khi đội thắng.</p><small>Sân chơi 3D nhiều người · do fan tự làm</small></div>`)
await page.waitForFunction(() => document.images[0]?.complete)
await page.screenshot({ path: path.join(pub, 'og-image.png') })
console.log('đã tạo og-image.png')
await browser.close()
