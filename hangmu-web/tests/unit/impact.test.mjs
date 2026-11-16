import test from 'node:test'
import assert from 'node:assert/strict'
import { IMPACT_DURATION, impactFrame } from '../../src/game/impact.ts'
import { Gait, HIT_DURATION, KNOCK_SCALE } from '../../src/game/gait.ts'

const DT = 1 / 60
const idle = { speed: 0, turnRate: 0, accel: 0 }

test('impactFrame: nở ra rồi mờ dần, về 0 khi hết; đòn trúng to hơn vệt gió', () => {
  for (const kind of ['hit', 'miss']) {
    const life = IMPACT_DURATION[kind]
    assert.deepEqual(impactFrame(kind, -0.01), { scale: 0, opacity: 0 })
    assert.deepEqual(impactFrame(kind, life), { scale: 0, opacity: 0 })
    assert.deepEqual(impactFrame(kind, Number.NaN), { scale: 0, opacity: 0 })
    let prev = impactFrame(kind, 0)
    assert.ok(prev.opacity > 0.5 && prev.scale > 0.5, `${kind}: thấy ngay từ đầu`)
    for (let t = 0.005; t < life; t += 0.005) {
      const f = impactFrame(kind, t)
      assert.ok(f.scale >= prev.scale - 1e-9, `${kind}: kích thước không co lại`)
      assert.ok(f.opacity <= prev.opacity + 1e-9, `${kind}: độ mờ không tăng lại`)
      prev = f
    }
  }
  assert.ok(impactFrame('hit', 0.2).scale > impactFrame('miss', 0.2).scale)
})

test('lunge/knock: người đấm xô tới (trúng ít hơn hụt), người bị đấm từ trước bị hất lùi, từ sau bị đẩy tới; về 0 khi hết', () => {
  const peak = (g, key, sign, frames = 90) => {
    let best = 0
    for (let i = 0; i < frames; i += 1) {
      g.update(DT, idle)
      best = Math.max(best, sign * g[key])
    }
    return best
  }
  const hit = new Gait(0); hit.punch('hit')
  const miss = new Gait(0); miss.punch('miss')
  const lungeHit = peak(hit, 'lunge', 1)
  const lungeMiss = peak(miss, 'lunge', 1)
  assert.ok(lungeHit > 0.3, `đòn trúng xô tới ${lungeHit.toFixed(2)} m`)
  assert.ok(lungeMiss > lungeHit + 0.1, `đòn hụt lố hơn: ${lungeMiss.toFixed(2)} so với ${lungeHit.toFixed(2)}`)
  assert.ok(Math.abs(hit.lunge) < 1e-3, 'hết đòn thì về 0')
  const front = new Gait(0); front.hit(1, 0)
  const back = new Gait(0); back.hit(-1, 0)
  assert.ok(peak(front, 'knock', -1, 60) > 0.25, 'từ trước: hất lùi')
  assert.ok(peak(back, 'knock', 1, 60) > 0.25, 'từ sau: đẩy tới')
  assert.ok(Math.abs(front.knock) < 1e-6 && HIT_DURATION < 1.5 && KNOCK_SCALE > 0, 'hết thì về 0')
  const idleG = new Gait(0)
  for (let i = 0; i < 30; i += 1) idleG.update(DT, idle)
  assert.equal(idleG.lunge, 0)
  assert.equal(idleG.knock === 0 || Object.is(idleG.knock, -0), true)
})
