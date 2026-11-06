import { translateMessage } from '../i18n'
import { tr, useLocale } from '../i18n'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { create } from 'zustand'
import { useNotificationStore } from '../../store/notificationStore'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(7)
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }))

    // 自动移除
    const duration = toast.duration ?? 3000
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }))
      }, duration)
    }
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))

// Toast 工具函数
function recordErrorNotification(message: string) {
  useNotificationStore.getState().addNotification({
    type: 'error',
    title: tr("ui.components.Toast.title.1d7fae6"),
    message,
  })
}

export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'success', message, duration }),
  error: (message: string, duration?: number) => {
    useToastStore.getState().addToast({ type: 'error', message, duration })
    recordErrorNotification(message)
  },
  warning: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'warning', message, duration }),
  info: (message: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'info', message, duration }),
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
}

const styles = {
  success: 'bg-[var(--color-bg-surface)] text-[var(--color-success)] border-[var(--color-success)]/30 shadow-lg shadow-[var(--color-success)]/5',
  error: 'bg-[var(--color-bg-surface)] text-[var(--color-error)] border-[var(--color-error)]/30 shadow-lg shadow-[var(--color-error)]/5',
  warning: 'bg-[var(--color-bg-surface)] text-[var(--color-warning)] border-[var(--color-warning)]/30 shadow-lg shadow-[var(--color-warning)]/5',
  info: 'bg-[var(--color-bg-surface)] text-[var(--color-accent)] border-[var(--color-accent)]/30 shadow-lg shadow-[var(--color-accent)]/5',
}

function ToastItem({ toast: t }: { toast: Toast }) {
  useLocale()

  const removeToast = useToastStore((state) => state.removeToast)
  const Icon = icons[t.type]

  return (
    <div
      role={t.type === 'error' ? "alert" : "status"}
      className={`signal-toast flex items-start gap-3 px-4 py-3 border animate-slide-in-right ${styles[t.type]}`}
    >
      <Icon aria-hidden="true" className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <p className="flex-1 min-w-0 break-words text-sm font-medium text-[var(--color-text-primary)]">{translateMessage(t.message)}</p>
      <button
        type="button"
        aria-label={tr("ui.components.Toast.aria_label.ef3b267")}
        onClick={() => removeToast(t.id)}
        className="signal-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export function ToastContainer() {
  useLocale()

  const toasts = useToastStore((state) => state.toasts)

  return (
    <div className="signal-toast-stack fixed top-4 right-4 z-[10000] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
