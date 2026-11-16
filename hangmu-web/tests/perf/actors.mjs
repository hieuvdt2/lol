// Đo chi phí tài nguyên theo số người trong hang. Chạy: npm run perf:actors
// Lưu ý: WebGL headless dùng SwiftShader (render bằng CPU) nên nhịp khung hình chỉ để SO SÁNH TƯƠNG ĐỐI giữa các lần đo,
// không phản ánh GPU thật. Số texture / geometry / draw call / bộ nhớ JS thì không phụ thuộc cách render.
import WebSocket from 'ws'
import { moveBytes } from '../helpers/wsclient.mjs'
import { createWalker, randomClearPoint } from '../helpers/walker.mjs'
import { enterCave, launchBrowser, launchStack, newPage, sleep, until } from '../e2e/helpers.mjs'

// SPREAD=1: đám đông đi tản ra quanh hang (phân bố khoảng cách thực tế). SPREAD=0: tất cả đứng chồng ở điểm spawn (xấu nhất cho LOD).
const SPREAD = process.env.SPREAD !== '0'
const STEPS = (process.env.STEPS ?? '0,50,150,300,495').split(',').map(Number)
const stack = await launchStack()
const browser = await launchBrowser()
const crowd = []
const rows = []
try {
  const page = await newPage(browser, 'P', { width: 1280, height: 800 })
  await enterCave(page, stack.baseUrl, 'Observer', 7)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.enable')

  for (const target of STEPS) {
    while (crowd.length < target) {
      const id = crowd.length // bắt chỉ số ngay lúc tạo, nếu không mọi client sẽ dùng chung một tab id và đá nhau
      const ws = new WebSocket(stack.server.wsUrl)
      ws.on('open', () => ws.send(JSON.stringify({ t: 'enter', name: `Fan ${id}`, number: 1 + (id % 99), tab: `perf-${id}` })))
      ws.on('message', () => {})
      if (SPREAD) {
        // Đi tới một điểm ngẫu nhiên (bán kính 6–40) với tốc độ 6 đơn vị/giây, đúng giới hạn tốc độ của server.
        const goal = randomClearPoint(6, 40)
        const walker = createWalker(0, 36)
        let still = 0
        const walk = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return
          const moving = walker.advance(goal)
          // đứng im (tới nơi hoặc bị ghế chặn) hơn 3 giây thì thôi
          still = moving ? 0 : still + 1
          if (still > 2) return clearInterval(walk)
          ws.send(moveBytes(walker.x, walker.z, { dir: moving ? 7 << 5 : 0 }))
        }, 100)
        ws.on('close', () => clearInterval(walk))
      }
      crowd.push(ws)
    }
    const expected = 1 + 4 + target // bản thân + 4 bot của server + đám đông
    await until(() => page.evaluate((n) => window.__hangNet.actors.size >= n, expected), { timeout: 60000, label: `đủ ${expected} diễn viên` })
    await sleep(SPREAD ? 9000 : 2500) // cho đám đông đi tới chỗ, vòng lặp dựng hết mesh và render vài khung
    await cdp.send('HeapProfiler.collectGarbage')
    const stats = await page.evaluate(() => window.__hangStats())
    const heapMB = (await page.evaluate(() => performance.memory.usedJSHeapSize)) / 1048576
    const frames = await page.evaluate(
      () => new Promise((resolve) => {
        let n = 0
        const t0 = performance.now()
        const tick = () => {
          n += 1
          performance.now() - t0 < 4000 ? requestAnimationFrame(tick) : resolve({ n, ms: performance.now() - t0 })
        }
        requestAnimationFrame(tick)
      }),
    )
    rows.push({ người: target, actors: stats.actors, textures: stats.textures, geometries: stats.geometries, calls: stats.calls, triangles: stats.triangles, heapMB: Math.round(heapMB), 'ms/khung': Math.round(frames.ms / frames.n) })
  }
  // Cả đám đông rời hang: tài nguyên theo người (nhãn tên) phải được giải phóng, nếu không phiên dài sẽ rò bộ nhớ.
  for (const ws of crowd) ws.send(JSON.stringify({ t: 'leave' }))
  await until(() => page.evaluate(() => window.__hangNet.actors.size <= 5), { timeout: 60000, label: 'đám đông đã rời' })
  await sleep(2500)
  await cdp.send('HeapProfiler.collectGarbage')
  const after = await page.evaluate(() => window.__hangStats())
  rows.push({ người: 'rời hết', actors: after.actors, textures: after.textures, geometries: after.geometries, calls: after.calls, triangles: after.triangles, heapMB: Math.round((await page.evaluate(() => performance.memory.usedJSHeapSize)) / 1048576), 'ms/khung': '-' })
} finally {
  for (const ws of crowd) ws.terminate()
  await browser.close()
  await stack.stop()
}
console.table(rows)
if (rows.length > 2) {
  const a = rows[0]
  const b = rows.at(-2)
  const n = b.actors - a.actors
  console.log(`Chi phí mỗi diễn viên thêm vào (${a.actors} → ${b.actors}): ` + ['textures', 'geometries', 'calls', 'triangles'].map((k) => `${k} ≈ ${((b[k] - a[k]) / n).toFixed(1)}`).join(', ') + `, heap ≈ ${(((b.heapMB - a.heapMB) * 1024) / n).toFixed(0)} KB`)
}
