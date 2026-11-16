// Khởi động server game ở cổng trống để mỗi file test có phòng riêng.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

/** Chờ `fn()` trả giá trị truthy; ném lỗi kèm `label` nếu quá hạn. */
export async function until(fn, { timeout = 8000, every = 25, label = 'điều kiện' } = {}) {
  const end = Date.now() + timeout
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() > end) throw new Error(`Hết giờ chờ: ${label}`)
    await sleep(every)
  }
}

/** options.ready: 'log' (mặc định) chờ dòng khởi động trong log; 'http' chờ /healthz trả 200 (dùng khi LOG_LEVEL=error làm mất dòng khởi động). */
export async function startServer(env = {}, { ready = 'log' } = {}) {
  const port = await freePort()
  // Mỗi server một thư mục dữ liệu tạm (không ghi vào ./data của dự án, không lẫn trạng thái giữa các test).
  // Truyền DATA_DIR riêng để dùng chung giữa hai lần khởi động (kiểm thử lưu bền vững); khi đó helper không xóa nó.
  const ownsData = env.DATA_DIR === undefined
  const dataDir = env.DATA_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'hangmu-data-'))
  const child = spawn(process.execPath, ['server/hangmu-server.mjs'], {
    cwd: root,
    // Mặc định server chặn theo IP; test/perf mở hàng trăm kết nối từ localhost nên nới ở đây (test bảo vệ tự đặt lại).
    env: { ...process.env, PORT: String(port), CAPACITY: '50', BOTS: '2', STATIC_DIR: '', MAX_CONN_PER_IP: '0', CONN_RATE_PER_MIN: '0', EXIT_WITH_PARENT: '1',
      LOG_LEVEL: 'info', ADMIN_TOKEN: '', DATA_DIR: dataDir, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // Lưới an toàn thứ hai: bộ chạy test thoát (kể cả bằng --test-force-exit) thì giết server con.
  process.once('exit', () => child.kill())
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  if (ready === 'http') {
    await until(
      async () => {
        if (child.exitCode !== null) return true
        try {
          return (await fetch(`http://127.0.0.1:${port}/healthz`)).ok
        } catch {
          return false
        }
      },
      { label: 'server khởi động (http)' },
    )
  } else {
    await until(() => /hangmu room/.test(output) || child.exitCode !== null, { label: 'server khởi động' })
  }
  if (child.exitCode !== null) throw new Error(`Server thoát sớm:\n${output}`)
  return {
    pid: child.pid,
    port,
    dataDir,
    /** Toàn bộ đầu ra (stdout+stderr) của server tới thời điểm này; mỗi sự kiện log là một dòng JSON. */
    output: () => output,
    url: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    /** Gửi tín hiệu (mặc định SIGTERM = tắt êm) và chờ tiến trình thoát. Trả về { code, signal }. */
    stop: (signal = 'SIGTERM') =>
      new Promise((resolve) => {
        const cleanup = () => {
          if (ownsData) fs.rmSync(dataDir, { recursive: true, force: true })
        }
        if (child.exitCode !== null) {
          cleanup()
          return resolve({ code: child.exitCode, signal: null })
        }
        child.once('exit', (code, sig) => {
          cleanup()
          resolve({ code, signal: sig })
        })
        child.kill(signal)
      }),
    exited: () => child.exitCode !== null,
  }
}
