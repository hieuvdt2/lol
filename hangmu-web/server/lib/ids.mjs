// Kiểm tra dữ liệu do quản trị đưa vào và dữ liệu nạp từ đĩa.

/** [INFERRED] Hình dạng ID video/nhạc (suy ra từ cách client gốc lọc danh sách; client mới cũng kiểm lại khi phát). */
export const ID_RE = /^[A-Za-z0-9_-]{6,20}$/
export const BOARD_MAX = 200

/** Loại trùng, giữ thứ tự. `invalid` đếm mục sai định dạng, `truncated` cho biết có mục bị cắt vì vượt BOARD_MAX. */
export function normalizeIds(list) {
  if (!Array.isArray(list)) return { ids: [], invalid: 1, truncated: false }
  const seen = new Set()
  const ids = []
  let invalid = 0
  let truncated = false
  for (const value of list) {
    if (typeof value !== 'string' || !ID_RE.test(value)) {
      invalid += 1
      continue
    }
    if (seen.has(value)) continue
    if (ids.length >= BOARD_MAX) {
      truncated = true
      continue
    }
    seen.add(value)
    ids.push(value)
  }
  return { ids, invalid, truncated }
}

/** Văn bản hệ thống nhiều dòng: tối đa 30 dòng, mỗi dòng ≤ 300 ký tự. Trả { text } hoặc { error }. */
export function cleanSysText(value) {
  if (typeof value !== 'string') return { error: 'text phải là chuỗi' }
  const lines = value
    .replace(/\r/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return { error: 'text trống' }
  if (lines.length > 30) return { error: 'tối đa 30 dòng' }
  if (lines.some((line) => Array.from(line).length > 300)) return { error: 'mỗi dòng tối đa 300 ký tự' }
  return { text: lines.join('\n') }
}

/** Thông báo `notice` kiểu tele_join / room_join: tối đa 2 tên, kèm số người còn lại. */
export function cleanNotice(body) {
  if (!body || (body.kind !== 'tele_join' && body.kind !== 'room_join')) return { error: "kind phải là 'tele_join' hoặc 'room_join'" }
  if (!Array.isArray(body.names) || body.names.length > 2) return { error: 'names phải là mảng tối đa 2 phần tử' }
  const names = body.names.map((n) => (typeof n === 'string' ? n.trim() : ''))
  if (names.some((n) => n.length === 0 || Array.from(n).length > 40)) return { error: 'mỗi tên 1–40 ký tự' }
  const more = body.more === undefined ? 0 : body.more
  if (!Number.isInteger(more) || more < 0 || more > 100_000) return { error: 'more phải là số nguyên 0–100000' }
  if (names.length + more === 0) return { error: 'cần ít nhất một tên hoặc more > 0' }
  return { notice: { t: 'notice', kind: body.kind, names, more } }
}

export function cleanPoll(body) {
  const q = typeof body?.q === 'string' ? body.q.trim() : ''
  if (q.length === 0 || Array.from(q).length > 200) return { error: 'q phải 1–200 ký tự' }
  const options = Array.isArray(body.options) ? body.options.map((o) => (typeof o === 'string' ? o.trim() : '')) : []
  if (options.length < 2 || options.length > 6) return { error: 'options phải có 2–6 phần tử' }
  if (options.some((o) => o.length === 0 || Array.from(o).length > 60)) return { error: 'mỗi lựa chọn 1–60 ký tự' }
  if (new Set(options).size !== options.length) return { error: 'các lựa chọn không được trùng nhau' }
  return { q, options }
}
