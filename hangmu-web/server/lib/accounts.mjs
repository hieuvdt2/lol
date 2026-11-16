// Danh tính người chơi: cookie `hm_sid` (mã ngẫu nhiên, HttpOnly) + hồ sơ (tên, số áo) lưu tối đa 14 ngày kể từ lần vào hang gần nhất.
// Điều khoản của bản gốc nêu đúng các điểm này; phần còn lại (định dạng mã, giới hạn số bản ghi) là lựa chọn của bản dựng lại.
import { DEFAULT_LOOK_CODE, normalizeLookCode } from '../../shared/look.mjs'
import crypto from 'node:crypto'

export const SID_COOKIE = 'hm_sid'
export const ACCOUNT_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const NAME_MAX_CHARS = 30

const SID_RE = /^[A-Za-z0-9_-]{20,64}$/

export const newSid = () => crypto.randomBytes(24).toString('base64url')
export const validSid = (value) => typeof value === 'string' && SID_RE.test(value)

/** Lấy giá trị một cookie từ header `Cookie`; không có / sai định dạng thì null. */
export function readCookie(header, name) {
  if (typeof header !== 'string' || header.length > 4096) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

/** Mã người dùng hợp lệ từ header Cookie, hoặc null. */
export const sidFromCookieHeader = (header) => {
  const value = readCookie(header, SID_COOKIE)
  return validSid(value) ? value : null
}

/** Giá trị header `Set-Cookie`. HttpOnly để script trên trang không đọc được; SameSite=Lax. */
export function sidCookie(sid, { secure = false, maxAgeMs = ACCOUNT_TTL_MS } = {}) {
  return `${SID_COOKIE}=${sid}; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

/**
 * Kiểm tra hồ sơ do client gửi. `clean` là hàm chuẩn hoá chuỗi (cùng hàm dùng cho chat: bỏ ký tự ẩn, NFC...).
 * @returns {{ name: string, number: number | null, look: number } | { error: string }}  (`look`: mã ngoại hình, xem shared/look.mjs; thiếu/sai → mặc định)
 */
export function validateProfile(input, clean = (s) => s.trim()) {
  if (typeof input !== 'object' || input === null) return { error: 'dữ liệu không hợp lệ' }
  const rawName = typeof input.name === 'string' ? input.name : ''
  const name = clean(rawName).trim()
  const length = Array.from(name).length
  if (length < 1 || length > NAME_MAX_CHARS) return { error: 'Tên không hợp lệ (1–30 ký tự).' }
  const n = input.number
  if (n !== null && n !== undefined && n !== '') {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 99) return { error: 'Số áo phải từ 1 đến 99.' }
    return { name, number: n, look: normalizeLookCode(input.look) }
  }
  return { name, number: null, look: normalizeLookCode(input.look) }
}

/** Bước đầu tuần (thứ Hai 00:00 giờ Việt Nam, UTC+7) chứa mốc `ts`, tính bằng ms epoch. */
export function weekStart(ts, offsetHours = 7) {
  const shifted = ts + offsetHours * 3_600_000
  const day = Math.floor(shifted / 86_400_000) // số ngày kể từ 1/1/1970 (thứ Năm)
  const sinceMonday = (day + 3) % 7 // 1/1/1970 là thứ Năm → thứ Hai = 0
  return (day - sinceMonday) * 86_400_000 - offsetHours * 3_600_000
}

/**
 * Kho hồ sơ trong bộ nhớ. Mọi thao tác nhận `now` qua tham số để kiểm thử được mà không cần chờ thật.
 * Khi đầy (max) thì bỏ hồ sơ lâu không vào nhất.
 */
export function createAccounts({ ttlMs = ACCOUNT_TTL_MS, max = 100_000 } = {}) {
  /** @type {Map<string, { name: string, number: number | null, lastAt: number }>} */
  const map = new Map()
  const fresh = (rec, now) => rec && now - rec.lastAt < ttlMs

  return {
    get size() {
      return map.size
    },
    /** Hồ sơ còn hạn, hoặc null. */
    get(sid, now = Date.now()) {
      const rec = map.get(sid)
      return fresh(rec, now) ? { name: rec.name, number: rec.number, look: rec.look ?? DEFAULT_LOOK_CODE } : null
    },
    /** Lưu / cập nhật hồ sơ và gia hạn 14 ngày. */
    save(sid, profile, now = Date.now()) {
      map.set(sid, { name: profile.name, number: profile.number ?? null, look: normalizeLookCode(profile.look), lastAt: now })
      if (map.size > max) {
        let oldest = null
        for (const [key, rec] of map) if (oldest === null || rec.lastAt < map.get(oldest).lastAt) oldest = key
        if (oldest !== null && oldest !== sid) map.delete(oldest)
      }
    },
    /** Gia hạn khi vào hang (không đổi nội dung). */
    touch(sid, now = Date.now()) {
      const rec = map.get(sid)
      if (fresh(rec, now)) rec.lastAt = now
    },
    /** Xoá hồ sơ hết hạn; trả về số đã xoá. */
    prune(now = Date.now()) {
      let removed = 0
      for (const [key, rec] of map) {
        if (!fresh(rec, now)) {
          map.delete(key)
          removed += 1
        }
      }
      return removed
    },
    export() {
      return [...map.entries()].map(([sid, rec]) => [sid, rec.name, rec.number, rec.lastAt, rec.look ?? DEFAULT_LOOK_CODE])
    },
    import(rows, now = Date.now()) {
      if (!Array.isArray(rows)) return
      for (const row of rows) {
        if (!Array.isArray(row)) continue
        const [sid, name, number, lastAt, look] = row
        if (!validSid(sid) || typeof name !== 'string' || !Number.isFinite(lastAt)) continue
        const rec = { name: name.slice(0, 120), number: Number.isInteger(number) && number >= 1 && number <= 99 ? number : null, look: normalizeLookCode(look), lastAt }
        if (fresh(rec, now)) map.set(sid, rec)
      }
    },
  }
}
