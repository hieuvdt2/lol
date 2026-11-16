import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Server game đầy đủ (hangmu-server.mjs). server/room.mjs là bản phòng tối giản ban đầu, không có /api, quiz, duel...
const room = spawn(process.execPath, ['server/hangmu-server.mjs'], {
  cwd: project,
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.ROOM_PORT ?? '8787', STATIC_DIR: '' },
})
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173'], {
  cwd: project,
  stdio: 'inherit',
})

function stop() {
  room.kill()
  vite.kill()
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
vite.on('exit', stop)
room.on('exit', stop)
