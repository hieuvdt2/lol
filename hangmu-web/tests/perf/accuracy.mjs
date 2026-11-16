// Đo độ lệch giữa vị trí người khác hiển thị trên máy người quan sát và vị trí thật, theo khoảng cách và chế độ lọc.
// Chạy: npm run perf:accuracy
import { sleep, startServer, until } from '../helpers/server.mjs'

const store = new Map()
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {}, pointerLockElement: null }
globalThis.window = globalThis
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}

const MODES = [
  { name: 'tắt lọc', env: { INTEREST: 'off' } },
  { name: 'lọc mặc định', env: { INTEREST: 'on' } },
  { name: 'lọc mạnh', env: { INTEREST: 'on', INTEREST_NEAR: '15', INTEREST_MID_EVERY: '10', INTEREST_FAR_EVERY: '30' } },
]
// Người quan sát đứng yên ở (0,36); mỗi người đi lại quanh một tâm ở khoảng cách khác nhau (đổi hướng mỗi 0,5–2 giây như người thật).
const CLASSES = [
  { name: 'gần (~10)', center: { x: 0, z: 26 } },
  { name: 'tầm trung (~36)', center: { x: 0, z: 0 } },
  { name: 'xa (~73)', center: { x: -10, z: -36 } },
]
const MEASURE_MS = Number(process.env.MEASURE_MS ?? 20000)
const percentile = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]
const rows = []

for (const mode of MODES) {
  const server = await startServer({ CAPACITY: '50', BOTS: '0', ...mode.env })
  globalThis.location = { protocol: 'http:', host: `127.0.0.1:${server.port}` }
  const { NetClient } = await import('../../src/game/net.ts')
  const clients = []
  const join = async (name, tab) => {
    store.set('hangmu.tab', tab)
    const c = new NetClient()
    clients.push(c)
    c.connect(name, null)
    await until(() => c.getState().phase === 'inCave', { label: `${name} vào hang` })
    return c
  }
  const observer = await join('Observer', 'acc-o')
  const movers = []
  for (const cls of CLASSES) {
    const c = await join(`Mover ${cls.name}`, `acc-${cls.name}`)
    movers.push({ cls, c, goal: { ...cls.center }, nextTurn: 0, errors: [] })
  }
  const timer = setInterval(() => {
    const now = Date.now()
    observer.frame(1 / 60, 0, 0, false)
    for (const m of movers) {
      if (now >= m.nextTurn) {
        const a = Math.random() * Math.PI * 2
        m.goal = { x: m.cls.center.x + Math.sin(a) * 6, z: m.cls.center.z + Math.cos(a) * 6 }
        m.nextTurn = now + 500 + Math.random() * 1500
      }
      const me = m.c.local
      const dx = m.goal.x - me.draw.x
      const dz = m.goal.z - me.draw.z
      const d = Math.hypot(dx, dz)
      // trước khi tới vùng của mình thì đi thẳng tới tâm
      const toCenter = Math.hypot(m.cls.center.x - me.draw.x, m.cls.center.z - me.draw.z) > 12
      const tx = toCenter ? m.cls.center.x - me.draw.x : dx
      const tz = toCenter ? m.cls.center.z - me.draw.z : dz
      const td = Math.hypot(tx, tz)
      m.c.frame(1 / 60, td > 0.5 ? tx / td : 0, td > 0.5 ? tz / td : 0, false)
      void d
    }
  }, 1000 / 60)
  await sleep(14000) // đi tới vị trí
  const sampler = setInterval(() => {
    for (const m of movers) {
      const seen = [...observer.actors.values()].find((a) => a.name === m.c.local.name)
      if (seen) m.errors.push(Math.hypot(seen.draw.x - m.c.local.draw.x, seen.draw.z - m.c.local.draw.z))
    }
  }, 100)
  await sleep(MEASURE_MS)
  clearInterval(sampler)
  clearInterval(timer)
  for (const m of movers) {
    const distance = Math.hypot(m.c.local.draw.x - observer.local.draw.x, m.c.local.draw.z - observer.local.draw.z)
    rows.push({
      'chế độ': mode.name, 'nhóm': m.cls.name, 'khoảng cách thật': Math.round(distance),
      'lệch TB': +(m.errors.reduce((a, b) => a + b, 0) / m.errors.length).toFixed(2),
      'lệch p95': +percentile(m.errors, 0.95).toFixed(2), 'lệch tối đa': +Math.max(...m.errors).toFixed(2),
    })
  }
  for (const c of clients) c.dispose()
  await server.stop()
}
console.table(rows)
