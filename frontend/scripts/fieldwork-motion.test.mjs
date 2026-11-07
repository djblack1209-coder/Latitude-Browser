import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const code = await build({ entryPoints: [fileURLToPath(new URL('../src/shared/layout/fieldwork/fieldModel.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
const { createGrains, disturbGrains, projectGrain, stepGrains } = await import('data:text/javascript;base64,' + Buffer.from(code.outputFiles[0].text).toString('base64'))

test('pointer disturbance is visible, bounded and returns the same object to rest within two seconds', () => {
  const points = createGrains(), identities = [...points]
  const homes = points.map(p => [p.x,p.y,p.z])
  disturbGrains(points, 182, 78, 12, -6, 0, -.16, 0)
  assert(points.some(p => Math.abs(p.vx) > 1 && p.heat > .1))
  assert.equal(stepGrains(points, 1 / 60), true)
  assert(points.some(p => Math.hypot(p.dx, p.dy) > .1))
  for (let i = 0; i < 120; i++) stepGrains(points, 1 / 60)
  assert.equal(stepGrains(points, 1 / 60), false)
  points.forEach((p, i) => { assert.equal(p, identities[i]); assert.deepEqual([p.x,p.y,p.z],homes[i]); assert.equal(p.dx + p.dy + p.vx + p.vy + p.heat, 0) })
})

test('a long suspended frame cannot destabilize the field; reduced motion snaps every transient', () => {
  const points = createGrains()
  for (let i = 0; i < 20; i++) disturbGrains(points, 170, 86, 1000, -1000, 0, 0, 1)
  stepGrains(points, 60)
  for (const p of points) { assert(Number.isFinite(p.dx + p.dy)); assert(Math.abs(p.dx) < 12 && Math.abs(p.dy) < 12) }
  assert.equal(stepGrains(points, 0, true), false)
  assert(points.every(p => p.dx === 0 && p.dy === 0 && p.heat === 0))
})

test('profile focus and gaze retain finite projected geometry inside the bounded canvas', () => {
  const points = createGrains()
  for (const yaw of [-1,0,1]) for (const focus of [0,1]) for (const p of points) {
    const q = projectGrain(p,yaw,.2,focus)
    assert(Number.isFinite(q.x+q.y+q.z)); assert(q.x > 60 && q.x < 260 && q.y > 10 && q.y < 166)
  }
})
