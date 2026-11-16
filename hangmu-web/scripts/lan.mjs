// Build bản production rồi phục vụ cả web lẫn socket trên mạng LAN để thử bằng điện thoại thật.
//   npm run lan                  build + chạy ở cổng 8790
//   npm run lan -- --no-build    dùng lại dist/ đã build
//   PORT=9000 BOTS=0 npm run lan
import { spawn, spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = process.env.PORT ?? '8790'

if (!process.argv.includes('--no-build')) {
  console.log('Đang build bản production…')
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const server = spawn(process.execPath, ['server/hangmu-server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: port, STATIC_DIR: path.join(root, 'dist'), CAPACITY: process.env.CAPACITY ?? '500', BOTS: process.env.BOTS ?? '8',
    // Thử trong mạng nội bộ (và `npm run crowd` mở hàng trăm kết nối từ một máy): nới giới hạn theo IP. Triển khai thật thì để mặc định của server.
    MAX_CONN_PER_IP: process.env.MAX_CONN_PER_IP ?? '0', CONN_RATE_PER_MIN: process.env.CONN_RATE_PER_MIN ?? '0' },
  stdio: 'inherit',
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill())
server.on('exit', (code) => process.exit(code ?? 0))

const addresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a.address)

console.log('\nMở trên điện thoại (cùng Wi-Fi với máy này):')
for (const ip of addresses) {
  console.log(`  http://${ip}:${port}/            chơi bình thường`)
  console.log(`  http://${ip}:${port}/?debug=1    kèm bảng thông số FPS / ping`)
}
if (addresses.length === 0) console.log('  (không thấy địa chỉ mạng LAN; kiểm tra Wi-Fi)')
console.log('\nNhấn Ctrl+C để dừng.\n')
