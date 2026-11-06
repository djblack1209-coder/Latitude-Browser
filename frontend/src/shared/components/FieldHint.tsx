import { tr, useLocale } from '../i18n'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'

/** Field help lives outside cards/dialog scroll containers to avoid clipping. */
export function FieldHint({ text }: { text: string }) {
  useLocale()

  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const delay = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const cancelClose = () => clearTimeout(delay.current)
  const show = () => { cancelClose(); setOpen(true) }
  const hide = () => { cancelClose(); delay.current = setTimeout(() => setOpen(false), 100) }

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      if (!anchor.current || !popup.current) return
      const rect = anchor.current.getBoundingClientRect()
      const box = popup.current.getBoundingClientRect()
      setPosition({
        left: Math.max(12, Math.min(rect.left, innerWidth - box.width - 12)),
        top: rect.bottom + box.height + 8 <= innerHeight - 12
          ? rect.bottom + 8 : Math.max(12, rect.top - box.height - 8),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, text])

  useEffect(() => {
    if (!open) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      cancelClose()
      setOpen(false)
    }
    window.addEventListener('keydown', dismiss, true)
    return () => window.removeEventListener('keydown', dismiss, true)
  }, [open])
  useEffect(() => () => clearTimeout(delay.current), [])

  return <>
    <button ref={anchor} type="button" className="signal-field-hint"
      aria-label={tr("ui.components.FieldHint.aria_label.5bb2d4e")} aria-describedby={open ? id : undefined}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onClick={show}>
      <HelpCircle size={14} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={popup} id={id} role="tooltip" className="signal-tooltip"
      style={position} onMouseEnter={cancelClose} onMouseLeave={hide}>{text}</div>, document.body)}
  </>
}
