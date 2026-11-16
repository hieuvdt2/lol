// Bảng xếp hạng LCK gắn vách (hai bảng cùng nội dung) + biển gợi ý thao tác phía dưới.
import * as THREE from 'three'
import { BOARD_H, BOARD_W, drawLckBoard } from './lckBoard.ts'

type Trash = Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>

export interface HangingBoard {
  group: THREE.Group
}

const SIGN_W = 640
const SIGN_H = 120

function signTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = SIGN_W
  canvas.height = SIGN_H
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#0d2a52'
    ctx.fillRect(0, 0, SIGN_W, SIGN_H)
    ctx.strokeStyle = '#3fc8ff'
    ctx.lineWidth = 6
    ctx.strokeRect(5, 5, SIGN_W - 10, SIGN_H - 10)
    ctx.fillStyle = '#e8f4ff'
    ctx.font = '700 34px Bitter, Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, SIGN_W / 2, SIGN_H / 2 + 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * Hai bảng xếp hạng LCK gắn trên vách phía bắc, hai bên màn hình hội trường (mỗi bảng một mặt phẳng thẳng đứng quay vào tâm hang, cùng một nội dung),
 * mỗi bảng có một tấm biển gợi ý thao tác ngay bên dưới. Trước đây là một khối bốn mặt treo giữa hang, chồng lên màn LED trung tâm
 * và bị méo khi nhìn xiên từ dưới lên: nay trung tâm chỉ còn một màn hình duy nhất (xem venue.ts).
 */
export const BOARD_SPOTS = [
  { angle: 2.75, y: 9.8, distance: 51, width: 12 },
  { angle: -2.75, y: 9.8, distance: 51, width: 12 },
] as const

export function createHangingBoard(scene: THREE.Scene, trash: Trash): HangingBoard {
  const group = new THREE.Group()

  const canvas = document.createElement('canvas')
  canvas.width = BOARD_W
  canvas.height = BOARD_H
  const board = canvas.getContext('2d')
  if (board) drawLckBoard(board) // nội dung tĩnh: vẽ một lần
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const face = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  const frame = new THREE.MeshStandardMaterial({ color: '#2c303c', roughness: 0.45, metalness: 0.5 })
  const rim = new THREE.MeshBasicMaterial({ color: '#3fc8ff' })
  trash.push(texture, face, frame, rim)

  const signs: Array<[string, number]> = [['Giao lưu võ thuật · lại gần ai đó, nhấn V', 0], ['Giao lưu mồm · lại gần ai đó, nhấn R', 1]]
  BOARD_SPOTS.forEach(({ angle, y, distance, width }, index) => {
    const height = (width * BOARD_H) / BOARD_W
    const holder = new THREE.Group()
    holder.position.set(Math.sin(angle) * distance, y, Math.cos(angle) * distance)
    holder.rotation.y = angle + Math.PI // mặt quay vào tâm hang
    const panel = new THREE.PlaneGeometry(width, height)
    const screen = new THREE.Mesh(panel, face)
    screen.position.z = 0.12
    const back = new THREE.BoxGeometry(width + 0.5, height + 0.5, 0.2)
    const casing = new THREE.Mesh(back, frame)
    const stripGeometry = new THREE.BoxGeometry(width + 0.5, 0.12, 0.14)
    const top = new THREE.Mesh(stripGeometry, rim)
    top.position.set(0, height / 2 + 0.28, 0.1)
    const bottom = new THREE.Mesh(stripGeometry, rim)
    bottom.position.set(0, -height / 2 - 0.28, 0.1)
    holder.add(casing, screen, top, bottom)
    trash.push(panel, back, stripGeometry)

    const [text] = signs[index % signs.length]!
    const map = signTexture(text)
    const material = new THREE.MeshBasicMaterial({ map, toneMapped: false })
    const signGeometry = new THREE.PlaneGeometry(6.4, 1.2)
    const sign = new THREE.Mesh(signGeometry, material)
    sign.position.set(0, -height / 2 - 1.3, 0.12)
    holder.add(sign)
    trash.push(map, material, signGeometry)
    group.add(holder)
  })
  scene.add(group)

  return { group }
}
