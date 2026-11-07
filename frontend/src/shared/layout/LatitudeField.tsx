import { createContext, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { LatitudeMark } from './LatitudeMark'
import { mountFieldwork } from './fieldwork/fieldRenderer'
import type { FieldScene, FieldAnchor, FieldRuntime } from './fieldwork/fieldModel'

const FieldContext = createContext<{ runtime: FieldRuntime; available: boolean } | null>(null)

/** One canvas survives route changes; anchors reserve space without owning a renderer. */
export function FieldworkProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [available, setAvailable] = useState(false)
  const [runtime] = useState<FieldRuntime>(() => ({
    anchors: new Map(), scene: { id: 'workspace', view: 'table', status: 'idle' },
    route: location.pathname, sceneRoute: location.pathname,
    invalidate: () => {}, pointer: () => {},
  }))
  const value = useMemo(() => ({ runtime, available }), [runtime, available])
  useLayoutEffect(() => {
    if (!canvas.current) return
    return mountFieldwork(canvas.current, runtime, setAvailable)
  }, [runtime])
  useLayoutEffect(() => { runtime.route = location.pathname; runtime.invalidate() }, [runtime, location.pathname])
  return <FieldContext.Provider value={value}>{children}<canvas ref={canvas} className="fieldwork-layer" aria-hidden="true" data-fieldwork-layer="" /></FieldContext.Provider>
}

/** The caller publishes existing UI state only; this hook never starts a browser. */
export function useFieldScene(scene: FieldScene) {
  const runtime = useContext(FieldContext)?.runtime
  const route = useLocation().pathname
  useLayoutEffect(() => {
    if (!runtime) return
    runtime.scene = { id: scene.id, view: scene.view, status: scene.status }
    runtime.sceneRoute = route
    runtime.invalidate()
  }, [runtime, route, scene.id, scene.view, scene.status])
}

export function LatitudeField({ variant = 'overview' }: { variant?: FieldAnchor['variant'] }) {
  const context = useContext(FieldContext)
  const runtime = context?.runtime
  const id = useId()
  const element = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (!runtime || !element.current) return
    runtime.anchors.set(id, { element: element.current, variant })
    runtime.invalidate()
    return () => { runtime.anchors.delete(id); runtime.invalidate() }
  }, [runtime, id, variant])
  return <span ref={element} className={`latitude-field latitude-field--${variant}`} data-field-anchor={variant} data-field-ready={context?.available || undefined} aria-hidden="true"
    onPointerMove={event => { if (event.pointerType !== 'touch') runtime?.pointer(event.clientX, event.clientY) }}
    onPointerLeave={() => runtime?.pointer(null, null)}><LatitudeMark /></span>
}
