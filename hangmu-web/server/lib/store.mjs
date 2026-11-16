// Lưu trạng thái bền vững (xếp hạng, ban, poll, board) vào một tệp JSON nhỏ, ghi nguyên tử: ghi tệp tạm rồi rename.
// Không bao giờ được làm sập server: thư mục không ghi được thì chạy tiếp không lưu; tệp hỏng thì đổi tên giữ lại và bắt đầu trống.
import fs from 'node:fs'
import path from 'node:path'

export function createStore({ dir, log, getState, file = 'state.json', debounceMs = 500 }) {
  const target = path.join(dir, file)
  let enabled = true
  let dirty = false
  let timer = null

  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.accessSync(dir, fs.constants.W_OK)
  } catch (error) {
    enabled = false
    log.error('DATA_DIR không ghi được: chạy tiếp mà không lưu bền vững', { dir, error: String(error.message ?? error) })
  }

  function load() {
    if (!enabled) return null
    let raw
    try {
      raw = fs.readFileSync(target, 'utf8')
    } catch (error) {
      if (error.code !== 'ENOENT') log.error('không đọc được tệp trạng thái', { file: target, error: String(error.message ?? error) })
      return null
    }
    try {
      const data = JSON.parse(raw)
      if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('không phải đối tượng JSON')
      return data
    } catch (error) {
      const kept = `${target}.corrupt-${Date.now()}`
      try {
        fs.renameSync(target, kept)
      } catch {
        /* không đổi tên được thì thôi */
      }
      log.error('tệp trạng thái hỏng: bỏ qua và bắt đầu trống', { file: target, keptAs: kept, error: String(error.message ?? error) })
      return null
    }
  }

  function writeNow() {
    const tmp = `${target}.${process.pid}.tmp`
    const body = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ...getState() })
    fs.writeFileSync(tmp, body)
    fs.renameSync(tmp, target) // rename trong cùng thư mục là nguyên tử: người đọc chỉ thấy bản cũ hoặc bản mới đầy đủ
  }

  /** Ghi ngay nếu có thay đổi chưa ghi. Gọi khi tắt server. */
  function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!enabled || !dirty) return false
    dirty = false
    try {
      writeNow()
      return true
    } catch (error) {
      dirty = true
      log.error('ghi tệp trạng thái thất bại', { file: target, error: String(error.message ?? error) })
      return false
    }
  }

  /** Đánh dấu có thay đổi; gộp nhiều thay đổi liên tiếp thành một lần ghi. */
  function schedule() {
    dirty = true
    if (!enabled || timer) return
    timer = setTimeout(() => {
      timer = null
      flush()
    }, debounceMs)
  }

  return { load, flush, schedule, get enabled() { return enabled }, target }
}
