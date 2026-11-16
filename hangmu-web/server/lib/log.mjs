// Log JSON một dòng mỗi sự kiện. LOG_LEVEL=error|info|debug (mặc định info).
// Nội dung chat KHÔNG được ghi trừ khi đặt LOG_CHAT=1 (và mức debug): chat là dữ liệu riêng tư của người chơi.
const LEVELS = { error: 0, info: 1, debug: 2 }

export function createLogger(level = 'info', write = (line) => process.stdout.write(`${line}\n`)) {
  const max = LEVELS[level] ?? LEVELS.info
  const emit = (name, msg, fields) => {
    if (LEVELS[name] > max) return
    // Các khóa cố định đặt sau cùng để trường tùy ý không ghi đè `level`/`msg`.
    write(JSON.stringify({ ...fields, time: new Date().toISOString(), level: name, msg }))
  }
  return {
    level: Object.hasOwn(LEVELS, level) ? level : 'info',
    error: (msg, fields) => emit('error', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    debug: (msg, fields) => emit('debug', msg, fields),
  }
}
