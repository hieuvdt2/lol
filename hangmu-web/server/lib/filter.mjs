// Lọc nội dung chat: che từ thô tục và (trong chat riêng) che đường link + số điện thoại.
// Điều khoản gốc: "Từ ngữ thô tục được lọc tự động"; "Đường link và số điện thoại trong tin riêng bị che để chống lừa đảo".
// [Unverified] Danh sách từ và quy tắc cụ thể của bản gốc không có trong capture; đây là danh sách tối thiểu tự lập, dễ mở rộng.
// Nguyên tắc: thà bỏ sót còn hơn che nhầm từ bình thường — từ dễ trùng với từ thường ("các" khi bỏ dấu thành "cac") chỉ khớp
// khi giữ nguyên dấu; chỉ các viết tắt không dấu rõ ràng (dmm, vcl...) mới khớp ở dạng không dấu. Khớp theo từng từ nguyên vẹn.

/** Từ khớp đúng ở dạng viết thường, CÓ dấu (NFC). */
const WITH_MARKS = new Set(['địt', 'đụ', 'lồn', 'cặc', 'buồi', 'đéo', 'đĩ', 'cứt', 'đm', 'đmm', 'đkm', 'đcm', 'đjt', 'đit'])
/** Viết tắt / dạng gõ không dấu rõ ràng là chửi; chỉ khớp khi cả từ không có dấu. Cố ý bỏ các từ hay trùng nghĩa thường (dm, cc, lol...). */
const PLAIN = new Set(['dmm', 'dkm', 'dcm', 'djt', 'dit', 'vcl', 'vkl', 'vcc', 'cmm', 'clm', 'vlon', 'vloz', 'ditme', 'ditmemay', 'dume', 'dumemay', 'dmcs'])

const stripMarks = (s) => s.normalize('NFD').replace(/\p{M}+/gu, '').replace(/đ/g, 'd')
/** Gộp ký tự lặp: "địttt" → "địt", "vclll" → "vcl". */
const collapse = (s) => s.replace(/(.)\1+/gu, '$1')
/** Rút mọi chuỗi ký tự lặp xuống tối đa 2: "dmmmmm" → "dmm" (giữ được các từ vốn có hai chữ giống nhau). */
const limitRuns = (s) => s.replace(/(.)\1{2,}/gu, '$1$1')

function isProfane(token) {
  const lower = token.normalize('NFC').toLowerCase()
  const forms = [lower, limitRuns(lower), collapse(lower)]
  if (forms.some((f) => WITH_MARKS.has(f))) return true
  // dạng không dấu: toàn từ không có dấu/đ (nếu có dấu thì "các", "dì"... không bị nhầm)
  return stripMarks(lower) === lower && forms.some((f) => PLAIN.has(f))
}

/** Che từ thô tục bằng dấu '*' cùng độ dài. */
export function maskProfanity(text) {
  return text.replace(/[\p{L}\p{M}]+/gu, (token) => (isProfane(token) ? '*'.repeat(Array.from(token).length) : token))
}

const URL_RE = /(?:https?:\/\/|www\.|t\.me\/|zalo\.me\/|fb\.com\/|bit\.ly\/)\S*|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|vn|io|me|co|xyz|info|biz|app|gg|tv|cc|top|site|online|link|club|shop|store)\b(?:\/\S*)?/giu
// Số điện thoại: +84 / 84 / 0 rồi 8–10 chữ số có thể cách nhau bằng khoảng trắng, chấm, gạch; hoặc một dãy ≥ 8 chữ số bất kỳ.
const PHONE_RE = /(?:\+?84|0)(?:[\s.-]?\d){8,10}|\d(?:[\s.-]?\d){7,}/gu

/** Che link và số điện thoại (dùng cho chat riêng). */
export function maskLinksAndPhones(text) {
  const star = (m) => m.replace(/[^\s]/gu, '*')
  return text.replace(URL_RE, star).replace(PHONE_RE, star)
}

/** Chat chung: chỉ che từ thô tục. */
export const filterChat = (text) => maskProfanity(text)
/** Chat riêng: che từ thô tục + link + số điện thoại. */
export const filterDm = (text) => maskLinksAndPhones(maskProfanity(text))
