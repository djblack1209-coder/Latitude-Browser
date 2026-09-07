/**
 * Adapted from komari-theme-commander's Globe.tsx (MIT, Copyright 2026 WayJam So).
 * Reuses its COBE v2 camera/lifecycle and visibility-gated, capped auto-spin.
 * Latitude removes telemetry markers/arcs; this is an illustration, not a route map.
 * Full upstream notice: third_party/licenses/komari-theme-commander-MIT.txt.
 */
import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { Globe } from 'cobe'
import clsx from 'clsx'
import { useTheme } from '../theme'

export function NetworkGlobe({ className, label = '网络示意 · 不代表实时路由', active = true }: {
  className?: string
  label?: string
  active?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [paused, setPaused] = useState(false)
  const [ready, setReady] = useState(false)
  const [reduced, setReduced] = useState(false)
  const { theme } = useTheme()
  const motionInputs = useRef({ active, paused })
  const syncMotionRef = useRef<(() => void) | null>(null)

  // Pause/resume changes scheduling only. Recreating the renderer would hide
  // its controls, reset the camera, and allocate another WebGL context.
  useEffect(() => {
    motionInputs.current = { active, paused }
    syncMotionRef.current?.()
  }, [active, paused])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    let disposed = false
    let globe: Globe | undefined
    let initialPaint: ReturnType<typeof setTimeout> | undefined
    let initialized = false
    let raf = 0
    let wake: ReturnType<typeof setTimeout> | undefined
    let phi = 0.55
    let lastDraw = 0
    let visible = false
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const lowPower = (navigator.hardwareConcurrency || 4) <= 4 || window.innerWidth < 640
    const frameInterval = 1000 / (lowPower ? 20 : 30)
    const stop = () => {
      cancelAnimationFrame(raf)
      if (wake !== undefined) clearTimeout(wake)
      raf = 0
      wake = undefined
      lastDraw = 0
    }
    const shouldSpin = () => !!globe && initialized && !disposed && motionInputs.current.active && !motionInputs.current.paused && !media.matches && !document.hidden && visible
    const tick = (now: number) => {
      raf = 0
      if (!shouldSpin()) return
      const delta = lastDraw ? Math.min(0.08, (now - lastDraw) / 1000) : frameInterval / 1000
      phi += delta * 0.16
      lastDraw = now
      globe?.update({ phi })
      wake = setTimeout(() => {
        wake = undefined
        if (shouldSpin()) raf = requestAnimationFrame(tick)
      }, frameInterval)
    }
    const syncMotion = () => {
      stop()
      setReduced(media.matches)
      if (shouldSpin()) raf = requestAnimationFrame(tick)
    }
    syncMotionRef.current = syncMotion
    const fail = () => {
      if (initialPaint !== undefined) clearTimeout(initialPaint)
      initialized = false
      stop()
      globe?.destroy()
      globe = undefined
      if (!disposed) setReady(false)
    }
    setReady(false)
    setReduced(media.matches)
    const resize = new ResizeObserver(() => {
      const size = Math.round(Math.min(host.clientWidth, host.clientHeight))
      if (globe && size > 0) globe.update({ width: size, height: size })
    })
    resize.observe(host)
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      syncMotion()
    }, { threshold: 0.1 })
    intersection.observe(host)
    document.addEventListener('visibilitychange', syncMotion)
    media.addEventListener('change', syncMotion)
    canvas.addEventListener('webglcontextlost', fail)

    // Lazy-loaded dependency; no remote texture, CDN, IP lookup, or analytics request.
    void import('cobe').then(({ default: createGlobe }) => {
      if (disposed) return
      const size = Math.max(1, Math.round(Math.min(host.clientWidth, host.clientHeight)))
      const dark = theme === 'dark'
      try {
        globe = createGlobe(canvas, {
          devicePixelRatio: Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.5),
          width: size,
          height: size,
          phi,
          theta: 0.24,
          dark: dark ? 1 : 0,
          diffuse: 1.5,
          mapSamples: lowPower ? 8000 : 14000,
          mapBrightness: dark ? 5 : 2,
          mapBaseBrightness: 0,
          baseColor: dark ? [0.42, 0.55, 0.48] : [0.69, 0.77, 0.72],
          markerColor: [0.54, 0.9, 0.68],
          glowColor: dark ? [0.08, 0.14, 0.11] : [0.85, 0.88, 0.86],
          markers: [],
          arcs: [],
          scale: 0.93,
          opacity: 0.96,
          context: { powerPreference: 'low-power', antialias: false, alpha: true },
        })
        // COBE 2 uploads its embedded map asynchronously, without requesting a
        // redraw. A bounded, same-camera paint keeps inactive/reduced-motion
        // globes textured instead of leaving the initial empty sphere forever.
        // This is one initial paint, not a background animation loop.
        initialPaint = setTimeout(() => {
          initialPaint = undefined
          if (disposed || !globe) return
          globe.update({ phi })
          initialized = true
          setReady(true)
          syncMotion()
        }, 200)
      } catch {
        fail()
      }
    }).catch(fail)

    return () => {
      disposed = true
      if (initialPaint !== undefined) clearTimeout(initialPaint)
      if (syncMotionRef.current === syncMotion) syncMotionRef.current = null
      stop()
      intersection.disconnect()
      resize.disconnect()
      document.removeEventListener('visibilitychange', syncMotion)
      media.removeEventListener('change', syncMotion)
      canvas.removeEventListener('webglcontextlost', fail)
      globe?.destroy()
    }
  }, [theme])

  const motionState = ready && active && !paused && !reduced ? 'rotating' : 'still'

  return (
    <figure
      className={clsx('signal-globe', className)}
      data-renderer={ready ? 'cobe' : 'static'}
      data-motion={motionState}
      data-active={active ? 'true' : 'false'}
      data-paused={paused ? 'true' : 'false'}
    >
      <div className="signal-globe-viewport" ref={hostRef} aria-hidden="true">
        <span className="signal-globe-orbit signal-globe-orbit-primary" />
        <span className="signal-globe-orbit signal-globe-orbit-secondary" />
        <span className="signal-globe-scanline" />
        <canvas ref={canvasRef} className={clsx('signal-globe-canvas', !ready && 'invisible')} />
        {!ready && (
          <svg viewBox="0 0 200 200" className="signal-globe-fallback" fill="none">
            <circle cx="100" cy="100" r="76" />
            <ellipse cx="100" cy="100" rx="38" ry="76" />
            <ellipse cx="100" cy="100" rx="66" ry="76" />
            <ellipse cx="100" cy="100" rx="76" ry="27" />
            <path d="M24 100h152M100 24v152M35 61h130M35 139h130" />
          </svg>
        )}
        <span className="signal-globe-crosshair signal-globe-crosshair-start">+</span>
        <span className="signal-globe-crosshair signal-globe-crosshair-end">+</span>
      </div>
      <figcaption>
        <span>{label}</span>
        {ready && active && !reduced && (
          <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? '播放地球动画' : '暂停地球动画'} title={paused ? '播放地球动画' : '暂停地球动画'}>
            {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
          </button>
        )}
      </figcaption>
    </figure>
  )
}
