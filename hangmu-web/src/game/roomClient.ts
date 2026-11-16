export interface RosterEntry {
  index: number
  name: string
  number: number | null
  bot: boolean
  x: number
  z: number
  heading: number
}

export interface MoveRecord {
  index: number
  x: number
  z: number
  heading: number
}

export interface RoomEvents {
  onAdmitted: (selfIndex: number, roster: RosterEntry[]) => void
  onJoin: (player: RosterEntry) => void
  onLeave: (index: number) => void
  onMoves: (records: MoveRecord[]) => void
  onChat: (index: number, text: string) => void
  onError: (message: string) => void
}

export interface RoomLink {
  sendMove: (x: number, z: number, heading: number) => void
  sendChat: (text: string) => void
  sendPunch: (target: number) => void
  close: () => void
}

const POS_SCALE = 256

export function connectRoom(name: string, number: number | null, events: RoomEvents): RoomLink {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const socket = new WebSocket(`${protocol}://${location.host}/ws`)
  socket.binaryType = 'arraybuffer'
  let selfIndex = -1
  let chatSeq = 0
  let closed = false

  socket.onopen = () => {
    socket.send(JSON.stringify({ t: 'enter', name, ...(number === null ? {} : { number }) }))
  }
  socket.onerror = () => events.onError('Không vào được hang. Phòng socket chưa chạy.')
  socket.onclose = () => {
    if (!closed) events.onError('Mất kết nối với hang.')
  }
  socket.onmessage = (event) => {
    if (typeof event.data === 'string') {
      const message = JSON.parse(event.data) as Record<string, unknown>
      if (message.t === 'admitted' && Array.isArray(message.roster)) {
        selfIndex = Number(message.selfIndex)
        events.onAdmitted(selfIndex, message.roster.map(readRoster))
      } else if (message.t === 'join') {
        events.onJoin(readRoster(message))
      } else if (message.t === 'leave') {
        events.onLeave(Number(message.i))
      } else if (message.t === 'chat' && Array.isArray(message.m)) {
        for (const row of message.m) {
          if (Array.isArray(row)) events.onChat(Number(row[0]), String(row[1]))
        }
      } else if (message.t === 'rejected') {
        events.onError('Tên không hợp lệ (1–30 ký tự).')
      }
      return
    }
    const records = readMoves(event.data)
    if (records) events.onMoves(records)
  }

  return {
    sendMove(x, z, heading) {
      if (socket.readyState !== WebSocket.OPEN) return
      const buffer = new ArrayBuffer(9)
      const view = new DataView(buffer)
      view.setUint8(0, 1)
      view.setInt16(1, scale(x), true)
      view.setInt16(3, scale(z), true)
      view.setUint8(5, headingByte(heading))
      view.setUint8(6, 0)
      view.setUint16(7, 0, true)
      socket.send(buffer)
    },
    sendChat(text) {
      if (socket.readyState !== WebSocket.OPEN) return
      chatSeq = (chatSeq % 4294967295) + 1
      socket.send(JSON.stringify({ t: 'chat', text, id: chatSeq }))
    },
    sendPunch(target) {
      if (socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify({ t: 'punch', target }))
    },
    close() {
      closed = true
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'leave' }))
      socket.close()
    },
  }
}

function readRoster(value: unknown): RosterEntry {
  const record = value as Record<string, unknown>
  const number = record.n
  return {
    index: Number(record.i),
    name: String(record.name ?? 'Ẩn danh'),
    number: Number.isInteger(number) ? Number(number) : null,
    bot: record.b === true,
    x: Number(record.x ?? 0),
    z: Number(record.z ?? 0),
    heading: (Number(record.heading ?? 128) / 256) * Math.PI * 2,
  }
}

function readMoves(data: unknown): MoveRecord[] | null {
  if (!(data instanceof ArrayBuffer) || data.byteLength < 5) return null
  const view = new DataView(data)
  if (view.getUint8(0) !== 129) return null
  const count = view.getUint16(3, true)
  const records: MoveRecord[] = []
  for (let index = 0; index < count; index += 1) {
    const offset = 5 + index * 10
    if (offset + 10 > view.byteLength) break
    records.push({
      index: view.getUint16(offset, true),
      x: view.getInt16(offset + 4, true) / POS_SCALE,
      z: view.getInt16(offset + 6, true) / POS_SCALE,
      heading: (view.getUint8(offset + 8) / 256) * Math.PI * 2,
    })
  }
  return records
}

function scale(value: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(value * POS_SCALE)))
}

function headingByte(rad: number): number {
  return (Math.round((rad / (Math.PI * 2)) * 256) % 256 + 256) % 256
}
