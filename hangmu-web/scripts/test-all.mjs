// Chạy từng file test trong một tiến trình riêng và cộng kết quả.
// Lý do: `node --test --test-force-exit` với nhiều file có thể cắt đầu ra khi tiến trình thoát, làm tổng số test bị đếm hụt
// ngẫu nhiên (đã gặp: 238–250 cho cùng một bộ test). Chạy riêng từng file cho số liệu chính xác và lỗi chỉ rõ file nào.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dirs = ['tests/unit', 'tests/server', 'tests/client']
const files = dirs.flatMap((d) => fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `${d}/${f}`))
const only = process.argv.slice(2)
const queue = only.length ? files.filter((f) => only.some((o) => f.includes(o))) : files
const CONCURRENCY = Number(process.env.TEST_CONCURRENCY || 3)

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', '--test-timeout=120000', '--experimental-strip-types', '--no-warnings', file], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (out += c))
    const timer = setTimeout(() => child.kill('SIGKILL'), 300_000) // lưới an toàn: file treo thì giết
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      const num = (name) => Number(new RegExp(`^# ${name} (\\d+)`, 'm').exec(out)?.[1] ?? NaN)
      resolve({ file, code, signal, tests: num('tests'), pass: num('pass'), fail: num('fail'), out })
    })
  })
}

const results = []
let next = 0
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  while (next < queue.length) {
    const file = queue[next++]
    const r = await run(file)
    results.push(r)
    const ok = r.code === 0 && r.fail === 0 && r.tests > 0
    console.log(`${ok ? 'ok    ' : 'FAIL  '} ${file.padEnd(40)} ${Number.isNaN(r.tests) ? 'không có kết quả' : `${r.pass}/${r.tests}`}`)
  }
}))

let tests = 0
let pass = 0
const bad = results.filter((r) => !(r.code === 0 && r.fail === 0 && r.tests > 0))
for (const r of results) {
  tests += Number.isNaN(r.tests) ? 0 : r.tests
  pass += Number.isNaN(r.pass) ? 0 : r.pass
}
for (const r of bad) console.log(`\n===== ${r.file} (mã thoát ${r.code}${r.signal ? `, tín hiệu ${r.signal}` : ''}) =====\n${r.out.split('\n').filter((l) => /not ok|error:|expected|actual|Hết giờ/.test(l)).slice(0, 30).join('\n')}`)
console.log(`\n# tests ${tests}\n# pass ${pass}\n# fail ${tests - pass}\n# files ${results.length}, lỗi ${bad.length}`)
process.exit(bad.length === 0 ? 0 : 1)
