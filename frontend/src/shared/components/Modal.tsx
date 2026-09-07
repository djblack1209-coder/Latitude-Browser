import { ReactNode, useEffect, useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  width?: string
  closable?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
}

interface OpenModal {
  id: string
  element: HTMLDivElement
}

const openModals: OpenModal[] = []
let bodyOverflowBeforeModal: string | null = null

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',')

function isAvailableForFocus(element: HTMLElement) {
  if (!element.isConnected || element.tabIndex < 0) return false
  if (element.matches(':disabled, [aria-disabled="true"]')) return false
  if (element.closest('[inert], [hidden], [aria-hidden="true"]')) return false

  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(isAvailableForFocus)
}

function focusInside(dialog: HTMLDivElement, preferLast = false) {
  const focusableElements = getFocusableElements(dialog)
  const preferredElement = dialog.querySelector<HTMLElement>('[autofocus], [data-autofocus="true"]')
  const target = !preferLast && preferredElement && isAvailableForFocus(preferredElement)
    ? preferredElement
    : (preferLast ? focusableElements[focusableElements.length - 1] : focusableElements[0])

  ;(target ?? dialog).focus({ preventScroll: true })
}

function registerOpenModal(modal: OpenModal) {
  const existingIndex = openModals.findIndex((item) => item.id === modal.id)
  if (existingIndex >= 0) openModals.splice(existingIndex, 1)

  if (openModals.length === 0) {
    bodyOverflowBeforeModal = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }

  openModals.push(modal)
}

function unregisterOpenModal(id: string) {
  const modalIndex = openModals.findIndex((item) => item.id === id)
  if (modalIndex >= 0) openModals.splice(modalIndex, 1)

  if (openModals.length === 0 && bodyOverflowBeforeModal !== null) {
    document.body.style.overflow = bodyOverflowBeforeModal
    bodyOverflowBeforeModal = null
  }
}

function isTopModal(id: string) {
  return openModals[openModals.length - 1]?.id === id
}

function canRestoreFocus(element: HTMLElement) {
  if (element === document.body || !element.isConnected) return false
  if (element.matches(':disabled, [aria-disabled="true"]')) return false
  if (element.closest('[inert], [hidden], [aria-hidden="true"]')) return false

  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = '500px',
  closable = true,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: ModalProps) {
  const generatedId = useId()
  const modalId = `modal-${generatedId}`
  const titleId = title ? `${modalId}-title` : undefined
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useLayoutEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useLayoutEffect(() => {
    if (!open) return

    const dialog = dialogRef.current
    if (!dialog) return

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    registerOpenModal({ id: modalId, element: dialog })
    focusInside(dialog)

    return () => {
      const wasTopModal = isTopModal(modalId)
      unregisterOpenModal(modalId)
      if (!wasTopModal) return

      if (previouslyFocused && canRestoreFocus(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true })
        return
      }

      const nextModal = openModals[openModals.length - 1]
      if (nextModal) focusInside(nextModal.element)
    }
  }, [modalId, open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog || !isTopModal(modalId)) return

      if (event.key === 'Escape' && closable) {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements(dialog)
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }

      const activeElement = document.activeElement
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (!activeElement || !dialog.contains(activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? lastElement : firstElement).focus({ preventScroll: true })
      } else if (event.shiftKey && (activeElement === firstElement || activeElement === dialog)) {
        event.preventDefault()
        lastElement.focus({ preventScroll: true })
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus({ preventScroll: true })
      }
    }

    const handleFocusIn = (event: FocusEvent) => {
      const dialog = dialogRef.current
      const target = event.target
      if (!dialog || !isTopModal(modalId) || !(target instanceof Node)) return
      if (!dialog.contains(target)) focusInside(dialog)
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocusIn, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocusIn, true)
    }
  }, [closable, modalId, open])

  if (!open) return null

  const resolvedLabelledBy = ariaLabelledBy ?? (ariaLabel ? undefined : titleId)
  const resolvedLabel = ariaLabel ?? (!resolvedLabelledBy ? '对话框' : undefined)

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px] animate-fade-in"
        onClick={closable ? onClose : undefined}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={resolvedLabel}
        aria-labelledby={resolvedLabelledBy}
        tabIndex={-1}
        className="signal-panel relative bg-[var(--color-bg-elevated)] rounded-lg shadow-[var(--shadow-lg)] animate-scale-in max-h-[90vh] w-full flex flex-col"
        style={{ width, maxWidth: '90vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || closable) && (
          <div className="signal-panel-header flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] flex-shrink-0">
            {title && (
              <h3 id={titleId} className="text-lg font-semibold text-[var(--color-text-primary)]">
                {title}
              </h3>
            )}
            {closable && (
              <button
                type="button"
                aria-label="关闭"
                onClick={onClose}
                className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] transition-colors ml-auto"
              >
                <X aria-hidden="true" className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-3 bg-[var(--color-bg-subtle)] px-6 py-4 border-t border-[var(--color-border)] flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// 确认对话框
interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  content: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = '确认',
  content,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="400px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {cancelText}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="text-[var(--color-text-secondary)]">{content}</div>
    </Modal>
  )
}
