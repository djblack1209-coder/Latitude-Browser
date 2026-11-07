import { createGrains, disturbGrains, FIELD_HEIGHT, FIELD_WIDTH, GLYPHS, identityYaw, projectGrain, stepGrains, type FieldAnchor, type FieldRuntime } from './fieldModel'

/** Canvas 2D is deliberately bounded: no WebGL dependency, media downloads or idle loop. */
export function mountFieldwork(canvas: HTMLCanvasElement, runtime: FieldRuntime, available: (value: boolean) => void) {
  let context: CanvasRenderingContext2D | null = null
  try { context = canvas.getContext('2d', { alpha: true }) } catch { /* SVG remains usable. */ }
  if (!context) return
  const ctx = context
  const grains = createGrains()
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const fine = matchMedia('(hover: hover) and (pointer: fine)')
  let frame = 0, disposed = false, previousTime = 0, frames = 0
  let yaw = -.2, pitch = -.16, focus = 0, glyphs = 1, targetYaw = yaw, targetFocus = 0, targetGlyphs = 1
  let mouseX = 0, mouseY = 0, previousMouse: { x: number; y: number } | null = null
  let active: FieldAnchor | undefined, activeRect: DOMRect | undefined, lastID = '', previousTransform = ''
  let measureNeeded = true, lastInput = 0
  let colors = { text: '#edf1e9', identity: '#bcacee', accent: '#d2fa69', error: '#ff8084', warning: '#f3c77b', line: '#3d473e' }
  const observer = new ResizeObserver(() => invalidate())
  const observed = new Set<HTMLElement>()

  function readColors() {
    const style = getComputedStyle(document.documentElement)
    colors = { text: style.getPropertyValue('--text').trim(), identity: style.getPropertyValue('--identity').trim(), accent: style.getPropertyValue('--accent').trim(), error: style.getPropertyValue('--err').trim(), warning: style.getPropertyValue('--warn').trim(), line: style.getPropertyValue('--border-strong').trim() }
  }
  function schedule() {
    if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(render)
  }
  function invalidate() { measureNeeded = true; schedule() }
  function measure() {
    measureNeeded = false
    for (const el of observed) if (![...runtime.anchors.values()].some(a => a.element === el)) { observer.unobserve(el); observed.delete(el) }
    const candidates: { anchor: FieldAnchor; rect: DOMRect }[] = []
    for (const anchor of runtime.anchors.values()) {
      if (!observed.has(anchor.element)) { observer.observe(anchor.element); observed.add(anchor.element) }
      const rect = anchor.element.getBoundingClientRect()
      const scroll = anchor.element.closest('.signal-main')?.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2 || rect.bottom < (scroll?.top || 0) + 24 || rect.top > innerHeight || rect.right < 0) continue
      candidates.push({ anchor, rect })
    }
    candidates.sort((a, b) => ({ mark: 0, compact: 1, overview: 2 }[b.anchor.variant] - { mark: 0, compact: 1, overview: 2 }[a.anchor.variant]))
    active = candidates[0]?.anchor; activeRect = candidates[0]?.rect
    for (const anchor of runtime.anchors.values()) anchor.element.dataset.fieldActive = String(anchor === active)
    canvas.hidden = !active
    if (!active || !activeRect) return
    const scale = active.variant === 'mark' ? Math.min(activeRect.width, activeRect.height) / 150 : Math.min(activeRect.width / FIELD_WIDTH, activeRect.height / FIELD_HEIGHT)
    const transform = `translate3d(${activeRect.left + activeRect.width / 2 - FIELD_WIDTH * scale / 2}px,${activeRect.top + activeRect.height / 2 - FIELD_HEIGHT * scale / 2}px,0) scale(${scale})`
    if (transform !== previousTransform) { canvas.style.transform = transform; previousTransform = transform }
    canvas.dataset.anchor = active.variant
    const ratio = Math.min(devicePixelRatio || 1, 2)
    if (canvas.width !== Math.round(FIELD_WIDTH * ratio)) {
      canvas.width = Math.round(FIELD_WIDTH * ratio); canvas.height = Math.round(FIELD_HEIGHT * ratio); ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
  }
  function render(now: number) {
    frame = 0
    if (disposed || document.hidden) return
    if (measureNeeded) measure()
    if (!active) { previousTime = 0; return }
    const reduced = motion.matches
    const dt = previousTime ? Math.min((now - previousTime) / 1000, .05) : 1 / 60
    previousTime = now
    const scene = runtime.scene
    const inContext = runtime.route === runtime.sceneRoute
    targetFocus = inContext && scene.id !== 'workspace' ? 1 : 0
    targetYaw = identityYaw(inContext ? scene.id : runtime.route) + mouseX * .2
    targetGlyphs = inContext && scene.view === 'card' ? 0 : 1
    if (scene.id !== lastID) {
      // Selection changes scatter existing points, rather than replacing the object.
      if (lastID && !reduced) for (let i = 0; i < grains.length; i++) { grains[i].vx += Math.sin(i * 1.7) * 32; grains[i].vy += Math.cos(i * .9) * 24 }
      lastID = scene.id
    }
    if (now - lastInput > 120) { mouseX = 0; mouseY = 0; previousMouse = null }
    const blend = reduced ? 1 : 1 - Math.exp(-dt * 10)
    yaw += (targetYaw - yaw) * blend; pitch += (-.16 + mouseY * .12 - pitch) * blend
    focus += (targetFocus - focus) * blend; glyphs += (targetGlyphs - glyphs) * blend
    let moving = stepGrains(grains, dt, reduced)
    moving ||= Math.abs(yaw - targetYaw) > .0005 || Math.abs(pitch + .16 - mouseY * .12) > .0005 || Math.abs(focus - targetFocus) > .0005 || Math.abs(glyphs - targetGlyphs) > .0005
    if (!moving || reduced) { yaw = targetYaw; pitch = -.16; focus = targetFocus; glyphs = targetGlyphs }
    ctx.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT)
    const compact = active.variant === 'mark'
    const tone = inContext && scene.status === 'error' ? colors.error : inContext && scene.status === 'pending' ? colors.warning : inContext && scene.status === 'running' ? colors.accent : colors.identity
    // Three quiet depth plates replace the reference's externally hosted video layers.
    if (!compact) {
      ctx.strokeStyle = colors.line; ctx.lineWidth = .65
      for (let layer = 0; layer < 3; layer++) {
        ctx.globalAlpha = .16 + layer * .07
        ctx.beginPath(); ctx.ellipse(160, 88, 124 - layer * 14, 33 + layer * 7, -.33 + layer * .08 + yaw * .1, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.globalAlpha = .25; ctx.beginPath(); ctx.moveTo(16, 88); ctx.lineTo(304, 88); ctx.moveTo(160, 12); ctx.lineTo(160, 164); ctx.stroke()
      ctx.fillStyle = tone; ctx.globalAlpha = .65
      for (const x of [30, 287]) { ctx.fillRect(x, 19, 8, 1); ctx.fillRect(x, 19, 1, 8); ctx.fillRect(320 - x - 8, 156, 8, 1) }
    }
    const cells = new Map<number, { x: number; y: number; z: number; heat: number }>()
    for (const p of grains) {
      const projected = projectGrain(p, yaw, pitch, focus)
      if (projected.z < -.5) continue
      const opacity = .16 + (projected.z + 1) * .34
      if (compact || glyphs < .995) {
        ctx.globalAlpha = compact ? opacity : opacity * (1 - glyphs)
        ctx.fillStyle = p.heat > .08 ? colors.accent : projected.z > .7 ? colors.text : tone
        ctx.beginPath(); ctx.arc(projected.x, projected.y, compact ? 2 : .7 + (projected.z + 1) * .3, 0, Math.PI * 2); ctx.fill()
      }
      if (!compact && glyphs > .005) {
        const x = Math.round(projected.x / 6), y = Math.round(projected.y / 8), key = y * 100 + x
        if ((cells.get(key)?.z ?? -2) < projected.z) cells.set(key, { x: x * 6, y: y * 8, z: projected.z, heat: p.heat })
      }
    }
    if (!compact) {
      ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      for (const cell of cells.values()) {
        ctx.globalAlpha = (.28 + (cell.z + 1) * .32) * glyphs
        ctx.fillStyle = cell.heat > .08 ? colors.accent : cell.z > .72 ? colors.text : tone
        const density = Math.min(GLYPHS.length - 1, Math.floor((cell.z + 1) * .5 * (GLYPHS.length - 1)))
        ctx.fillText(GLYPHS[density], cell.x, cell.y)
      }
    }
    ctx.globalAlpha = 1
    canvas.dataset.frames = String(++frames); canvas.dataset.scene = inContext ? scene.id : 'workspace'; canvas.dataset.view = inContext ? scene.view : 'table'
    canvas.dataset.glyphs = String(cells.size); canvas.dataset.motion = reduced ? 'reduced' : 'full'
    const settled = reduced || !moving; canvas.dataset.settled = String(settled)
    if (!settled) schedule(); else previousTime = 0
  }
  runtime.invalidate = invalidate
  runtime.pointer = (x, y) => {
    if (motion.matches || !fine.matches || !activeRect || !active || active.variant === 'mark') return
    lastInput = performance.now()
    if (x === null || y === null) { mouseX = mouseY = 0; previousMouse = null; schedule(); return }
    const scale = Math.min(activeRect.width / FIELD_WIDTH, activeRect.height / FIELD_HEIGHT)
    const localX = (x - activeRect.left - activeRect.width / 2) / scale + 160, localY = (y - activeRect.top - activeRect.height / 2) / scale + 88
    mouseX = Math.max(-1, Math.min(1, (localX - 160) / 120)); mouseY = Math.max(-1, Math.min(1, (localY - 88) / 72))
    if (previousMouse) disturbGrains(grains, localX, localY, localX - previousMouse.x, localY - previousMouse.y, yaw, pitch, focus)
    previousMouse = { x: localX, y: localY }; schedule()
  }
  function visibility() { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; previousTime = 0 } else invalidate() }
  function mediaChanged() { mouseX = mouseY = 0; previousMouse = null; invalidate() }
  readColors(); available(true); invalidate()
  window.addEventListener('resize', invalidate, { passive: true }); window.addEventListener('scroll', invalidate, { capture: true, passive: true })
  document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', mediaChanged); fine.addEventListener('change', mediaChanged)
  void document.fonts.ready.then(() => { if (!disposed) invalidate() })
  return () => {
    disposed = true; cancelAnimationFrame(frame); observer.disconnect()
    runtime.invalidate = () => {}; runtime.pointer = () => {}
    window.removeEventListener('resize', invalidate); window.removeEventListener('scroll', invalidate, true)
    document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', mediaChanged); fine.removeEventListener('change', mediaChanged)
  }
}
