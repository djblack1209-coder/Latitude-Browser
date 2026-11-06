import { tr, sourceText, localized } from '../../../shared/i18n'
const backgroundAttachMarkers = localized(() => ([
  sourceText("browser.utils.actionErrors.message.4e44769"),
  sourceText("browser.utils.actionErrors.message.faa8131"),
  sourceText("browser.utils.actionErrors.message.e5c49cf"),
]))

function extractActionMessage(error: unknown): string {
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : ''

  const normalized = message.trim()
  if (normalized) {
    return normalized
  }

  return ''
}

export function isBackgroundAttachMessage(message: string): boolean {
  return backgroundAttachMarkers.some(marker => message.includes(marker))
}

export function resolveActionFeedback(error: unknown, fallback: string): { message: string; tone: 'error' | 'warning'; pendingAttach: boolean } {
  const normalized = extractActionMessage(error)
  const message = normalized || tr("browser.utils.actionErrors.resolveActionFeedback.d2d2a9a", [fallback])
  const pendingAttach = isBackgroundAttachMessage(message)
  return {
    message,
    tone: pendingAttach ? 'warning' : 'error',
    pendingAttach,
  }
}

export function resolveActionErrorMessage(error: unknown, fallback: string): string {
  return resolveActionFeedback(error, fallback).message
}
