import { tr } from '../../../shared/i18n'
import type { BrowserExtension, BrowserProxy } from '../types'

export const EXTENSION_HISTORY_STORAGE_KEY = 'ant-chrome.extensionManagement.history.v1'
export const EXTENSION_DOWNLOAD_PROXY_STORAGE_KEY = 'ant-chrome.extensionManagement.downloadProxy.v1'
export const EXTENSION_HISTORY_LIMIT = 100

export type ExtensionHistoryAction = 'lookup' | 'install' | 'import'

export interface ExtensionHistoryRecord {
  id: string
  action: ExtensionHistoryAction
  query: string
  extensionId: string
  name: string
  version: string
  storeUrl: string
  proxyLabel: string
  ok: boolean
  message: string
  createdAt: string
}

export interface ExtensionDownloadProxyPreference {
  useProxy: boolean
  proxyId: string
}

export function formatExtensionTime(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function buildChromeWebStoreQueryURL(value: string): string {
  const query = value.trim()
  if (!query) return 'https://chromewebstore.google.com/category/extensions'
  if (/^[a-p]{32}$/i.test(query)) return `https://chromewebstore.google.com/detail/${query.toLowerCase()}`
  try {
    const url = new URL(query)
    if (url.hostname.endsWith('chromewebstore.google.com')) return url.toString()
  } catch {
    // fall through to keyword search
  }
  return `https://chromewebstore.google.com/search/${encodeURIComponent(query)}`
}

export function loadExtensionHistory(): ExtensionHistoryRecord[] {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(EXTENSION_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ExtensionHistoryRecord => (
      item && typeof item.id === 'string' && typeof item.createdAt === 'string'
    )).slice(0, EXTENSION_HISTORY_LIMIT)
  } catch {
    return []
  }
}

export function saveExtensionHistory(records: ExtensionHistoryRecord[]) {
  if (typeof window === 'undefined' || !window.localStorage) return
  window.localStorage.setItem(EXTENSION_HISTORY_STORAGE_KEY, JSON.stringify(records.slice(0, EXTENSION_HISTORY_LIMIT)))
}

export function loadExtensionDownloadProxyPreference(): ExtensionDownloadProxyPreference {
  if (typeof window === 'undefined' || !window.localStorage) return { useProxy: false, proxyId: '' }
  try {
    const raw = window.localStorage.getItem(EXTENSION_DOWNLOAD_PROXY_STORAGE_KEY)
    if (!raw) return { useProxy: false, proxyId: '' }
    const parsed = JSON.parse(raw)
    return {
      useProxy: parsed?.useProxy === true,
      proxyId: typeof parsed?.proxyId === 'string' ? parsed.proxyId : '',
    }
  } catch {
    return { useProxy: false, proxyId: '' }
  }
}

export function saveExtensionDownloadProxyPreference(preference: ExtensionDownloadProxyPreference) {
  if (typeof window === 'undefined' || !window.localStorage) return
  window.localStorage.setItem(EXTENSION_DOWNLOAD_PROXY_STORAGE_KEY, JSON.stringify(preference))
}

export function createExtensionHistoryRecord(input: Omit<ExtensionHistoryRecord, 'id' | 'createdAt'>): ExtensionHistoryRecord {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input,
  }
}

export function extensionHistoryActionLabel(action: ExtensionHistoryAction): string {
  if (action === 'install') return tr("browser.pages.extensionManagementUtils.extensionHistoryActionLabel.087db63")
  if (action === 'import') return tr("browser.components.BrowserListLayout.text.60e2bca")
  return tr("browser.pages.extensionManagementUtils.extensionHistoryActionLabel.711363c")
}

export function getProxySpeedState(proxy: BrowserProxy): { ok: boolean; latencyMs: number; error: string } | undefined {
  if (!proxy.lastTestedAt) return undefined
  return {
    ok: proxy.lastTestOk === true,
    latencyMs: proxy.lastTestOk ? proxy.lastLatencyMs || 0 : 0,
    error: proxy.lastTestOk ? '' : tr("browser.pages.extensionManagementUtils.getProxySpeedState.2c056f1"),
  }
}

export function sameStringSet(first: string[], second: string[]): boolean {
  if (first.length !== second.length) return false
  const secondSet = new Set(second)
  return first.every((item) => secondSet.has(item))
}

export function parseExtensionManifest(manifestJson: string): Record<string, any> {
  try {
    const parsed = JSON.parse(manifestJson || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function getExtensionManifestMeta(item: BrowserExtension) {
  const manifest = parseExtensionManifest(item.manifestJson)
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions.filter(Boolean).map(String) : []
  const hostPermissions = Array.isArray(manifest.host_permissions) ? manifest.host_permissions.filter(Boolean).map(String) : []
  const manifestVersion = typeof manifest.manifest_version === 'number' ? manifest.manifest_version : undefined
  return {
    manifestVersion,
    permissions: permissions.slice(0, 3),
    hostPermissionCount: hostPermissions.length,
  }
}

export function formatExtensionSource(value: string): string {
  const source = value.trim()
  if (!source) return tr("browser.pages.extensionManagementUtils.formatExtensionSource.a48c554")
  if (/^https?:\/\//i.test(source)) return 'Chrome Web Store'
  if (/\.(crx|zip)$/i.test(source)) return tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.845e892")
  return tr("browser.automationScripts.metadata.getAutomationScriptSourceLabel.530997c")
}

export function extensionStoreURL(item: BrowserExtension): string {
  if (/^https?:\/\//i.test(item.sourceUrl)) return item.sourceUrl
  if (/^[a-p]{32}$/i.test(item.extensionId)) return `https://chromewebstore.google.com/detail/${item.extensionId}`
  return ''
}
