import { useEffect, useState } from 'react'
import type { NetClient } from '../game/net.ts'

interface Sample {
  fps: number
  worstMs: number
  rtt: number | null
  delayTicks: number
  actors: number
  recordsPerSec: number
  heapMB: number | null
}

/** Chỉ hiện khi có `?debug=1`. Đo FPS thật của trang bằng vòng requestAnimationFrame riêng (cùng luồng với game). */
export function DebugHud({ net }: { net: NetClient }) {
  const [sample, setSample] = useState<Sample | null>(null)
  useEffect(() => {
    let frame = 0
    let frames = 0
    let worst = 0
    let last = performance.now()
    let windowStart = last
    let lastRecords = net.debugInfo().records
    const loop = (now: number) => {
      frames += 1
      worst = Math.max(worst, now - last)
      last = now
      if (now - windowStart >= 1000) {
        const info = net.debugInfo()
        const seconds = (now - windowStart) / 1000
        const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
        setSample({
          fps: Math.round(frames / seconds),
          worstMs: Math.round(worst),
          rtt: info.rtt,
          delayTicks: info.delayTicks,
          actors: info.actors,
          recordsPerSec: Math.round((info.records - lastRecords) / seconds),
          heapMB: heap ? Math.round(heap.usedJSHeapSize / 1048576) : null,
        })
        lastRecords = info.records
        frames = 0
        worst = 0
        windowStart = now
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [net])

  return (
    <aside className="debug-hud" aria-label="Thông số kỹ thuật">
      {sample ? (
        <>
          <b>{sample.fps} FPS</b> · tệ nhất {sample.worstMs}ms
          <br />
          ping {sample.rtt ?? '–'}ms · trễ nội suy {sample.delayTicks} tick
          <br />
          {sample.actors} diễn viên · {sample.recordsPerSec} bản ghi/s
          <br />
          {sample.heapMB !== null ? `heap ${sample.heapMB}MB · ` : ''}
          {window.innerWidth}×{window.innerHeight} @{window.devicePixelRatio}x
        </>
      ) : (
        'đang đo…'
      )}
    </aside>
  )
}
