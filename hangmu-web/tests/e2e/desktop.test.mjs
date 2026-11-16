// E2E trên máy tính: render, phím/chuột, pointer lock, chat, ném đồ, mời, chat riêng, duel, bố cục.
import test from 'node:test'
import assert from 'node:assert/strict'
import { LAYOUT_SELECTORS, audit, chromePath, enterCave, launchBrowser, launchStack, newPage, sceneDiff, sceneStats, sleep, until } from './helpers.mjs'

const skip = chromePath() ? false : 'Không tìm thấy Chrome: đặt CHROME_PATH'
const pos = (page) => page.evaluate(() => { const m = window.__hangNet.local.draw; return { x: m.x, z: m.z } })
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

test('giao diện máy tính 1280×800', { skip, timeout: 600_000 }, async (t) => {
  const stack = await launchStack()
  const browser = await launchBrowser()
  const errors = []
  try {
    const A = await newPage(browser, 'A', { width: 1280, height: 800 }, { errors })
    const lobby = await enterCave(A, stack.baseUrl, 'Tester', 7)

    await t.test('sảnh: banner cookie không che nút "Vào hang"', () => assert.equal(lobby.lobbyButtonWasCovered, false))

    await t.test('cave render thật (canvas không trống) và hiện số người', async () => {
      await sleep(2500)
      const stats = await sceneStats(A, await A.screenshot())
      assert.ok(stats.colors > 60 && stats.std > 8, `colors=${stats.colors} std=${stats.std}`)
      assert.match((await A.locator('.hang-top p').textContent()) ?? '', /\d+ anh em trong hang/)
      assert.equal(await A.locator('.hang-overlay').count(), 0)
      await layoutOk(A, 'cave idle')
    })

    await t.test('giữ W thì đi tới và cảnh thay đổi', async () => {
      const before = await A.screenshot()
      const z0 = (await pos(A)).z
      await A.keyboard.down('KeyW')
      await until(async () => Math.abs((await pos(A)).z - z0) > 4, { timeout: 20000, label: 'đi được 4 đơn vị' })
      await A.keyboard.up('KeyW')
      await sleep(300)
      assert.ok((await sceneDiff(A, before, await A.screenshot())) > 1)
    })

    await t.test('hoạt hình nhân vật mượt: đi, dừng, đấm không làm khớp nào quay quá nhanh', async () => {
      const stats = () => A.evaluate(() => window.__hangStats())
      await A.evaluate(() => window.__hangStats().animReset())
      await A.keyboard.down('KeyW')
      await sleep(1500)
      await A.keyboard.up('KeyW')
      await sleep(800)
      await A.keyboard.press('KeyF')
      await sleep(1200)
      const s = await stats()
      assert.ok(s.animFrames > 5, `chỉ có ${s.animFrames} khung hình`)
      // Chạy đều ≈ 15 rad/s; cú đấm bị chặn ở 30 rad/s. Mã cũ ở tốc độ khung thấp vượt xa mức này.
      assert.ok(s.animMaxSpeed <= 31, `khớp quay tối đa ${s.animMaxSpeed.toFixed(1)} rad/s`)
    })

    await t.test('nút tiếng: bật/tắt, lưu lựa chọn, trang vẫn phản hồi sau khi mở khóa âm thanh', async () => {
      const button = A.locator('.hang-sound')
      assert.equal(await button.getAttribute('aria-pressed'), 'false')
      await button.click()
      assert.equal(await button.getAttribute('aria-pressed'), 'true')
      assert.equal(await A.evaluate(() => localStorage.getItem('hangmu.muted')), '1')
      await button.click()
      assert.equal(await button.getAttribute('aria-pressed'), 'false')
      assert.equal(await A.evaluate(() => localStorage.getItem('hangmu.muted')), '0')
      // thanh âm lượng nằm ngay trên thanh đầu trang (như bản gốc): kéo, lưu, bố cục
      const slider = A.locator('.hang-vol-range')
      await slider.waitFor()
      assert.equal(await slider.inputValue(), '35', 'mặc định 35')
      await slider.fill('80')
      assert.equal(await A.evaluate(() => localStorage.getItem('hangmu.volume')), '80')
      await layoutOk(A, 'âm lượng')
      await slider.fill('0')
      assert.equal(await A.locator('.hang-sound').getAttribute('aria-pressed'), 'true', 'âm lượng 0 = đang im')
      await slider.fill('35')
      assert.equal(await A.locator('.hang-sound').getAttribute('aria-pressed'), 'false')
      const started = Date.now()
      await A.evaluate(() => 1)
      assert.ok(Date.now() - started < 2000, 'trang phản hồi')
    })

    await t.test('widget LCK: chip gọn "LCK T1 hạng 3", mở ra thấy bảng 10 đội kèm vé quốc tế, đóng lại thì biến mất', async () => {
      const chip = A.locator('.hang-lck-chip')
      await chip.waitFor({ timeout: 30000 })
      const text = (await chip.textContent()) ?? ''
      assert.match(text, /LCK/)
      assert.match(text, /T1/)
      assert.match(text, /hạng 3/)
      await layoutOk(A, 'widget LCK (thu gọn)')
      await chip.click()
      await A.waitForSelector('.hang-lck-table tbody tr')
      assert.equal(await A.locator('.hang-lck-table tbody tr').count(), 10)
      assert.equal(await A.locator('.hang-lck-table tbody tr[data-us]').count(), 1)
      assert.match((await A.locator('.hang-lck-table tbody tr[data-us]').textContent()) ?? '', /T1/)
      assert.equal(await A.locator('.hang-lck-table tbody tr[data-ticket="worlds"]').count(), 4, 'bốn đội có vé CKTG')
      assert.match((await A.locator('.hang-lck-note').textContent()) ?? '', /nhập tay/)
      await layoutOk(A, 'widget LCK (mở rộng)')
      await chip.click()
      assert.equal(await A.locator('.hang-lck-table').count(), 0)
      assert.equal(await A.locator('.hang-goal').count(), 0, 'không còn màn ăn mừng bàn thắng')
    })

    await t.test('bố cục giống bản gốc: "Hang chung", bảng phong thần bên trái, chat bên phải, phím H mở bảng phím, Enter nhảy vào ô chat', async () => {
      assert.match((await A.locator('.hang-count').textContent()) ?? '', /Hang chung.*anh em trong hang/)
      assert.equal(await A.locator('.hang-weekly').count(), 1)
      assert.match((await A.locator('.hang-weekly').textContent()) ?? '', /Bảng phong thần tuần này.*Đổi chủ 0h thứ Hai/)
      const chat = await A.locator('.hang-chat').boundingBox()
      assert.ok(chat.x > 1280 / 2, `chat nằm bên phải: x=${Math.round(chat.x)}`)
      await A.locator('.hang-weekly-toggle').click()
      assert.equal(await A.locator('.hang-weekly section').count(), 0, 'thu gọn được')
      await A.locator('.hang-weekly-toggle').click()
      await A.keyboard.press('KeyH')
      await A.waitForSelector('.hang-keys')
      await layoutOk(A, 'bảng phím')
      await A.keyboard.press('KeyH')
      assert.equal(await A.locator('.hang-keys').count(), 0)
      await A.keyboard.press('Enter')
      await until(() => A.evaluate(() => document.activeElement?.tagName === 'INPUT'), { label: 'Enter focus ô chat' })
      await A.keyboard.press('Escape')
      await A.getByRole('button', { name: /^Ẩn$/ }).click()
      assert.equal(await A.locator('.hang-chat').count(), 0, 'ẩn chat')
      await A.getByRole('button', { name: /Chat/ }).first().click()
      assert.equal(await A.locator('.hang-chat').count(), 1)
      await layoutOk(A, 'bố cục mới')
    })

    await t.test('Ăn mừng [G]: nút và phím G đều gửi lên server và nhận lại; ngồi thì khoá nút', async () => {
      const mine = () => A.evaluate(() => window.__hangNet.emotedAt.get(window.__hangNet.local.index) ?? 0)
      const before = await mine()
      await A.locator('.hang-emote').click()
      await until(async () => (await mine()) > before, { label: 'nhận lại emote từ nút' })
      await until(async () => (await A.evaluate(() => window.__hangStats().confetti)) > 20, { label: 'pháo giấy quanh người khi ăn mừng' })
      const first = await mine()
      await sleep(5800) // qua thời gian hồi 5,5 s (bằng thời gian ăn mừng)
      await A.keyboard.press('KeyG')
      await until(async () => (await mine()) > first, { label: 'nhận lại emote từ phím G' })
      await layoutOk(A, 'nút ăn mừng')
    })

    await t.test('bảng "Võ công cao nhất hang": mở/đóng được, không chồng chéo giao diện', async () => {
      await A.getByRole('button', { name: /Võ công/ }).click()
      await A.waitForSelector('.hang-rank')
      assert.match((await A.locator('.hang-rank').textContent()) ?? '', /Võ công cao nhất hang/)
      await layoutOk(A, 'bảng võ công')
      await A.locator('.hang-rank').getByRole('button', { name: 'Đóng' }).click()
      assert.equal(await A.locator('.hang-rank').count(), 0)
    })

    await t.test('bấm vào cảnh xin được pointer lock', async () => {
      await A.mouse.click(640, 400)
      await until(() => A.evaluate(() => !!document.pointerLockElement), { label: 'pointer lock' })
      await A.evaluate(() => document.exitPointerLock())
    })

    await t.test('chat được server xác nhận', async () => {
      await A.fill('.hang-chat input', 'Glory glory!')
      await A.keyboard.press('Enter')
      await A.waitForSelector('.hang-chat li[data-state="sent"]', { timeout: 6000 })
    })

    await t.test('T mở bảng ném đồ, ném tăng bộ đếm, không chồng chéo', async () => {
      await A.keyboard.press('Escape') // bỏ focus ô chat
      await A.keyboard.press('KeyT')
      await A.waitForSelector('.hang-rage')
      await A.locator('.hang-rage .carved-btn--primary').last().click()
      await until(async () => /hôm nay 1 /.test((await A.locator('.hang-rage header strong').textContent()) ?? ''), { label: 'bộ đếm ném đồ' })
      await layoutOk(A, 'rage open')
      // Cảnh 3D: camera chuyển sang hình nộm; bấm vào giữa cảnh (chính ngực hình nộm) thì đồ bay rồi để lại vệt bẩn.
      assert.equal(await A.evaluate(() => window.__hangStats().rageActive), true, 'camera chuyển sang chế độ ném')
      await sleep(3500) // camera lướt tới nơi (WebGL phần mềm chậm: tốc độ lướt phụ thuộc số khung hình)
      const box = await A.locator('.hang-scene canvas').boundingBox()
      await A.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await until(() => A.evaluate(() => window.__hangStats().rageFlying > 0 || window.__hangStats().rageSplats > 0), { label: 'đồ ném bay' })
      await until(() => A.evaluate(() => window.__hangStats().rageSplats >= 1), { timeout: 4000, label: 'trúng hình nộm để lại vệt' })
      await until(async () => /hôm nay 2 /.test((await A.locator('.hang-rage header strong').textContent()) ?? ''), { label: 'bộ đếm tăng theo lần ném bằng cách bấm cảnh' })
      await A.keyboard.press('Escape')
      await until(() => A.evaluate(() => window.__hangStats().rageActive === false), { label: 'Esc đóng chế độ ném, camera trở về' })
      assert.equal(await A.locator('.hang-rage').count(), 0)
      assert.equal(await A.locator('.hang-scene canvas').count(), 1, 'Esc trong chế độ ném không được rời hang')
    })

    const B = await newPage(browser, 'B', { width: 1280, height: 800 }, { errors })
    await enterCave(B, stack.baseUrl, 'Bob')

    await t.test('thông báo có người vào hang: biểu ngữ nổi bật giữa phía trên, tên in đậm, "vừa mới vào hang, ae giao lưu tí nhỉ"; tự tắt', async () => {
      const toast = A.locator('.hang-event')
      await toast.waitFor({ timeout: 20000 })
      assert.match((await toast.textContent()) ?? '', /Bob vừa mới vào hang, ae giao lưu tí nhỉ/)
      assert.equal(await toast.locator('strong', { hasText: 'Bob' }).count(), 1)
      const box = await toast.boundingBox()
      assert.ok(Math.abs(box.x + box.width / 2 - 640) < 4 && box.y < 200, `giữa phía trên màn hình: ${JSON.stringify(box)}`)
      assert.ok(parseFloat(await toast.locator('.hang-event-text').evaluate((el) => getComputedStyle(el).fontSize)) >= 17, 'chữ to')
      await layoutOk(A, 'toast')
      await toast.waitFor({ state: 'detached', timeout: 15000 })
    })

    await t.test('đi lại gần người thứ hai thì hiện nút mời; bố cục ổn', async () => {
      await A.keyboard.down('KeyS')
      await until(async () => (await nearestHuman(A)) < 4, { timeout: 25000, label: 'đã lại gần Bob' })
      await A.keyboard.up('KeyS')
      await A.waitForSelector('.hang-talk-btn', { timeout: 8000 })
      await layoutOk(A, 'near buttons')
    })

    await t.test('mời chat riêng: hộp thoại mời, đồng ý, nhắn tin, bố cục ổn', async () => {
      await A.click('.hang-talk-btn button:has-text("Giao lưu mồm")')
      await B.waitForSelector('.hang-invite')
      await layoutOk(B, 'invite dialog')
      await B.click('.hang-invite button:has-text("Đồng ý")')
      await A.waitForSelector('.hang-talk')
      await B.waitForSelector('.hang-talk')
      await A.fill('.hang-talk input', 'xin chào Bob')
      await A.keyboard.press('Enter')
      await B.waitForSelector('.hang-talk li:has-text("xin chào Bob")')
      await layoutOk(B, 'talk panel')
      await A.click('.hang-talk header button')
      await A.click('.hang-talk header button') // xác nhận kết thúc
      await B.locator('.hang-talk header button', { hasText: 'Đóng' }).click()
      await A.locator('.hang-talk header button', { hasText: 'Đóng' }).click()
    })

    await t.test('người được mời đang khoá chuột: lời mời nhả khoá để bấm được; phím Y đồng ý, N từ chối; Esc không làm rời hang', async () => {
      // B khoá chuột (như đang chơi bình thường) rồi A mời. Trước đây con trỏ ẩn nên B không bấm được "Đồng ý".
      await B.mouse.click(640, 400)
      await until(() => B.evaluate(() => !!document.pointerLockElement), { label: 'B khoá chuột' })
      await A.waitForSelector('.hang-talk-btn')
      await A.click('.hang-talk-btn button:has-text("Giao lưu mồm")')
      await B.waitForSelector('.hang-invite')
      assert.equal(await B.evaluate(() => !!document.pointerLockElement), false, 'có lời mời thì khoá chuột được nhả')
      await B.locator('.hang-invite button:has-text("Từ chối")').click({ timeout: 5000 }) // bấm chuột được
      await until(async () => (await A.locator('.hang-invite').count()) === 0, { label: 'A hết "đang mời"' })
      // lần hai: dùng phím
      await B.mouse.click(640, 400)
      await until(() => B.evaluate(() => !!document.pointerLockElement), { label: 'B khoá chuột lần hai' })
      await sleep(2200) // qua thời gian chờ mời lại sau khi bị từ chối
      await until(async () => { await A.click('.hang-talk-btn button:has-text("Giao lưu mồm")').catch(() => {}); return (await B.locator('.hang-invite').count()) > 0 }, { timeout: 20000, label: 'B thấy lời mời lần hai' })
      await B.keyboard.press('Escape') // Esc = từ chối, KHÔNG được thoát khỏi hang
      await until(async () => (await B.locator('.hang-invite').count()) === 0, { label: 'lời mời đóng' })
      assert.equal(await B.locator('.hang-top').count(), 1, 'B vẫn ở trong hang')
      await sleep(2200)
      await until(async () => { await A.click('.hang-talk-btn button:has-text("Giao lưu mồm")').catch(() => {}); return (await B.locator('.hang-invite').count()) > 0 }, { timeout: 20000, label: 'B thấy lời mời lần ba' })
      await B.keyboard.press('KeyY')
      await B.waitForSelector('.hang-talk', { timeout: 10000 })
      await A.waitForSelector('.hang-talk')
      await A.click('.hang-talk header button')
      await A.click('.hang-talk header button')
      await B.locator('.hang-talk header button', { hasText: 'Đóng' }).click()
      await A.locator('.hang-talk header button', { hasText: 'Đóng' }).click()
    })
    await t.test('duel: lời mời, cảnh báo gồng tay, thanh máu, Esc xác nhận bỏ cuộc, thẻ kết quả', async () => {
      await A.waitForSelector('.hang-talk-btn')
      await A.click('.hang-talk-btn button:has-text("Giao lưu võ thuật")')
      await B.waitForSelector('.hang-invite')
      assert.match((await B.locator('.hang-invite').first().textContent()) ?? '', /võ thuật/)
      await B.click('.hang-invite button:has-text("Đồng ý")')
      await A.waitForSelector('.duel')
      await B.waitForSelector('.duel')
      await layoutOk(A, 'duel countdown')
      // Sàn đấu 3D phải thật sự thay cho cảnh hang: có hai võ sĩ, và hình vẽ khác hẳn cảnh hang.
      const stats = await A.evaluate(() => window.__hangStats())
      assert.equal(stats.arena, true, 'đang có trận thì phải vẽ sàn đấu')
      assert.equal(stats.arenaFighters, 2)
      assert.ok((await sceneStats(A, await A.screenshot())).colors > 60, 'sàn đấu không được trống')
      await A.waitForSelector('.duel-actions', { timeout: 10000 })
      await A.click('.duel-actions .carved-btn--primary')
      await B.waitForSelector('.duel-banner--warn', { timeout: 3000 })
      await layoutOk(B, 'duel fight')
      await until(async () => /85/.test((await B.locator('.duel-side small').first().textContent()) ?? ''), { label: 'máu của B còn 85' })
      await B.keyboard.press('Escape')
      await B.waitForSelector('.duel-quit >> text=Chắc chứ')
      await B.click('.duel-quit button:has-text("Bỏ cuộc")')
      await A.waitForSelector('.duel-end')
      assert.match((await A.locator('.duel-end').textContent()) ?? '', /Bạn thắng/)
      await layoutOk(A, 'duel end')
      await A.click('.duel-end .carved-btn--primary')
      await until(async () => (await A.locator('.duel').count()) === 0, { label: 'duel đóng' })
      await until(() => A.evaluate(() => window.__hangStats().arena === false), { label: 'sàn đấu được giải phóng, trở về cảnh hang' })
    })
    // Cuối cùng: trang riêng để thử ngồi ghế hội trường (không làm xáo trộn vị trí của A và B).
    await A.context().close() // giải phóng hai ngữ cảnh WebGL phần mềm trước khi mở trang thứ ba
    await B.context().close()
    const S = await newPage(browser, 'S', { width: 1280, height: 800 }, { errors })
    await enterCave(S, stack.baseUrl, 'Sitter')
    await sleep(6500) // đứng yên > 4,6 s: server chỉ chấp nhận bước nhảy tới ghế (≈ 66 m trong bài thử) khi khoảng cách giữa hai bản tin đủ dài
    await t.test('màn hình hội trường: chỉ hiện khi ngồi; không gọi bên thứ ba trước khi bấm; bấm mới nhúng; đứng dậy thì tắt', async () => {
      const thirdParty = []
      await S.route('https://www.youtube-nocookie.com/**', (route) => {
        thirdParty.push(route.request().url())
        return route.fulfill({ contentType: 'text/html', body: '<html><body>giả lập trình phát</body></html>' })
      })
      // Dùng một trang riêng (Sitter): ngồi/đứng dậy được báo lên server nên không được làm xáo trộn vị trí của A trong các bài khác.
      // Cú dịch chuyển tới ghế chỉ ở phía client; server chấp nhận bước nhảy khi người chơi đã đứng yên lâu (thời gian giữa hai bản tin dài).
      await S.evaluate(() => {
        const me = window.__hangNet.local
        for (const b of [me.curr, me.prev, me.draw]) { b.x = -10.8; b.z = -28.5; b.vx = 0; b.vz = 0 } // trong hành lang, sát ghế hàng thứ tư
      })
      // báo vị trí mới lên server (một bản tin di chuyển): server cần biết người chơi đang đứng sát ghế thì mới cho ngồi
      await S.keyboard.down('KeyW')
      await sleep(250)
      await S.keyboard.up('KeyW')
      await S.evaluate(() => window.__hangNet.onJson({ t: 'board', videos: ['abcDEF12345', 'ghiJKL67890'], music: ['mnoPQR11111'] }))
      assert.equal(await S.locator('.hang-board').count(), 0, 'đang đứng thì không hiện')
      // đến gần ghế: hiện gợi ý vùng "Hội trường đá: bấm E để ngồi"
      await until(async () => /Hội trường đá: bấm E để ngồi/.test((await S.locator('.hang-hint').textContent()) ?? ''), { timeout: 8000, label: 'gợi ý vùng hội trường' })
      await S.keyboard.press('KeyE')
      await S.waitForSelector('.hang-board')
      const seated = await S.evaluate(() => { const m = window.__hangNet.local; return { x: m.curr.x, z: m.curr.z, h: m.curr.heading, seated: window.__hangNet.seated } })
      // vị trí đi qua server nên bị làm tròn 1/256 m
      assert.ok(Math.abs(seated.x + 10.8) < 0.01 && Math.abs(seated.z + 29.2) < 0.01 && seated.seated, `ngồi thì dịch lên đúng ghế: (${seated.x}, ${seated.z})`)
      await until(() => S.evaluate(() => window.__hangNet.seats.get(window.__hangNet.local.index) === 30), { label: 'server xác nhận ngồi ghế 30' })
      assert.ok(Math.abs(Math.abs(seated.h) - Math.PI) < 0.01, 'mặt về màn hình (hướng −z)')
      assert.equal(await S.locator('.hang-board iframe').count(), 0, 'chưa bấm thì không được nhúng nội dung bên thứ ba')
      assert.deepEqual(thirdParty, [], 'chưa bấm thì không được có yêu cầu mạng tới bên thứ ba')
      await layoutOk(S, 'board panel')
      await S.click('.hang-board button:has-text("Phát video")')
      const src = await S.locator('.hang-board iframe').getAttribute('src')
      assert.match(src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/abcDEF12345\?/)
      assert.match(src, /playlist=ghiJKL67890/)
      assert.equal(await S.locator('.hang-board iframe').getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-presentation')
      await until(() => thirdParty.length > 0, { label: 'sau khi bấm mới gọi trình phát' })
      await S.keyboard.press('KeyE') // đứng dậy
      const stood = await S.evaluate(() => { const m = window.__hangNet.local; return { x: m.curr.x, z: m.curr.z, seated: window.__hangNet.seated } })
      assert.ok(Math.abs(stood.x + 10.8) < 0.01 && Math.abs(stood.z + 28.05) < 0.01 && !stood.seated, `đứng dậy ở hành lang trước ghế: (${stood.x}, ${stood.z})`)
      await until(async () => (await S.locator('.hang-board').count()) === 0, { label: 'đứng dậy thì tắt màn hình' })
      await S.evaluate(() => window.__hangNet.onJson({ t: 'board', videos: [], music: [] }))
      await S.unroute('https://www.youtube-nocookie.com/**')
    })
    await t.test('đấm: bấm F ghi nhận mục tiêu (hụt = −1); bị đấm thì hiện dòng thông báo và viền đỏ rồi tự tắt', async () => {
      const expected = await S.evaluate(() => window.__hangNet.punchTarget()?.index ?? -1)
      const before = await S.evaluate(() => window.__hangNet.punchAnimAt)
      await S.keyboard.press('KeyF')
      const after = await S.evaluate(() => ({ at: window.__hangNet.punchAnimAt, target: window.__hangNet.punchTargetIndex }))
      assert.ok(after.at > before, 'F kích hoạt cú vung')
      assert.equal(after.target, expected, 'mục tiêu ghi nhận khớp việc chọn mục tiêu lúc bấm')
      assert.equal(await S.locator('.hang-punched-vignette').count(), 0, 'chưa bị đấm thì không có viền đỏ')
      await S.evaluate(() => window.__hangNet.onJson({ t: 'punched', by: 9999 }))
      await S.waitForSelector('.hang-punched-vignette')
      assert.match((await S.locator('.hang-punched').textContent()) ?? '', /vừa đấm bạn/)
      assert.equal(await S.evaluate(() => window.__hangNet.punchedBy), 9999)
      await layoutOk(S, 'bị đấm')
      await until(async () => (await S.locator('.hang-punched-vignette').count()) === 0, { timeout: 4000, label: 'viền đỏ tự tắt' })
    })

    // Làm sau cùng vì các bài dưới đưa người chơi ra xa chỗ xuất hiện. Dùng trang S (A và B đã đóng).
    const walkTo = async (points) => {
      await S.keyboard.down('KeyW')
      for (const [wx, wz] of points) {
        await until(async () => {
          const d = await S.evaluate(([x, z]) => {
            const m = window.__hangNet.local
            const dx = x - m.curr.x
            const dz = z - m.curr.z
            window.__hangSetYaw(Math.atan2(-dx, -dz), 0)
            return Math.hypot(dx, dz)
          }, [wx, wz])
          return d < 0.4
        }, { timeout: 40000, label: `tới (${wx}, ${wz})` })
      }
      await S.keyboard.up('KeyW')
    }
    const hint = async () => (await S.locator('.hang-hint').textContent()) ?? ''
    const where = () => S.evaluate(() => { const m = window.__hangNet.local; return { x: m.curr.x, z: m.curr.z, y: m.curr.y, heading: m.curr.heading } })
    await t.test('phòng chờ: tường kính chặn (đi thẳng vào không lọt), bấm E ở cửa mới vào, tới sofa bấm E ngồi (quay mặt vào bàn, server báo ghế), đứng dậy, bấm E ở cửa trong để ra', async () => {
      await S.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()) // bỏ tiêu điểm khỏi nút/ô nhập của bài trước
      // từ hành lang hội trường: ra đầu hàng ghế, vòng ngoài bục thi đấu xuống phía nam, tới trước cửa phòng chờ
      await walkTo([[-13.5, -28], [-16, -24], [-16, 30], [-4, 37.5], [0, 39.2]])
      await until(async () => /Phòng chờ: bấm E để vào/.test(await hint()), { timeout: 10000, label: 'gợi ý vào phòng chờ' })
      // thử đi thẳng qua tường: không lọt vào (z phải ≤ 40,6 vì tường ở z = 41)
      await S.keyboard.down('KeyW')
      await S.evaluate(() => window.__hangSetYaw(Math.PI, 0)) // quay mặt về +z... (hướng đi = −sin/−cos của yaw)
      await sleep(1500)
      await S.keyboard.up('KeyW')
      assert.ok((await where()).z < 40.7, `tường kính chặn: z=${(await where()).z}`)
      await walkTo([[0, 39.2]])
      await S.keyboard.press('KeyE')
      await until(async () => (await where()).z > 42, { timeout: 10000, label: 'đã vào phòng chờ' })
      assert.match(await hint(), /Đã vào Phòng chờ|bấm E để ra ngoài/)
      await walkTo([[4.5, 43], [4.5, 45.25], [2.1, 45.25], [2.1, 47.5]])
      await until(async () => /Phòng chờ: bấm E để ngồi/.test(await hint()), { timeout: 10000, label: 'gợi ý ngồi phòng chờ' })
      await S.keyboard.press('KeyE')
      await until(async () => (await S.evaluate(() => window.__hangNet.seats.size)) === 1, { timeout: 10000, label: 'server báo đã ngồi' })
      const seated = await S.evaluate(() => { const m = window.__hangNet.local; return { x: m.curr.x, z: m.curr.z, heading: m.curr.heading, bench: [...window.__hangNet.seats.values()][0] } })
      assert.ok(seated.bench >= 50 && seated.bench < 60, `ghế phòng chờ có chỉ số 50–59: ${seated.bench}`)
      assert.ok(Math.abs(Math.abs(seated.heading) - Math.PI / 2) < 0.05, `ngồi ở sofa bên, quay mặt về phía bàn: ${seated.heading}`)
      assert.match(await hint(), /Đang ngồi ở phòng chờ/)
      await S.keyboard.press('KeyE')
      await until(async () => (await S.evaluate(() => window.__hangNet.seats.size)) === 0, { timeout: 10000, label: 'server báo đã đứng dậy' })
      const up = await where()
      const moved = Math.hypot(up.x - seated.x, up.z - seated.z)
      assert.ok(moved > 0.9 && moved < 1.8, `đứng dậy ra trước sofa: (${up.x}, ${up.z})`)
      await layoutOk(S, 'phòng chờ')
      await walkTo([[2.1, 45.25], [4.5, 45.25], [4.5, 43], [0, 42.9]])
      await until(async () => /Phòng chờ: bấm E để ra ngoài/.test(await hint()), { timeout: 10000, label: 'gợi ý ra khỏi phòng chờ' })
      await S.keyboard.press('KeyE')
      await until(async () => (await where()).z < 40, { timeout: 10000, label: 'đã ra ngoài' })
    })
    await t.test('sân thi đấu: vành bục chặn, bấm E ở cửa mới lên bục (cao 1 m), đi trong bục không xuyên bệ cúp, bấm E ở cửa trong để ra', async () => {
      await walkTo([[0, 20], [0, 13.2]])
      await until(async () => /Sân thi đấu: bấm E để vào/.test(await hint()), { timeout: 10000, label: 'gợi ý vào sân thi đấu' })
      await S.keyboard.down('KeyW')
      await S.evaluate(() => window.__hangSetYaw(0, 0))
      await sleep(1200)
      await S.keyboard.up('KeyW')
      assert.ok(Math.hypot((await where()).x, (await where()).z) > 11.7, 'vành bục chặn từ phía ngoài')
      await walkTo([[0, 13.2]])
      await S.keyboard.press('KeyE')
      await until(async () => Math.hypot((await where()).x, (await where()).z) < 11, { timeout: 10000, label: 'đã lên bục' })
      await until(async () => (await where()).y > 0.95, { timeout: 5000, label: 'đứng ở độ cao bục' })
      await walkTo([[0, 6]])
      await S.keyboard.down('KeyW')
      await S.evaluate(() => window.__hangSetYaw(0, 0))
      await sleep(1500)
      await S.keyboard.up('KeyW')
      const w = await where()
      assert.ok(Math.hypot(w.x, w.z) > 1.8, `bệ cúp chặn: cách tâm ${Math.hypot(w.x, w.z).toFixed(2)}`)
      await walkTo([[0, 9.8]])
      await until(async () => /Sân thi đấu: bấm E để ra ngoài/.test(await hint()), { timeout: 10000, label: 'gợi ý ra khỏi sân thi đấu' })
      await S.keyboard.press('KeyE')
      await until(async () => Math.hypot((await where()).x, (await where()).z) > 12, { timeout: 10000, label: 'đã ra ngoài bục' })
    })
  } finally {
    await browser.close()
    await stack.stop()
  }
  assert.deepEqual([...new Set(errors)], [], 'không có lỗi console / pageerror')
})
