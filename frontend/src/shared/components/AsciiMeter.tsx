// Adapted from facl/komari-ascii, src/components/ascii/AsciiProgress.tsx.
// MIT, Copyright (c) 2025 Montia37. Full license: third_party/licenses/komari-ascii-MIT.txt.
// Changes: semantic progress, finite/clamped inputs, unknown state, responsive segments,
// inherited Latitude tokens. No random or synthetic data.
import clsx from 'clsx'

export function AsciiMeter({ value, segments = 24, label, className }: {
  value: number | null
  segments?: number
  label: string
  className?: string
}) {
  const count = Math.min(60, Math.max(4, Math.floor(Number.isFinite(segments) ? segments : 24)))
  const percent = value !== null && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null
  const segmentArray = Array.from({ length: count }, (_, index) => percent !== null && percent >= (index + 1) * (100 / count))
  return (
    <div className={clsx('ascii-meter', className)} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}
      aria-valuetext={percent === null ? '尚未测量' : `${Math.round(percent)}%`}>
      <span className="ascii-meter-bracket" aria-hidden="true">[</span>
      <span className="ascii-meter-segments" aria-hidden="true">
        {segmentArray.map((active, index) => <span key={index} data-active={active || undefined} />)}
      </span>
      <span className="ascii-meter-bracket" aria-hidden="true">]</span>
      <span className="ascii-meter-value" aria-hidden="true">{percent === null ? '--' : `${Math.round(percent)}%`}</span>
    </div>
  )
}
