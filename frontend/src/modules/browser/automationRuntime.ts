import { tr } from '../../shared/i18n'
import type { AutomationState } from '../settings/api'

export function getAutomationRuntimeBadgeVariant(state: AutomationState): 'default' | 'success' | 'error' | 'warning' {
  if (state.status.installing) return 'warning'
  if (state.status.ready) return 'success'
  if (state.status.lastError) return 'error'
  return 'default'
}

export function getAutomationRuntimeBadgeText(state: AutomationState): string {
  if (!state.settings.enabled) return tr("browser.automationRuntime.getAutomationRuntimeBadgeText.8bb38ef")
  if (state.status.installing) return tr("browser.automationRuntime.getAutomationRuntimeBadgeText.4f1f8aa")
  if (state.status.ready) return tr("browser.automationRuntime.getAutomationRuntimeBadgeText.f2afde8")
  if (state.status.installed) return tr("browser.automationRuntime.getAutomationRuntimeBadgeText.eb88ff5")
  if (state.status.lastError) return tr("browser.automationRuntime.getAutomationRuntimeBadgeText.5caf279")
  return tr("browser.automationRuntime.getAutomationRuntimeBadgeText.d5c8ade")
}

export function getAutomationNodeSource(state: AutomationState): string {
  return String(state.status.nodeSource || state.settings.nodeSource || 'auto').trim() || 'auto'
}

export function getAutomationNodeSourceLabel(nodeSource: string): string {
  switch (nodeSource) {
    case 'system':
      return tr("browser.automationRuntime.getAutomationNodeSourceLabel.7bd4748")
    case 'bundled':
      return tr("browser.automationRuntime.getAutomationNodeSourceLabel.fb8ac1a")
    default:
      return tr("browser.automationRuntime.getAutomationNodeSourceLabel.9741bc8")
  }
}

export function getAutomationNodeVersion(state: AutomationState): string {
  return state.status.nodeVersion || state.settings.nodeVersion || '-'
}

export function getAutomationPlaywrightVersion(state: AutomationState): string {
  return state.status.playwrightVersion || state.settings.playwrightVersion || '-'
}

export function getAutomationSystemNodePath(state: AutomationState): string {
  return state.status.systemNodePath || state.settings.systemNodePath || ''
}
