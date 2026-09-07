import clsx from 'clsx'

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

const statusColors = {
  normal: 'bg-[var(--color-accent)]',
  success: 'bg-[var(--color-success)]',
  error: 'bg-[var(--color-error)]',
  warning: 'bg-[var(--color-warning)]',
}

const sizeStyles = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

function normalizePercent(percent: number) {
  if (!Number.isFinite(percent)) return undefined
  return Math.min(100, Math.max(0, percent))
}

function resolveProgressName(ariaLabel?: string, ariaLabelledBy?: string) {
  return ariaLabel ?? (ariaLabelledBy ? undefined : '进度')
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
  const validPercent = normalizePercent(percent)

  return (
    <div className={clsx('flex items-center gap-3', className)}>
      <div
        role="progressbar"
        aria-label={resolveProgressName(ariaLabel, ariaLabelledBy)}
        aria-labelledby={ariaLabelledBy}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={validPercent}
        className={clsx('flex-1 bg-[var(--color-bg-muted)] rounded-full overflow-hidden', sizeStyles[size])}
      >
        {validPercent !== undefined && (
          <div
            className={clsx('h-full origin-left transition-transform duration-300 rounded-full', statusColors[status])}
            style={{ transform: `scaleX(${validPercent / 100})` }}
          />
        )}
      </div>
      {showInfo && (
        <span className="text-sm text-[var(--color-text-muted)] min-w-[3ch] text-right">
          {validPercent === undefined ? '—' : `${validPercent}%`}
        </span>
      )}
    </div>
  )
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
