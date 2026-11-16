import test from 'node:test'
import assert from 'node:assert/strict'
import { parseYoutubeLink, BOARD_MAX_IDS, embedUrl, parseBoard, parseBoardIds } from '../../src/game/board.ts'

test('parseBoardIds: chỉ nhận chuỗi định danh hợp lệ, bỏ trùng, giữ thứ tự', () => {
  assert.deepEqual(parseBoardIds(['abcDEF12', 'abcDEF12', 'x_y-z123', 'ngan', '<script>1', 'có dấu cách', 12345, null, {}]), ['abcDEF12', 'x_y-z123'])
  assert.deepEqual(parseBoardIds('không phải mảng'), [])
  assert.deepEqual(parseBoardIds(undefined), [])
  assert.deepEqual(parseBoardIds([]), [])
})

test('parseBoardIds: ranh giới độ dài 6 và 20, tối đa 200 mục', () => {
  assert.deepEqual(parseBoardIds(['a'.repeat(5), 'a'.repeat(6), 'a'.repeat(20), 'a'.repeat(21)]), ['a'.repeat(6), 'a'.repeat(20)])
  const many = Array.from({ length: 500 }, (_, i) => `id${String(i).padStart(6, '0')}`)
  const out = parseBoardIds(many)
  assert.equal(out.length, BOARD_MAX_IDS)
  assert.equal(out[0], many[0])
  assert.equal(out.at(-1), many[BOARD_MAX_IDS - 1])
})

test('parseBoard: nhận mảng videos, nhận trường video đơn lẻ kiểu cũ, music độc lập', () => {
  assert.deepEqual(parseBoard({ videos: ['video0001', 'video0002'], music: ['music0001'] }), { videos: ['video0001', 'video0002'], music: ['music0001'] })
  assert.deepEqual(parseBoard({ video: 'single0001' }), { videos: ['single0001'], music: [] })
  assert.deepEqual(parseBoard({ videos: ['video0001'], video: 'bi-bo-qua' }), { videos: ['video0001'], music: [] }, 'có videos thì bỏ qua video')
  assert.deepEqual(parseBoard({}), { videos: [], music: [] })
  assert.deepEqual(parseBoard({ videos: 'sai', music: 7 }), { videos: [], music: [] })
})

test('embedUrl: dạng không cookie, autoplay + danh sách phát, từ chối đầu vào xấu', () => {
  const one = embedUrl(['abcDEF12'])
  assert.match(one, /^https:\/\/www\.youtube-nocookie\.com\/embed\/abcDEF12\?/)
  assert.match(one, /autoplay=1/)
  assert.ok(!one.includes('playlist='), 'một mục thì không có danh sách phát')
  const list = embedUrl(['aaaaaa01', 'bbbbbb02', 'cccccc03'])
  assert.match(list, /embed\/aaaaaa01\?/)
  assert.match(list, /playlist=bbbbbb02,cccccc03/)
  assert.ok(!embedUrl(['aaaaaa01'], { autoplay: false }).includes('autoplay'))
  assert.equal(embedUrl([]), null)
  assert.equal(embedUrl(['../evil']), null, 'định danh xấu không được ghép vào URL')
  assert.equal(embedUrl(['x'.repeat(5)]), null)
})

test('parseYoutubeLink: nhận các dạng link phổ biến và ID trần; từ chối thứ không phải YouTube', () => {
  const id = 'dQw4w9WgXcQ'
  for (const input of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `  ${id}  `,
  ]) assert.equal(parseYoutubeLink(input), id, input)
  for (const input of ['', '   ', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://evil.com/youtu.be/dQw4w9WgXcQ', 'javascript:alert(1)', 'https://www.youtube.com/watch', 'https://www.youtube.com/watch?v=<script>', 'https://www.youtube.com/playlist?list=PL12345678', 'x'.repeat(400), 'abc']) {
    assert.equal(parseYoutubeLink(input), null, input)
  }
})

test('embedUrl chế độ api: bật điều khiển từ trang, ẩn thanh điều khiển, kèm origin; mặc định không đổi', () => {
  const plain = embedUrl(['dQw4w9WgXcQ'])
  assert.ok(!plain.includes('enablejsapi'))
  const api = embedUrl(['dQw4w9WgXcQ', 'abcDEF12345'], { api: true, origin: 'https://example.org' })
  const url = new URL(api)
  assert.equal(url.hostname, 'www.youtube-nocookie.com')
  assert.equal(url.searchParams.get('enablejsapi'), '1')
  assert.equal(url.searchParams.get('controls'), '0')
  assert.equal(url.searchParams.get('origin'), 'https://example.org')
  assert.equal(url.searchParams.get('playlist'), 'abcDEF12345')
})
