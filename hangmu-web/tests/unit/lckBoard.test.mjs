// Bảng xếp hạng LCK trên vách: vẽ đủ 10 đội, hạng 1–10, vé quốc tế và tô riêng đội của hang.
import test from 'node:test'
import assert from 'node:assert/strict'
import { BOARD_H, BOARD_W, HOME_TEAM, drawLckBoard } from '../../src/game/lckBoard.ts'
import { LCK_TEAMS } from '../../src/game/teams.ts'

function fakeContext() {
  const texts = []
  const fills = []
  const target = {
    measureText: (t) => ({ width: String(t).length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillText: (text) => texts.push(String(text)),
    fill() { fills.push(this.fillStyle) },
    fillRect() {},
    strokeRect() {},
    stroke() {},
    beginPath() {},
    roundRect() {},
  }
  return { ctx: target, texts, fills }
}

test('bảng vẽ đủ 10 đội, hạng 1–10 và dòng vé quốc tế, không còn chữ bóng đá', () => {
  const { ctx, texts } = fakeContext()
  drawLckBoard(ctx)
  for (const t of LCK_TEAMS) {
    assert.ok(texts.includes(t.name), `thiếu ${t.name}`)
    assert.ok(texts.includes(String(t.rank)), `thiếu hạng ${t.rank}`)
  }
  assert.equal(texts.filter((x) => x.startsWith('Vé ')).length, 7)
  assert.equal(texts.filter((x) => x === 'Không có vé quốc tế').length, 3)
  assert.ok(texts.some((x) => /LCK/.test(x)))
  assert.ok(!texts.some((x) => /\bMU\b|bàn thắng|⚽|ESPN|HANG MU/.test(x)), texts.join('|'))
})

test('đội của hang là T1 và chỉ đúng một dòng được tô nổi', () => {
  assert.equal(HOME_TEAM, 'T1')
  assert.ok(LCK_TEAMS.some((t) => t.name === HOME_TEAM))
  const { ctx, fills } = fakeContext()
  drawLckBoard(ctx)
  assert.equal(fills.filter((f) => f === 'rgba(217,58,74,0.28)').length, 1)
})

test('kích thước bảng 16:9', () => {
  assert.equal(BOARD_W / BOARD_H, 16 / 9)
})
