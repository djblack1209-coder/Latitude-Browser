import { useLocale } from '../i18n'
import { ReactNode } from 'react'
import clsx from 'clsx'

interface CardProps {
  title?: ReactNode
  children: ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  actions?: ReactNode
  hover?: boolean
}

export function Card({
  title,
  children,
  className,
  padding = 'md',
  actions,
  hover = false
}: CardProps) {
  useLocale()

  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6',
  }

  return (
    <div
      className={clsx(
        'signal-panel relative rounded-[var(--radius-md)] overflow-hidden',
        'border border-[var(--color-border-default)] shadow-[var(--shadow-sm)]',
        'transition-[border-color,box-shadow,transform] duration-200 ease-out',
        hover && 'hover:shadow-[var(--shadow-md)] hover:border-[var(--color-border-strong)] hover:-translate-y-0.5',
        className
      )}
    >
      {(title || actions) && (
        <div className="signal-panel-header flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[var(--color-border-muted)]">
          <div className="min-w-0">
            {title && (
              <h3 className="text-[15px] font-semibold  text-[var(--color-text-primary)]">
                {title}
              </h3>
            )}

          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={paddings[padding]}>{children}</div>
    </div>
  )
}
