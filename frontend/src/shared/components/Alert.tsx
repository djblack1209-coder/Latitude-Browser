import { translateMessage } from '../i18n'
import { tr, useLocale } from '../i18n'
import { ReactNode } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'
import clsx from 'clsx'

type AlertType = 'success' | 'error' | 'warning' | 'info'

interface AlertProps {
  type?: AlertType
  title?: string
  message: ReactNode
  closable?: boolean
  onClose?: () => void
  showIcon?: boolean
  className?: string
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
}

const styles = {
  success: 'bg-[var(--color-success)]/15 border-[var(--color-success)]/30 text-[var(--color-success)]',
  error: 'bg-[var(--color-error)]/15 border-[var(--color-error)]/30 text-[var(--color-error)]',
  warning: 'bg-[var(--color-warning)]/15 border-[var(--color-warning)]/30 text-[var(--color-warning)]',
  info: 'bg-[var(--color-accent)]/15 border-[var(--color-accent)]/30 text-[var(--color-accent)]',
}

export function Alert({
  type = 'info',
  title,
  message,
  closable = false,
  onClose,
  showIcon = true,
  className,
}: AlertProps) {
  useLocale()

  const Icon = icons[type]

  return (
    <div
      role={type === 'error' ? "alert" : "status"}
      className={clsx(
        'signal-alert flex gap-3 p-4 border',
        styles[type],
        className
      )}
    >
      {showIcon && <Icon aria-hidden="true" className="w-5 h-5 flex-shrink-0 mt-0.5" />}

      <div className="flex-1 min-w-0">
        {title && (
          <h4 className="font-semibold mb-1 text-[var(--color-text-primary)]">{title}</h4>
        )}
        <div className="text-sm text-[var(--color-text-secondary)]">
          {translateMessage(message)}
        </div>
      </div>

      {closable && (
        <button
          type="button"
          aria-label={tr("ui.components.Alert.aria_label.c620893")}
          onClick={onClose}
          className="signal-dismiss flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
