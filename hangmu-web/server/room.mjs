import { WebSocketServer } from 'ws'

const PORT = 8787
const TICK_HZ = 30
const POS_SCALE = 256
const CAPACITY = 500
const REPLIES = ['Glory glory!', 'Vào đây ngồi với anh em.', 'Trận sau mình gỡ.', 'Đứng gần lửa cho ấm.']

const BOTS = [
  ['Ca Dic', 4],
  ['Bủ Nô', 8],
  ['Đa Lọt', 5],
  ['Mắc Gai', 3],
  ['Licha', 6],
  ['Lam Men', 1],
  ['A Mát', 11],
  ['Sét Cô', 7],
]

const players = new Map()
let nextIndex = 1
let serverTick = 0

function headingByte(rad) {
  return (Math.round((rad / (Math.PI * 2)) * 256) % 256 + 256) % 256
}

function scale(value) {
  return Math.max(-32768, Math.min(32767, Math.round(value * POS_SCALE)))
}

function packWelcome(list) {
  const buffer = Buffer.alloc(3 + list.length * 8)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  view.setUint8(0, 128)
  view.setUint16(1, list.length, true)
  list.forEach((player, index) => {
    const offset = 3 + index * 8
    view.setUint16(offset, player.index, true)
    view.setInt16(offset + 2, scale(player.x), true)
    view.setInt16(offset + 4, scale(player.z), true)
    view.setUint8(offset + 6, player.heading)
    view.setUint8(offset + 7, 0)
  })
  return buffer
}

function packMoves(records) {
  const buffer = Buffer.alloc(5 + records.length * 10)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  view.setUint8(0, 129)
  view.setUint16(1, serverTick & 65535, true)
  view.setUint16(3, records.length, true)
  records.forEach((player, index) => {
    const offset = 5 + index * 10
    view.setUint16(offset, player.index, true)
    view.setUint16(offset + 2, serverTick & 65535, true)
    view.setInt16(offset + 4, scale(player.x), true)
    view.setInt16(offset + 6, scale(player.z), true)
    view.setUint8(offset + 8, player.heading)
    view.setUint8(offset + 9, 0)
  })
  return buffer
}

function packPong(clientTime) {
  const buffer = Buffer.alloc(7)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  view.setUint8(0, 131)
  view.setUint32(1, clientTime >>> 0, true)
  view.setUint16(5, serverTick & 65535, true)
  return buffer
}

function roster() {
  return [...players.values()].map((player) => ({
    i: player.index,
    name: player.name,
    n: player.number,
    b: player.bot,
    x: player.x,
    z: player.z,
    heading: player.heading,
  }))
}

function send(ws, value) {
  if (ws.readyState === ws.OPEN) ws.send(value)
}

function broadcast(value, except) {
  for (const player of players.values()) {
    if (player.bot || player.ws === except) continue
    send(player.ws, value)
  }
}

function broadcastJson(message, except) {
  broadcast(JSON.stringify(message), except)
}

function addPlayer(fields) {
  const index = nextIndex
  nextIndex += 1
  const player = { index, heading: headingByte(Math.PI), dirty: true, ...fields }
  players.set(index, player)
  return player
}

function removePlayer(index) {
  if (!players.delete(index)) return
  broadcastJson({ t: 'leave', i: index })
}

function wanderGoal() {
  const angle = Math.random() * Math.PI * 2
  const radius = 8 + Math.random() * 28
  return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius }
}

for (const [name, number] of BOTS) {
  const spot = wanderGoal()
  const goal = wanderGoal()
  addPlayer({
    name,
    number,
    bot: true,
    ws: null,
    x: spot.x,
    z: spot.z,
    goalX: goal.x,
    goalZ: goal.z,
    wait: Math.random() * 2,
  })
}

