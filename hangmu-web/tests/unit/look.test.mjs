// Mã ngoại hình (shared/look.mjs): mã hoá/giải mã đủ mọi tổ hợp, mã lạ → mặc định (áo T1), khớp danh sách đội và bảng màu áo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LOOK, DEFAULT_LOOK_CODE, LOOK_LIMITS, LOOK_TEAMS, decodeLook, encodeLook, isLook, normalizeLookCode, randomLook } from '../../shared/look.mjs'
import { LCK_TEAMS } from '../../src/game/teams.ts'
import { HAIR_COLORS, HAIR_STYLE_NAMES, SKIN_TONES, TEAM_KITS } from '../../src/game/kits.ts'

test('mọi tổ hợp mã hoá rồi giải mã ra đúng, mã khác nhau, nằm trong 17 bit', () => {
  const seen = new Set()
  for (let team = 0; team < LOOK_LIMITS.team; team += 1)
    for (let skin = 0; skin < LOOK_LIMITS.skin; skin += 1)
      for (let hair = 0; hair < LOOK_LIMITS.hair; hair += 1)
        for (let hairColor = 0; hairColor < LOOK_LIMITS.hairColor; hairColor += 1)
          for (let face = 0; face < LOOK_LIMITS.face; face += 1)
            for (let carry = 0; carry < LOOK_LIMITS.carry; carry += 1)
              for (let ride = 0; ride < LOOK_LIMITS.ride; ride += 1) {
          const look = { team, skin, hair, hairColor, face, carry, ride }
          const code = encodeLook(look)
          assert.ok(Number.isInteger(code) && code >= 0 && code <= 0x1ffff)
          assert.deepEqual(decodeLook(code), look)
          assert.equal(normalizeLookCode(code), code)
          seen.add(code)
        }
  assert.equal(seen.size, Object.values(LOOK_LIMITS).reduce((a, b) => a * b, 1))
  // mã 12 bit cũ (chưa có phụ kiện) vẫn giải mã được, phụ kiện = không
  assert.deepEqual(decodeLook(6 | (3 << 4) | (2 << 7) | (4 << 9)), { team: 6, skin: 3, hair: 2, hairColor: 4, face: 0, carry: 0, ride: 0 })
})

test('mặc định là áo T1; mã lạ / thiếu / vượt giới hạn đều về mặc định', () => {
  assert.equal(LOOK_TEAMS[DEFAULT_LOOK.team], 't1')
  assert.deepEqual(decodeLook(DEFAULT_LOOK_CODE), { ...DEFAULT_LOOK })
  for (const bad of [undefined, null, '5', -1, 1.5, NaN, {}, [], 15, 10, (7 << 9) | 2, (6 << 4) | 2, 0x20000, (3 << 14) | 2]) {
    assert.equal(normalizeLookCode(bad), DEFAULT_LOOK_CODE, `mã ${JSON.stringify(bad)}`)
  }
  assert.equal(encodeLook({ team: 99, skin: 0, hair: 0, hairColor: 0, face: 0, carry: 0, ride: 0 }), DEFAULT_LOOK_CODE, 'ngoại hình sai khi mã hoá cũng về mặc định')
  assert.equal(isLook({ team: 0, skin: 0, hair: 0 }), false)
})

test('ngẫu nhiên luôn hợp lệ và phủ đủ các lựa chọn', () => {
  let seed = 7
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const teams = new Set()
  let rides = 0
  for (let i = 0; i < 2000; i += 1) {
    const look = randomLook(rnd)
    assert.ok(isLook(look))
    teams.add(look.team)
    rides += look.ride
  }
  assert.equal(teams.size, LOOK_LIMITS.team)
  assert.ok(rides > 200 && rides < 700, `xe lăn ít gặp hơn: ${rides}/2000`)
  assert.ok(isLook(randomLook(() => 0.9999999)))
})

test('danh sách đội khớp teams.ts; đủ màu áo, màu da, kiểu tóc, màu tóc cho mọi lựa chọn', () => {
  assert.deepEqual(LOOK_TEAMS, LCK_TEAMS.map((t) => t.slug))
  assert.equal(TEAM_KITS.length, LOOK_LIMITS.team)
  for (const kit of TEAM_KITS) for (const c of [kit.base, kit.accent, kit.trim, kit.far]) assert.match(c, /^#[0-9a-f]{6}$/i)
  assert.equal(SKIN_TONES.length, LOOK_LIMITS.skin)
  assert.equal(HAIR_STYLE_NAMES.length, LOOK_LIMITS.hair)
  assert.equal(HAIR_COLORS.length, LOOK_LIMITS.hairColor)
  // áo T1 giữ đúng màu cũ (người chơi không thấy nhân vật mặc định đổi khác)
  assert.deepEqual([TEAM_KITS[2].base, TEAM_KITS[2].accent], ['#17171d', '#e2102c'])
})
