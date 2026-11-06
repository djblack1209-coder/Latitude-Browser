import { tr } from '../../../../shared/i18n'
import type { DirectImportForm, ImportCandidate } from './helpers.types'

function normalizeDirectProxyConfig(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^socket:\/\//i.test(trimmed)) {
    return trimmed.replace(/^socket:\/\//i, 'socks5://')
  }
  if (/^socks:\/\//i.test(trimmed)) {
    return trimmed.replace(/^socks:\/\//i, 'socks5://')
  }
  return trimmed
}

function resolveDirectProxyName(
  rawName: string,
  scheme: string,
  server: string,
  port: number,
  index: number,
  prefix: string,
): string {
  const name = rawName.trim()
  const fallbackName = server
    ? `${scheme.toUpperCase()}-${server}${port > 0 ? `:${port}` : ''}`
    : tr("browser.components.ProxyImportModal.helpers.resolveDirectProxyName.5712901", [index + 1])
  const finalName = name || fallbackName
  return prefix ? `${prefix}-${finalName}` : finalName
}

function formatDirectProxyHost(raw: string): string {
  const host = raw.trim()
  if (!host) return ''
  if (host.startsWith('[') && host.endsWith(']')) {
    return host
  }
  return host.includes(':') ? `[${host}]` : host
}

function normalizeDirectProtocol(raw: unknown): DirectImportForm['protocol'] {
  const protocol = String(raw || '').trim().toLowerCase()
  if (protocol === 'http' || protocol === 'https' || protocol === 'socks5') {
    return protocol
  }
  if (protocol === 'socks' || protocol === 'socket') {
    return 'socks5'
  }
  throw new Error(tr("browser.pages.proxyPool.helpers.direct.normalizeDirectProtocol.de327cb"))
}

export function parseDirectProxyURL(raw: string): DirectImportForm {
  const normalized = normalizeDirectProxyConfig(raw)
  if (!normalized) {
    throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectProxyURL.98d4782"))
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalized)) {
    throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectProxyURL.f006f9f"))
  }

  let parsedURL: URL
  try {
    parsedURL = new URL(normalized)
  } catch {
    throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectProxyURL.e845db6"))
  }

  const protocol = normalizeDirectProtocol(parsedURL.protocol.replace(/:$/, ''))
  const server = parsedURL.hostname.replace(/^\[(.*)\]$/, '$1').trim()
  if (!server) {
    throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectProxyURL.58e5dde"))
  }

  const port = Number(parsedURL.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectProxyURL.4cb5850"))
  }

  return {
    proxyName: '',
    protocol,
    server,
    port: String(port),
    username: parsedURL.username ? decodeURIComponent(parsedURL.username) : '',
    password: parsedURL.password ? decodeURIComponent(parsedURL.password) : '',
  }
}

export function toDirectImportForm(proxyName: string, proxyConfig: string): DirectImportForm | null {
  try {
    const form = parseDirectProxyURL(proxyConfig)
    return {
      ...form,
      proxyName,
    }
  } catch {
    return null
  }
}

export function buildDirectImportCandidate(form: DirectImportForm): ImportCandidate {
  const serverInput = form.server.trim()
  if (!serverInput) {
    throw new Error(tr("browser.components.ProxyImportModal.helpers.buildDirectImportCandidate.e568d77"))
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(serverInput)) {
    throw new Error(tr("browser.components.ProxyImportModal.helpers.buildDirectImportCandidate.1defaea"))
  }

  const portInput = form.port.trim()
  if (!portInput) {
    throw new Error(tr("browser.components.ProxyImportModal.helpers.buildDirectImportCandidate.42880dd"))
  }
  if (!/^\d+$/.test(portInput)) {
    throw new Error(tr("browser.components.ProxyImportModal.helpers.buildDirectImportCandidate.951cf39"))
  }

  const port = Number(portInput)
  if (port < 1 || port > 65535) {
    throw new Error(tr("browser.components.ProxyImportModal.helpers.buildDirectImportCandidate.9058228"))
  }

  const username = form.username.trim()
  const password = form.password
  if (password && !username) {
    throw new Error(tr("browser.components.ProxyImportModal.helpers.buildDirectImportCandidate.d8c921f"))
  }

  const auth = username
    ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@`
    : ''
  const rawConfig = `${form.protocol}://${auth}${formatDirectProxyHost(serverInput)}:${port}`

  let parsedURL: URL
  try {
    parsedURL = new URL(rawConfig)
  } catch {
    throw new Error(tr("browser.components.ProxyImportModal.helpers.buildDirectImportCandidate.f727921"))
  }

  if (!parsedURL.hostname) {
    throw new Error(tr("browser.components.ProxyImportModal.helpers.buildDirectImportCandidate.f727921"))
  }

  const normalizedConfig = normalizeDirectProxyConfig(parsedURL.toString()).replace(/\/$/, '')
  const normalizedServer = parsedURL.hostname.replace(/^\[(.*)\]$/, '$1')

  return {
    proxyName: resolveDirectProxyName(form.proxyName, form.protocol, normalizedServer, port, 0, ''),
    proxyConfig: normalizedConfig,
  }
}

