import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OP, byteToHeading, decodeBinary, decodeDir, encodeDir, encodeMove, encodePing, headingToByte, sanitizeChat, tickDiff,
} from '../../src/game/protocol.ts'
import { MOVE_SPEED, SIM_DT, SPAWN_X, SPAWN_Z, WALK_RADIUS, makeBody, stepSim } from '../../src/game/sim.ts'

test('encodeMove đóng gói đúng 9 byte little-endian', () => {
  const view = new DataView(encodeMove(1.5, -2, headingToByte(Math.PI), 0b11100001, 70000))
  assert.equal(view.byteLength, 9)
  assert.equal(view.getUint8(0), OP.MOVE)
  assert.equal(view.getInt16(1, true), 384) // 1.5 * 256
  assert.equal(view.getInt16(3, true), -512)
  assert.equal(view.getUint8(5), 128)
  assert.equal(view.getUint8(6), 0b11100001)
  assert.equal(view.getUint16(7, true), 70000 & 65535)
})

test('encodePing đóng gói op 2 + uint32', () => {
  const view = new DataView(encodePing(12345))
  assert.equal(view.getUint8(0), OP.PING)
  assert.equal(view.getUint32(1, true), 12345)
})

test('hướng đi: encode rồi decode khôi phục gần đúng, 0 là đứng yên', () => {
  assert.equal(encodeDir(0, 0), 0)
  const out = { mx: 0, mz: 0 }
  for (const [mx, mz] of [[0, 1], [1, 0], [0, -1], [-1, 0], [0.7, 0.7]]) {
    decodeDir(encodeDir(mx, mz), out)
    const len = Math.hypot(mx, mz) > 1 ? Math.hypot(mx, mz) : 1
    assert.ok(Math.abs(out.mx - mx / len) < 0.12 && Math.abs(out.mz - mz / len) < 0.12, `${mx},${mz} -> ${out.mx},${out.mz}`)
  }
  decodeDir(0, out)
  assert.deepEqual(out, { mx: 0, mz: 0 })
})

test('heading <-> byte quay vòng đúng', () => {
  assert.equal(headingToByte(0), 0)
  assert.equal(headingToByte(Math.PI), 128)
  assert.equal(headingToByte(-Math.PI / 2), 192)
  assert.ok(Math.abs(byteToHeading(192) - -Math.PI / 2) < 1e-9)
})

test('decodeBinary: welcome, moves, correction, pong', () => {
  const welcome = Buffer.alloc(3 + 8)
  welcome.writeUInt8(OP.WELCOME, 0)
  welcome.writeUInt16LE(1, 1)
  welcome.writeUInt16LE(7, 3)
  welcome.writeInt16LE(256, 5)
  welcome.writeInt16LE(-256, 7)
  welcome.writeUInt8(64, 9)
  welcome.writeUInt8(33, 10)
  const w = decodeBinary(new Uint8Array(welcome).buffer)
  assert.deepEqual(w, { op: 'welcome', entries: [{ index: 7, x: 1, z: -1, heading: 64, dir: 33 }] })

  const moves = Buffer.alloc(5 + 10)
  moves.writeUInt8(OP.MOVES, 0)
  moves.writeUInt16LE(500, 1)
  moves.writeUInt16LE(1, 3)
  moves.writeUInt16LE(9, 5)
  moves.writeUInt16LE(499, 7)
  moves.writeInt16LE(512, 9)
  moves.writeInt16LE(0, 11)
  moves.writeUInt8(10, 13)
  moves.writeUInt8(20, 14)
  assert.deepEqual(decodeBinary(new Uint8Array(moves).buffer), {
    op: 'moves', serverTick: 500, records: [{ index: 9, tick: 499, x: 2, z: 0, heading: 10, dir: 20 }],
  })

  const corr = Buffer.alloc(5)
  corr.writeUInt8(OP.CORRECTION, 0)
  corr.writeInt16LE(-128, 1)
  corr.writeInt16LE(384, 3)
  assert.deepEqual(decodeBinary(new Uint8Array(corr).buffer), { op: 'correction', x: -0.5, z: 1.5 })

  const pong = Buffer.alloc(7)
  pong.writeUInt8(OP.PONG, 0)
  pong.writeUInt32LE(99, 1)
  pong.writeUInt16LE(1234, 5)
  assert.deepEqual(decodeBinary(new Uint8Array(pong).buffer), { op: 'pong', clientTime: 99, serverTick: 1234 })
})

test('decodeBinary bỏ qua dữ liệu lạ hoặc cụt', () => {
  assert.equal(decodeBinary(new ArrayBuffer(0)), null)
  assert.equal(decodeBinary(new Uint8Array([200, 1, 2]).buffer), null)
  assert.equal(decodeBinary(new Uint8Array([OP.MOVES, 0, 0, 5, 0]).buffer), null) // khai báo 5 bản ghi nhưng không có dữ liệu
})

test('tickDiff có dấu và quấn quanh 16 bit', () => {
  assert.equal(tickDiff(10, 5), 5)
  assert.equal(tickDiff(5, 10), -5)
  assert.equal(tickDiff(2, 65534), 4)
  assert.equal(tickDiff(65534, 2), -4)
})

test('sanitizeChat loại ký tự ẩn, gộp khoảng trắng, cắt độ dài', () => {
  assert.equal(sanitizeChat('  Glory ​  glory\n\t!  '), 'Glory glory !')
  assert.equal(sanitizeChat('​​'), '')
  assert.equal(Array.from(sanitizeChat('x'.repeat(500))).length, 200)
  assert.equal(sanitizeChat('a'.repeat(10), 4), 'aaaa')
})

test('mô phỏng: tốc độ tối đa, dừng lại, và giới hạn vòng đi bộ', () => {
  const body = makeBody(SPAWN_X, SPAWN_Z, 0)
  for (let i = 0; i < 60; i += 1) stepSim(body, { mx: 0, mz: 1 })
  assert.ok(Math.hypot(body.vx, body.vz) <= MOVE_SPEED + 0.01, 'không vượt moveSpeed')
  assert.ok(Math.hypot(body.x, body.z) <= WALK_RADIUS + 1e-6, 'không ra khỏi vòng đi bộ')
  for (let i = 0; i < 60; i += 1) stepSim(body, { mx: 0, mz: 0 })
  assert.equal(Math.hypot(body.vx, body.vz), 0, 'đứng yên khi hết input')

  const walker = makeBody(0, 20, 0)
  for (let i = 0; i < 300; i += 1) stepSim(walker, { mx: 0, mz: -1 }) // đi thẳng vào đống lửa
  assert.ok(Math.hypot(walker.x, walker.z) >= 2.64, 'bị đống lửa chặn')

  const one = makeBody(0, 20, 0)
  stepSim(one, { mx: 0, mz: 1 }, SIM_DT)
  assert.ok(Math.hypot(one.x, one.z - 20) < 0.5, 'một bước không dịch chuyển đột ngột')
})
