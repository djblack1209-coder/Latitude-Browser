export type FieldScene = { id: string; view: 'table' | 'card'; status: 'idle' | 'running' | 'pending' | 'error' }
export type FieldAnchor = { element: HTMLElement; variant: 'overview' | 'compact' | 'mark' }
export type FieldRuntime = {
  anchors: Map<string, FieldAnchor>
  scene: FieldScene
  route: string
  sceneRoute: string
  invalidate: () => void
  pointer: (x: number | null, y: number | null) => void
}
export type Grain = { x: number; y: number; z: number; dx: number; dy: number; vx: number; vy: number; heat: number }
export const FIELD_WIDTH = 320
export const FIELD_HEIGHT = 176
export const GLYPHS = '.:-=+*#%@'

/** Stable point identities make dots, glyphs and profile poses the same object. */
export function createGrains(): Grain[] {
  const points: Grain[] = []
  for (let row = 1; row < 20; row++) {
    const latitude = -Math.PI / 2 + row * Math.PI / 20
    for (let column = 0; column < 36; column++) {
      const longitude = column * Math.PI * 2 / 36
      points.push({ x: Math.cos(latitude) * Math.sin(longitude), y: Math.sin(latitude), z: Math.cos(latitude) * Math.cos(longitude), dx: 0, dy: 0, vx: 0, vy: 0, heat: 0 })
    }
  }
  return points
}

export function identityYaw(id: string) {
  let hash = 2166136261
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return ((hash >>> 0) % 1000) / 1000 * .85 - .425
}

export function projectGrain(point: Grain, yaw: number, pitch: number, focus: number) {
  const x = point.x * Math.cos(yaw) + point.z * Math.sin(yaw)
  const depth = point.z * Math.cos(yaw) - point.x * Math.sin(yaw)
  const y = point.y * Math.cos(pitch) - depth * Math.sin(pitch)
  const z = depth * Math.cos(pitch) + point.y * Math.sin(pitch)
  const perspective = 1 + z * .1
  return { x: 160 + x * (64 + focus * 7) * perspective + point.dx, y: 88 + y * (64 - focus * 6) * perspective + point.dy, z }
}

/** Semi-implicit, bounded steps remain stable after a background-tab pause. */
export function stepGrains(points: Grain[], elapsed: number, reduced = false) {
  if (reduced) {
    for (const p of points) p.dx = p.dy = p.vx = p.vy = p.heat = 0
    return false
  }
  let remaining = Math.max(0, Math.min(.05, elapsed)), moving = false
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 120)
    remaining -= dt
    for (const p of points) {
      p.vx += (-70 * p.dx - 15 * p.vx) * dt
      p.vy += (-70 * p.dy - 15 * p.vy) * dt
      p.dx += p.vx * dt; p.dy += p.vy * dt
      p.heat *= Math.exp(-dt * 4)
    }
  }
  for (const p of points) {
    if (Math.abs(p.dx) < .015 && Math.abs(p.dy) < .015 && Math.abs(p.vx) < .07 && Math.abs(p.vy) < .07) p.dx = p.dy = p.vx = p.vy = 0
    if (p.heat < .005) p.heat = 0
    moving ||= !!(p.dx || p.dy || p.vx || p.vy || p.heat)
  }
  return moving
}

export function disturbGrains(points: Grain[], x: number, y: number, moveX: number, moveY: number, yaw: number, pitch: number, focus: number) {
  for (const p of points) {
    const projected = projectGrain(p, yaw, pitch, focus)
    if (projected.z < -.2) continue
    const dx = projected.x - x, dy = projected.y - y, distance = Math.hypot(dx, dy)
    const weight = Math.max(0, 1 - distance / 42)
    if (!weight) continue
    const inverse = 1 / Math.max(distance, 4)
    p.vx = Math.max(-180, Math.min(180, p.vx + (moveX * 8 - dy * inverse * 70) * weight))
    p.vy = Math.max(-180, Math.min(180, p.vy + (moveY * 8 + dx * inverse * 70) * weight))
    p.heat = Math.min(1, p.heat + weight * .8)
  }
}
