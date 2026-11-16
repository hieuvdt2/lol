// Khán đài ở rìa nhà thi đấu — người chơi leo lên được. Bậc tầng tầng dâng dần ra tường, mép mỗi bậc có vạch LED, băng ghế khảm màu
// (đúng các hộp va chạm của shared/world.mjs), sáu cầu thang lối đi có thảm sáng, vạch đỏ ở mép bậc và tay vịn hai bên, biển khu A–D ở chân cầu thang.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { AISLE_ANGLES, AISLE_HALF, STANDS, STANDS_OUTER, STANDS_TOP, STAND_BENCH, STAND_BENCHES, STAND_WALLS } from '../../shared/world.mjs'
import { PALETTE, sectionSignTexture } from './arenaTextures.ts'
import { standArcs } from './layout.ts'

type Trash = Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>

/** Mặt cắt các bậc: đứng (riser) rồi nằm (tread), lên tới đỉnh, rồi tường sau. */
function standProfile(): THREE.Vector2[] {
  const points = [new THREE.Vector2(STANDS.inner, 0)]
  for (let tier = 0; tier < STANDS.tiers; tier += 1) {
    const r0 = STANDS.inner + tier * STANDS.width
    const y = (tier + 1) * STANDS.rise
    points.push(new THREE.Vector2(r0, y), new THREE.Vector2(r0 + STANDS.width, y))
  }
  points.push(new THREE.Vector2(STANDS_OUTER + 0.3, STANDS.tiers * STANDS.rise), new THREE.Vector2(STANDS_OUTER + 0.3, 0))
  return points
}

const tread = (tier: number): number => (tier + 1) * STANDS.rise