interface ParsedDirectImportItem {
  form: DirectImportForm
  groupName: string
}

function parseDirectImportObject(payload: Record<string, unknown>, fallbackGroupName: string): ParsedDirectImportItem {
  const proxyName = String(payload.name ?? payload.proxyName ?? '').trim()
  const groupName = String(payload.group ?? payload.groupName ?? fallbackGroupName).trim()
  const proxyURL = String(payload.url ?? payload.proxyUrl ?? payload.proxy ?? payload.proxyConfig ?? '').trim()
  if (proxyURL) {
    const parsedForm = parseDirectProxyURL(proxyURL)
    return {
      form: {
        ...parsedForm,
        proxyName: proxyName || parsedForm.proxyName,
      },
      groupName,
    }
  }

  const protocol = normalizeDirectProtocol(payload.protocol ?? payload.scheme)
  const server = String(payload.server ?? payload.host ?? '').trim()
  if (!server) {
    throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectImportObject.36a2400"))
  }

  const portValue = Number(payload.port)
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
    throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectImportObject.8eae5ff"))
  }

  const username = String(payload.username ?? payload.user ?? '').trim()
  const password = payload.password === undefined || payload.password === null ? '' : String(payload.password)
  if (password && !username) {
    throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectImportObject.ef58b1c"))
  }

  return {
    form: {
      proxyName,
      protocol,
      server,
      port: String(portValue),
      username,
      password,
    },
    groupName,
  }
}

function parseDirectImportItems(raw: string): { items: ParsedDirectImportItem[]; defaultGroupName: string } {
  const text = raw.trim()
  if (!text) {
    throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectImportItems.90f1b4e"))
  }

  if (text.startsWith('{') || text.startsWith('[')) {
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      throw new Error(tr("browser.pages.proxyPool.helpers.chain.parseChainImportJSON.6d4c12f"))
    }

    let defaultGroupName = ''
    let sources: unknown[] = []
    if (Array.isArray(payload)) {
      sources = payload
    } else if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>
      defaultGroupName = String(record.group ?? record.groupName ?? '').trim()
      if (Array.isArray(record.proxies)) {
        sources = record.proxies
      } else if (Array.isArray(record.items)) {
        sources = record.items
      } else if (Array.isArray(record.list)) {
        sources = record.list
      } else {
        sources = [record]
      }
    } else {
      throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectImportItems.aaec107"))
    }

    const items = sources.map((item, index) => {
      if (typeof item === 'string') {
        return {
          form: parseDirectProxyURL(item),
          groupName: defaultGroupName,
        }
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectImportItems.4a228de", [index + 1]))
      }
      return parseDirectImportObject(item as Record<string, unknown>, defaultGroupName)
    })

    if (items.length === 0) {
      throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectImportItems.0f27e4f"))
    }
    return { items, defaultGroupName }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('//'))
  if (lines.length === 0) {
    throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectProxyURL.98d4782"))
  }

  return {
    items: lines.map((line) => ({
      form: parseDirectProxyURL(line),
      groupName: '',
    })),
    defaultGroupName: '',
  }
}

export function parseDirectImportText(raw: string): { form: DirectImportForm; groupName: string } {
  const { items } = parseDirectImportItems(raw)
  if (items.length !== 1) {
    throw new Error(tr("browser.pages.proxyPool.helpers.direct.parseDirectImportText.622d531"))
  }
  return items[0]
}

export function buildDirectImportCandidatesFromText(raw: string): { candidates: ImportCandidate[]; defaultGroupName: string } {
  const { items, defaultGroupName } = parseDirectImportItems(raw)
  return {
    candidates: items.map((item) => ({
      ...buildDirectImportCandidate(item.form),
      groupName: item.groupName,
    })),
    defaultGroupName,
  }
}
