// Danh sách đội LCK trên biểu ngữ: đủ 10 đội, hạng 1–10, và biểu ngữ nằm gọn dưới mặt vòm (không bị vòm cắt như bản cũ).
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { LCK_TEAMS, LOGO_FILES, wrapLines } from '../../src/game/teams.ts'
import { TEAM_BANNER, TEAM_BANNER_ANGLES } from '../../src/game/teamBanners.ts'
import { STAND_GAPS, floorHeight } from '../../shared/world.mjs'

const ceilingAt = (d) => 30 * Math.sqrt(Math.max(0, 1 - (d / 58) ** 2))

test('10 đội, hạng 1–10 không trùng, tên và slug không trùng, vé hợp lệ', () => {
  assert.equal(LCK_TEAMS.length, 10)
  assert.deepEqual(LCK_TEAMS.map((t) => t.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.equal(new Set(LCK_TEAMS.map((t) => t.name)).size, 10)
  assert.equal(new Set(LCK_TEAMS.map((t) => t.slug)).size, 10)
  for (const t of LCK_TEAMS) assert.ok(['CKTG 2026', 'DCGI 2026', 'Không có'].includes(t.ticket), t.name)
  assert.deepEqual(LCK_TEAMS.filter((t) => t.ticket === 'CKTG 2026').map((t) => t.name), ['Gen.G', 'Hanwha Life Esports', 'T1', 'Dplus KIA'])
})

test('mọi logo khai báo đều có tệp trong public/teams và có ghi công', () => {
  const credits = fs.readFileSync(new URL('../../public/teams/CREDITS.md', import.meta.url), 'utf8')
  for (const slug of LOGO_FILES) {
    assert.ok(fs.existsSync(new URL(`../../public/teams/${slug}.png`, import.meta.url)), slug)
    assert.ok(credits.includes(`${slug}.png`), `thiếu ghi công ${slug}`)
  }
})

test('biểu ngữ nằm dưới mặt vòm, cao hơn đầu người dưới nó và không đè lên cửa vào / hội trường / lối giữa', () => {
  const { height, distance, bottom, width } = TEAM_BANNER
  assert.ok(bottom + height < ceilingAt(distance + width / 2) - 0.5, 'đỉnh biểu ngữ không bị vòm cắt')
  assert.ok(bottom > floorHeight(distance + width / 2, 0) + 1.8 + 0.5, 'người đứng ngay dưới biểu ngữ (bậc ở chỗ treo) không đụng đầu')
  assert.equal(TEAM_BANNER_ANGLES.length, LCK_TEAMS.length)
  for (const a of TEAM_BANNER_ANGLES) {
    for (const [center, half] of STAND_GAPS) {
      const diff = Math.abs(Math.atan2(Math.sin(a - center), Math.cos(a - center)))
      assert.ok(diff > half + 0.2, `biểu ngữ góc ${a} đè lên khoảng trống ${center}`)
    }
  }
  const sorted = [...TEAM_BANNER_ANGLES].sort((p, q) => p - q)
  for (let i = 1; i < sorted.length; i += 1) assert.ok((sorted[i] - sorted[i - 1]) * distance > width + 0.3 || sorted[i] - sorted[i - 1] > 1, 'hai biểu ngữ không chồng nhau')
})

test('wrapLines: cắt theo từ, không vượt độ rộng, không mất chữ', () => {
  const measure = (s) => s.length * 10
  const lines = wrapLines('Hạt giống số 1 LCK dự MSI 2026 (hạng nhất vòng 1–2).', 200, measure)
  assert.ok(lines.length > 1)
  for (const l of lines) assert.ok(measure(l) <= 200 || !l.includes(' '), l)
  assert.equal(lines.join(' '), 'Hạt giống số 1 LCK dự MSI 2026 (hạng nhất vòng 1–2).')
  assert.deepEqual(wrapLines('', 100, measure), [])
})