function stepBots(dt) {
  for (const bot of players.values()) {
    if (!bot.bot) continue
    const dx = bot.goalX - bot.x
    const dz = bot.goalZ - bot.z
    const distance = Math.hypot(dx, dz)
    if (bot.wait > 0) {
      bot.wait -= dt
      continue
    }
    if (distance < 1.2) {
      const next = wanderGoal()
      bot.goalX = next.x
      bot.goalZ = next.z
      bot.wait = 1 + Math.random() * 3
      continue
    }
    const speed = 3.2 * dt
    bot.x += (dx / distance) * speed
    bot.z += (dz / distance) * speed
    bot.heading = headingByte(Math.atan2(dx, dz))
    bot.dirty = true
  }
}

setInterval(() => {
  serverTick = (serverTick + 1) & 65535
  stepBots(1 / TICK_HZ)
  if (serverTick % 3 !== 0) return
  const moving = [...players.values()].filter((player) => player.dirty)
  if (moving.length === 0) return
  const packet = packMoves(moving)
  for (const player of moving) player.dirty = false
  broadcast(packet)
}, 1000 / TICK_HZ)

const server = new WebSocketServer({ port: PORT })
server.on('connection', (ws) => {
  let self = null
  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      let message
      try {
        message = JSON.parse(data.toString())
      } catch {
        return
      }
      if (message.t === 'enter' && !self) {
        const name = typeof message.name === 'string' ? message.name.trim() : ''
        if ([...name].length < 1 || [...name].length > 30) {
          send(ws, JSON.stringify({ t: 'rejected', reason: 'invalid_name' }))
          ws.close()
          return
        }
        const number = Number.isInteger(message.number) && message.number >= 1 && message.number <= 99 ? message.number : null
        self = addPlayer({ name, number, bot: false, ws, x: 0, z: 36, heading: headingByte(Math.PI), dirty: true })
        send(ws, JSON.stringify({
          t: 'admitted',
          selfIndex: self.index,
          tickHz: TICK_HZ,
          serverTick,
          capacity: CAPACITY,
          roster: roster(),
        }))
        send(ws, packWelcome([...players.values()]))
        broadcastJson({ t: 'join', i: self.index, name: self.name, n: self.number, x: self.x, z: self.z, b: false, heading: self.heading }, ws)
        const greeter = [...players.values()].find((player) => player.bot)
        if (greeter) {
          broadcastJson({ t: 'chat', m: [[greeter.index, 'Chào anh em vừa vào hang.']] })
        }
        return
      }
      if (!self) return
      if (message.t === 'chat' && typeof message.text === 'string') {
        const text = message.text.trim().slice(0, 200)
        if (!text) return
        send(ws, JSON.stringify({ t: 'chatAck', id: message.id, text }))
        broadcastJson({ t: 'chat', m: [[self.index, text]] }, ws)
        const near = [...players.values()].find((player) => player.bot && Math.hypot(player.x - self.x, player.z - self.z) < 10)
        if (near) {
          const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)]
          setTimeout(() => {
            if (players.has(near.index)) broadcastJson({ t: 'chat', m: [[near.index, reply]] })
          }, 700)
        }
        return
      }
      if (message.t === 'punch' && Number.isInteger(message.target)) {
        const target = players.get(message.target)
        if (!target) return
        if (Math.hypot(target.x - self.x, target.z - self.z) > 3) return
        send(ws, JSON.stringify({ t: 'punchHit', target: target.index, text: `đã 👊 ${target.name}` }))
        if (!target.bot && target.ws) send(target.ws, JSON.stringify({ t: 'punched', by: self.index }))
      }
      if (message.t === 'leave') {
        removePlayer(self.index)
        self = null
        ws.close()
      }
      return
    }
    if (!self || data.length < 1) return
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const op = view.getUint8(0)
    if (op === 1 && data.length >= 9) {
      self.x = view.getInt16(1, true) / POS_SCALE
      self.z = view.getInt16(3, true) / POS_SCALE
      self.heading = view.getUint8(5)
      self.dirty = true
      return
    }
    if (op === 2 && data.length >= 5) send(ws, packPong(view.getUint32(1, true)))
  })
  ws.on('close', () => {
    if (self) removePlayer(self.index)
  })
})

server.on('listening', () => {
  console.log(`room ws://127.0.0.1:${PORT}/ws`)
})
