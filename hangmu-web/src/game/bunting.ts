import * as THREE from 'three'
import { BUNTING_COLORS, buntingLayout } from './buntingLayout.ts'
import type { BuntingOptions } from './buntingLayout.ts'

type Trash = Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>

/** Dây cờ tam giác trên trần: một InstancedMesh cho toàn bộ lá cờ + một LineSegments cho toàn bộ dây (hai lượt vẽ). */
export function addBunting(scene: THREE.Scene, trash: Trash, options?: BuntingOptions): void {
  const strands = buntingLayout(options)
  const flags = strands.flatMap((s) => s.pennants)

  const triangle = new THREE.BufferGeometry()
  const w = 0.55
  const h = 1.25
  triangle.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0, -h, 0], 3))
  triangle.computeVertexNormals()
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const mesh = new THREE.InstancedMesh(triangle, material, flags.length)
  const matrix = new THREE.Matrix4()
  const turn = new THREE.Quaternion()
  const colour = new THREE.Color()
  const up = new THREE.Vector3(0, 1, 0)
  flags.forEach((f, i) => {
    turn.setFromAxisAngle(up, f.rotY)
    matrix.compose(new THREE.Vector3(f.x, f.y, f.z), turn, new THREE.Vector3(1, 1, 1))
    mesh.setMatrixAt(i, matrix)
    mesh.setColorAt(i, colour.set(BUNTING_COLORS[f.color]))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.frustumCulled = false
  scene.add(mesh)

  const positions: number[] = []
  for (const s of strands) {
    for (let i = 0; i + 1 < s.points.length; i += 1) positions.push(...s.points[i]!, ...s.points[i + 1]!)
  }
  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#2b2118' })
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial)
  lines.frustumCulled = false
  scene.add(lines)
  trash.push(triangle, material, lineGeometry, lineMaterial)
}