export function addStands(scene: THREE.Scene, trash: Trash, lite: boolean): void {
  const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => (lite ? new THREE.MeshBasicMaterial({ color, ...extra }) : new THREE.MeshLambertMaterial({ color, ...extra }))
  const unit = new THREE.Vector3(1, 1, 1)
  const up = new THREE.Vector3(0, 1, 0)
  const matrix = new THREE.Matrix4()
  const turn = new THREE.Quaternion()
  const place = new THREE.Vector3()
  const arcs = standArcs()

  // thân khán đài: các bậc nối liền
  const lathes = arcs.map(([start, length]) => new THREE.LatheGeometry(standProfile(), Math.max(8, Math.ceil(length * 18)), start, length))
  const body = mergeGeometries(lathes)
  for (const l of lathes) l.dispose()
  const concrete = lambert('#343f5e', { side: THREE.DoubleSide })
  if (body) {
    scene.add(new THREE.Mesh(body, concrete))
    trash.push(body)
  }
  trash.push(concrete)

  // vạch LED ở mép trên mỗi bậc (thấy rõ từng bậc đi) và vạch đỏ ở chân bậc đầu tiên
  const nosing: THREE.BufferGeometry[] = []
  const foot: THREE.BufferGeometry[] = []
  const tubeAlong = (list: THREE.BufferGeometry[], radius: number, y: number, start: number, length: number, thickness: number) => {
    const points: THREE.Vector3[] = []
    const n = Math.max(6, Math.ceil(length * radius * 0.6))
    for (let i = 0; i <= n; i += 1) {
      const a = start + (i / n) * length
      points.push(new THREE.Vector3(Math.sin(a) * radius, y, Math.cos(a) * radius))
    }
    list.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), n, thickness, 4, false))
  }
  for (const [start, length] of arcs) {
    for (let tier = 0; tier < STANDS.tiers; tier += 1) tubeAlong(nosing, STANDS.inner + tier * STANDS.width + 0.04, tread(tier) + 0.03, start, length, 0.045)
    tubeAlong(foot, STANDS.inner - 0.25, 0.04, start, length, 0.08)
  }
  const nosingMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.warm })
  const footMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.violet })
  for (const [list, material] of [[nosing, nosingMaterial], [foot, footMaterial]] as const) {
    const merged = mergeGeometries(list)
    for (const g of list) g.dispose()
    if (!merged) continue
    scene.add(new THREE.Mesh(merged, material))
    trash.push(merged)
  }
  trash.push(nosingMaterial, footMaterial)

  // băng ghế khảm đỏ - trắng - than chì (cùng vị trí và hướng với hộp va chạm)
  const benchGeometry = new THREE.BoxGeometry(STAND_BENCH.length, STAND_BENCH.height, STAND_BENCH.depth)
  const benchMaterial = lambert('#ffffff')
  const benches = new THREE.InstancedMesh(benchGeometry, benchMaterial, STAND_BENCHES.length)
  const mosaic = [new THREE.Color('#2f6fb8'), new THREE.Color('#aab8d8'), new THREE.Color('#1f2a4a'), new THREE.Color('#aab8d8')]
  STAND_BENCHES.forEach((b, i) => {
    turn.setFromAxisAngle(up, b.angle)
    matrix.compose(place.set(b.x, b.y, b.z), turn, unit)
    benches.setMatrixAt(i, matrix)
    const sector = Math.floor((((b.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 8))
    benches.setColorAt(i, mosaic[sector % mosaic.length]!)
  })
  benches.instanceMatrix.needsUpdate = true
  if (benches.instanceColor) benches.instanceColor.needsUpdate = true
  benches.frustumCulled = false
  scene.add(benches)
  trash.push(benchGeometry, benchMaterial)

  // tường chắn hai bên mỗi khoảng trống
  const wallParts = STAND_WALLS.map((w) => {
    const g = new THREE.BoxGeometry((w.hw ?? 1) * 2, STANDS_TOP, (w.hd ?? 0.15) * 2)
    g.applyMatrix4(matrix.compose(place.set(w.x, w.y, w.z), turn.setFromAxisAngle(up, w.angle), unit))
    return g
  })
  const walls = mergeGeometries(wallParts)
  for (const g of wallParts) g.dispose()
  const wallMaterial = lambert('#161c30')
  if (walls) {
    scene.add(new THREE.Mesh(walls, wallMaterial))
    trash.push(walls)
  }
  trash.push(wallMaterial)

  // cầu thang lối đi: thảm sáng từng bậc + vạch đỏ ở mép + trụ và thanh tay vịn hai bên
  const carpetCount = AISLE_ANGLES.length * STANDS.tiers
  const carpetGeometry = new THREE.BoxGeometry(AISLE_HALF * 2 - 0.12, 0.05, STANDS.width - 0.1)
  const carpetMaterial = lambert('#56648c')
  const carpet = new THREE.InstancedMesh(carpetGeometry, carpetMaterial, carpetCount)
  const stripeGeometry = new THREE.BoxGeometry(AISLE_HALF * 2 - 0.12, 0.06, 0.14)
  const stripeMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.cyan })
  const stripe = new THREE.InstancedMesh(stripeGeometry, stripeMaterial, carpetCount)
  let n = 0
  for (const a of AISLE_ANGLES) {
    for (let tier = 0; tier < STANDS.tiers; tier += 1) {
      const r = STANDS.inner + tier * STANDS.width + STANDS.width / 2
      turn.setFromAxisAngle(up, a)
      matrix.compose(place.set(Math.sin(a) * r, tread(tier) + 0.03, Math.cos(a) * r), turn, unit)
      carpet.setMatrixAt(n, matrix)
      const rs = r - STANDS.width / 2 + 0.1
      matrix.compose(place.set(Math.sin(a) * rs, tread(tier) + 0.05, Math.cos(a) * rs), turn, unit)
      stripe.setMatrixAt(n, matrix)
      n += 1
    }
  }
  for (const m of [carpet, stripe]) {
    m.instanceMatrix.needsUpdate = true
    m.frustumCulled = false
    scene.add(m)
  }
  trash.push(carpetGeometry, carpetMaterial, stripeGeometry, stripeMaterial)

  const railParts: THREE.BufferGeometry[] = []
  const postParts: THREE.BufferGeometry[] = []
  for (const a of AISLE_ANGLES) {
    const tangent = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a))
    for (const side of [-1, 1]) {
      const edge = tangent.clone().multiplyScalar(side * (AISLE_HALF + 0.08))
      // thanh vịn chạy dọc dốc từ chân tới đỉnh, cao 1 m so với mặt bậc
      const from = new THREE.Vector3(Math.sin(a) * STANDS.inner, tread(0) + 1.0, Math.cos(a) * STANDS.inner).add(edge)
      const to = new THREE.Vector3(Math.sin(a) * STANDS_OUTER, STANDS_TOP + 1.0, Math.cos(a) * STANDS_OUTER).add(edge)
      const dir = to.clone().sub(from)
      const rail = new THREE.BoxGeometry(0.06, 0.06, dir.length())
      rail.applyMatrix4(matrix.compose(from.clone().add(to).multiplyScalar(0.5), turn.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize()), unit))
      railParts.push(rail)
      for (let tier = 0; tier < STANDS.tiers; tier += 1) {
        const r = STANDS.inner + tier * STANDS.width + STANDS.width * 0.5
        const post = new THREE.BoxGeometry(0.06, 1.0, 0.06)
        post.applyMatrix4(matrix.compose(new THREE.Vector3(Math.sin(a) * r, tread(tier) + 0.5, Math.cos(a) * r).add(edge), turn.identity(), unit))
        postParts.push(post)
      }
    }
  }
  const railMaterial = new THREE.MeshStandardMaterial({ color: '#9fb0d4', roughness: 0.35, metalness: 0.7 })
  for (const list of [railParts, postParts]) {
    const merged = mergeGeometries(list)
    for (const g of list) g.dispose()
    if (!merged) continue
    scene.add(new THREE.Mesh(merged, railMaterial))
    trash.push(merged)
  }
  trash.push(railMaterial)

  // biển khu A–D ở chân bốn cầu thang chéo, lệch sang bên cho khỏi chắn đường
  const post = new THREE.BoxGeometry(0.16, 3.4, 0.16)
  const postMaterial = new THREE.MeshStandardMaterial({ color: '#2c303c', roughness: 0.5, metalness: 0.4 })
  const board = new THREE.PlaneGeometry(1.7, 1.7)
  trash.push(post, postMaterial, board)
  ;[Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].forEach((angle, i) => {
    const radius = STANDS.inner - 1.0
    const texture = sectionSignTexture('ABCD'[i]!)
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    trash.push(texture, material)
    const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle)).multiplyScalar(AISLE_HALF + 1.2)
    const group = new THREE.Group()
    group.position.set(Math.sin(angle) * radius + tangent.x, 0, Math.cos(angle) * radius + tangent.z)
    group.rotation.y = angle + Math.PI
    const stand = new THREE.Mesh(post, postMaterial)
    stand.position.y = 1.7
    const sign = new THREE.Mesh(board, material)
    sign.position.set(0, 3.5, 0.02)
    group.add(stand, sign)
    scene.add(group)
  })
}
