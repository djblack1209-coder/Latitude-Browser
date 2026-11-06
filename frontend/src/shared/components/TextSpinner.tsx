import { tr, useLocale } from '../i18n'
import { useEffect, useState } from 'react'

const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
export function TextSpinner({ label = tr("ui.components.Loading.Loading.ce56f61"), className = '', decorative = false }: { label?: string; className?: string; size?: 'sm' | 'md' | 'lg'; decorative?: boolean }) {
  useLocale()

  const [frame, setFrame] = useState(0)
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => setReduced(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  useEffect(() => {
    if (reduced) return
    const timer = setInterval(() => { if (!document.hidden) setFrame(value => (value + 1) % frames.length) }, 80)
    return () => clearInterval(timer)
  }, [reduced])
  return <span className={`terminal-spinner ${className}`} role={decorative ? undefined : "status"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : label}><span aria-hidden="true">{reduced ? '…' : frames[frame]}</span><span>{label}</span></span>
}
