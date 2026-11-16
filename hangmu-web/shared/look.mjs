// Ngoại hình nhân vật: đội cổ vũ (màu áo), màu da, kiểu tóc, màu tóc. Dùng chung client + server.
// Gói thành một số nguyên 17 bit ("mã ngoại hình") để gửi kèm tên khi vào hang và trong danh sách người chơi:
//   bit 0–3 đội (0–9, thứ tự như LOOK_TEAMS), bit 4–6 màu da (0–4), bit 7–8 kiểu tóc (0–3), bit 9–11 màu tóc (0–4),
//   bit 12–13 đồ trên mặt (0 không, 1 kính cận, 2 kính râm, 3 tai nghe), bit 14–15 đồ mang theo (0 không, 1 bình oxi, 2 gậy cổ vũ),
//   bit 16 phương tiện (0 đi bộ, 1 xe lăn). Mã 12 bit cũ (không phụ kiện) vẫn hợp lệ.
// Mã lạ/thiếu → ngoại hình mặc định (áo T1, da 0, tóc 0) nên client cũ không gửi mã vẫn vào bình thường.

/** Thứ tự đội khớp src/game/teams.ts (slug). */
export const LOOK_TEAMS = ['geng', 'hle', 't1', 'dk', 'kt', 'bnk', 'brion', 'ns', 'drx', 'soopers']
export const LOOK_LIMITS = { team: LOOK_TEAMS.length, skin: 5, hair: 4, hairColor: 5, face: 4, carry: 3, ride: 2 }
export const DEFAULT_LOOK = Object.freeze({ team: LOOK_TEAMS.indexOf('t1'), skin: 0, hair: 0, hairColor: 0, face: 0, carry: 0, ride: 0 })
const MAX_CODE = 0x1ffff

const inRange = (v, n) => Number.isInteger(v) && v >= 0 && v < n

/** Ngoại hình hợp lệ? */
export function isLook(look) {
  return typeof look === 'object' && look !== null && Object.keys(LOOK_LIMITS).every((key) => inRange(look[key], LOOK_LIMITS[key]))
}

/** Mã hoá; trường phụ kiện thiếu thì coi là "không có" (ngoại hình cũ chưa có phụ kiện). Ngoại hình sai → mặc định. */
export function encodeLook(look) {
  const full = typeof look === 'object' && look !== null ? { face: 0, carry: 0, ride: 0, ...look } : null
  const l = isLook(full) ? full : DEFAULT_LOOK
  return l.team | (l.skin << 4) | (l.hair << 7) | (l.hairColor << 9) | (l.face << 12) | (l.carry << 14) | (l.ride << 16)
}

export const DEFAULT_LOOK_CODE = encodeLook(DEFAULT_LOOK)

/** Giải mã; mã sai (không phải số nguyên 0–131071, hoặc trường vượt giới hạn) → ngoại hình mặc định. */
export function decodeLook(code) {
  if (!Number.isInteger(code) || code < 0 || code > MAX_CODE) return { ...DEFAULT_LOOK }
  const look = { team: code & 0xf, skin: (code >> 4) & 0x7, hair: (code >> 7) & 0x3, hairColor: (code >> 9) & 0x7, face: (code >> 12) & 0x3, carry: (code >> 14) & 0x3, ride: (code >> 16) & 0x1 }
  return isLook(look) ? look : { ...DEFAULT_LOOK }
}

/** Chuẩn hoá mã nhận từ mạng / bộ nhớ: luôn trả về một mã hợp lệ. */
export function normalizeLookCode(code) {
  return encodeLook(decodeLook(code))
}

/** Ngoại hình ngẫu nhiên. Phụ kiện ít gặp hơn (xe lăn ~1/5, đồ mang theo ~1/3) để đám đông không toàn người ngồi xe lăn. */
export function randomLook(random = Math.random) {
  const pick = (n) => Math.min(n - 1, Math.floor(random() * n))
  const face = random() < 0.5 ? 0 : 1 + pick(LOOK_LIMITS.face - 1)
  const carry = random() < 0.67 ? 0 : 1 + pick(LOOK_LIMITS.carry - 1)
  const ride = random() < 0.2 ? 1 : 0
  return { team: pick(LOOK_LIMITS.team), skin: pick(LOOK_LIMITS.skin), hair: pick(LOOK_LIMITS.hair), hairColor: pick(LOOK_LIMITS.hairColor), face, carry, ride }
}
