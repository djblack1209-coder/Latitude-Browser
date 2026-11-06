import { AsciiMeter } from './AsciiMeter'
import { tr, useLocale } from '../i18n'

type ProgressStatus = 'normal' | 'success' | 'error' | 'warning'

interface ProgressA11yProps {
  'aria-label'?: string
  'aria-labelledby'?: string
}

interface ProgressProps extends ProgressA11yProps {
  percent: number
  status?: ProgressStatus
  showInfo?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function normalizePercent(percent: number) {
  if (!Number.isFinite(percent)) return undefined
  return Math.min(100, Math.max(0, percent))
}

function resolveProgressName(ariaLabel?: string, ariaLabelledBy?: string) {
  return ariaLabel ?? (ariaLabelledBy ? undefined : tr("ui.components.Progress.resolveProgressName.acf014b"))
}

export function Progress({
  percent,
  status = 'normal',
  showInfo = true,
  size = 'md',
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: ProgressProps) {
  useLocale()

  const validPercent = normalizePercent(percent)

  return <div data-size={size} data-status={status} className={className}><AsciiMeter value={validPercent ?? null} label={resolveProgressName(ariaLabel, ariaLabelledBy) || tr('common.loading')} showValue={showInfo} /></div>
}

// 圆形进度条
interface CircleProgressProps extends ProgressA11yProps {
  percent: number
  size?: number
  strokeWidth?: number
  status?: ProgressStatus
  showInfo?: boolean
}

export function CircleProgress({
  percent,
  size = 120,
  strokeWidth = 8,
  status = 'normal',
  showInfo = true,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: CircleProgressProps) {
  useLocale()

  const validPercent = normalizePercent(percent)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = validPercent === undefined
    ? undefined
    : circumference - (validPercent / 100) * circumference

  const colors = {
    normal: 'var(--color-accent)',
    success: 'var(--color-success)',
    error: 'var(--color-error)',
    warning: 'var(--color-warning)',
  }

  return (
    <div
      role="progressbar"
      aria-label={resolveProgressName(ariaLabel, ariaLabelledBy)}
      aria-labelledby={ariaLabelledBy}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={validPercent}
      className="relative inline-flex items-center justify-center"
    >
      <svg aria-hidden="true" width={size} height={size} className="transform -rotate-90">
        {/* 背景圆 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-bg-muted)"
          strokeWidth={strokeWidth}
        />
        {/* 进度圆 */}
        {offset !== undefined && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colors[status]}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset] duration-300"
          />
        )}
      </svg>
      {showInfo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold text-[var(--color-text-primary)]">
            {validPercent === undefined ? '—' : `${validPercent}%`}
          </span>
        </div>
      )}
    </div>
  )
}
