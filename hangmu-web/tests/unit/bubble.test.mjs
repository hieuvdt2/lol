// Bong bóng chat: câu dài xuống dòng và hiện đủ (trước đây cắt ở 48 ký tự).
import test from 'node:test'
import assert from 'node:assert/strict'
import { BUBBLE_LINE_PX, BUBBLE_MAX_LINES, wrapText } from '../../src/game/bubble.ts'
import { QUICK_CHAT } from '../../src/content/quickChat.ts'

// đo giả: mỗi ký tự rộng 19 px (xấp xỉ chữ đậm 34 px)
const measure = (s) => Array.from(s).length * 19

test('mọi câu chat nhanh hiện đủ chữ trong bong bóng (không có "…"), mỗi dòng vừa bề rộng', () => {
  for (const text of QUICK_CHAT) {
    const lines = wrapText(text, measure, BUBBLE_LINE_PX)
    assert.equal(lines.join(' '), text, `đủ chữ: ${text}`)
    assert.ok(lines.length <= BUBBLE_MAX_LINES)
    for (const l of lines) assert.ok(measure(l) <= BUBBLE_LINE_PX, `dòng quá rộng: ${l}`)
  }
  const long = wrapText('Oh look at the cleanse, look at the moves! Faker, what was that?!', measure, BUBBLE_LINE_PX)
  assert.ok(long.length >= 2, 'câu dài xuống dòng')
})

test('câu ngắn một dòng; từ quá dài thì cắt theo ký tự; quá số dòng thì dòng cuối có "…"', () => {
  assert.deepEqual(wrapText('Chào anh em', measure, BUBBLE_LINE_PX), ['Chào anh em'])
  const word = 'a'.repeat(80)
  const parts = wrapText(word, measure, BUBBLE_LINE_PX)
  assert.equal(parts.join(''), word)
  assert.ok(parts.every((l) => measure(l) <= BUBBLE_LINE_PX))
  const many = wrapText('chữ '.repeat(200), measure, BUBBLE_LINE_PX)
  assert.equal(many.length, BUBBLE_MAX_LINES)
  assert.ok(many.at(-1).endsWith('…'))
  assert.ok(measure(many.at(-1)) <= BUBBLE_LINE_PX)
})
