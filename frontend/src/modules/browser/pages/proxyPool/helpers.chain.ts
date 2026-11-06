import { tr } from '../../../../shared/i18n'
import type { ChainHopForm, ChainImportForm, ChainSocks5Config, ChainSocks5HopConfig, ImportCandidate } from './helpers.types'
import { CHAIN_SOCKS5_PREFIX } from './helpers.types'

export function parseChainSocks5Config(proxyConfig: string): ChainSocks5Config | null {
  const cfg = proxyConfig.trim()
  if (!cfg.toLowerCase().startsWith(CHAIN_SOCKS5_PREFIX)) {
    return null
  }

  const encoded = cfg.slice(CHAIN_SOCKS5_PREFIX.length)
  if (!encoded) {
    return null
  }

  const normalizeHop = (raw: unknown): ChainSocks5HopConfig | null => {
    if (!raw || typeof raw !== 'object') return null
    const hop = raw as Record<string, unknown>
    const protocol = String(hop.protocol || '').trim().toLowerCase()
    if (protocol && protocol !== 'socks5' && protocol !== 'http') return null

    const server = String(hop.server || '').trim()
    if (!server) return null

    const portVal = Number(hop.port || 0)
    if (!Number.isInteger(portVal) || portVal < 1 || portVal > 65535) return null

    const username = String(hop.username || '').trim()
    const password = hop.password === undefined || hop.password === null ? '' : String(hop.password)
    if (password && !username) return null

    return {
      protocol: protocol === 'http' ? 'http' : 'socks5',
      server,
      port: portVal,
      username: username || undefined,
      password: password || undefined,
    }
  }

  try {
    const decoded = decodeURIComponent(encoded)
    const parsed = JSON.parse(decoded) as Record<string, unknown>
    const first = normalizeHop(parsed.first)
    const second = normalizeHop(parsed.second)
    if (!first || !second) return null

    const localPortRaw = parsed.localPort
    const localPortNum = localPortRaw === undefined || localPortRaw === null || localPortRaw === ''
      ? 0
      : Number(localPortRaw)
    if (!Number.isInteger(localPortNum) || localPortNum < 0 || localPortNum > 65535) return null

    return {
      first,
      second,
      localPort: localPortNum > 0 ? localPortNum : undefined,
    }
  } catch {
    return null
  }
}

export function toChainImportForm(proxyName: string, proxyConfig: string): ChainImportForm | null {
  const cfg = parseChainSocks5Config(proxyConfig)
  if (!cfg) {
    return null
  }

  return {
    proxyName,
    localPort: cfg.localPort ? String(cfg.localPort) : '',
    first: {
      protocol: cfg.first.protocol,
      server: cfg.first.server,
      port: String(cfg.first.port),
      username: cfg.first.username || '',
      password: cfg.first.password || '',
    },
    second: {
      protocol: cfg.second.protocol,
      server: cfg.second.server,
      port: String(cfg.second.port),
      username: cfg.second.username || '',
      password: cfg.second.password || '',
    },
  }
}


export function buildChainImportCandidate(form: ChainImportForm): ImportCandidate {
  const parseHop = (label: string, hop: ChainHopForm): ChainSocks5HopConfig => {
    const protocol = hop.protocol === 'socks5' ? 'socks5' : 'http'
    const server = hop.server.trim()
    if (!server) {
      throw new Error(tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.ee16748", [label]))
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(server)) {
      throw new Error(tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.98d8e5a", [label]))
    }

    const portInput = hop.port.trim()
    if (!portInput) {
      throw new Error(tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.2221a30", [label]))
    }
    if (!/^\d+$/.test(portInput)) {
      throw new Error(tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.5b261b4", [label]))
    }

    const port = Number(portInput)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.4683711", [label]))
    }

    const username = hop.username.trim()
    const password = hop.password
    if (password && !username) {
      throw new Error(tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.94a80f7", [label]))
    }

    return {
      protocol,
      server,
      port,
      username: username || undefined,
      password: password || undefined,
    }
  }

  const localPortInput = form.localPort.trim()
  if (localPortInput && !/^\d+$/.test(localPortInput)) {
    throw new Error(tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.f444691"))
  }
  const localPort = localPortInput ? Number(localPortInput) : 0
  if (localPortInput && (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535)) {
    throw new Error(tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.50dbe6e"))
  }

  const payload: ChainSocks5Config = {
    first: parseHop(tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.059b5ee"), form.first),
    second: parseHop(tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.482605a"), form.second),
    localPort: localPort > 0 ? localPort : undefined,
  }

  return {
    proxyName: form.proxyName.trim() || tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.597a3b0", [payload.first.server, payload.second.server]),
    proxyConfig: `${CHAIN_SOCKS5_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`,
  }
}

function parseOptionalChainPort(raw: unknown, label: string): number | undefined {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return undefined
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(tr("browser.pages.proxyPool.helpers.chain.parseOptionalChainPort.ca68f65", [label]))
  }
  return value
}

function parseChainQuickImportHop(raw: unknown, label: string): ChainSocks5HopConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(tr("browser.pages.proxyPool.helpers.chain.parseChainQuickImportHop.b40b845", [label]))
  }

  const hop = raw as Record<string, unknown>
  const protocol = String(hop.protocol || 'socks5').trim().toLowerCase()
  if (protocol !== 'socks5' && protocol !== 'http') {
    throw new Error(tr("browser.pages.proxyPool.helpers.chain.parseChainQuickImportHop.fb8ddc2", [label]))
  }

  const server = String(hop.server || '').trim()
  if (!server) {
    throw new Error(tr("browser.pages.proxyPool.helpers.chain.parseChainQuickImportHop.bf41a7b", [label]))
  }

  const portValue = Number(hop.port)
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
    throw new Error(tr("browser.pages.proxyPool.helpers.chain.parseChainQuickImportHop.9bba10d", [label]))
  }

  const username = String(hop.username || '').trim()
  const password = hop.password === undefined || hop.password === null ? '' : String(hop.password)
  if (password && !username) {
    throw new Error(tr("browser.pages.proxyPool.helpers.chain.parseChainQuickImportHop.c81449b", [label]))
  }

  return {
    protocol: protocol === 'http' ? 'http' : 'socks5',
    server,
    port: portValue,
    username: username || undefined,
    password: password || undefined,
  }
}

export function parseChainImportJSON(raw: string): { form: ChainImportForm; groupName: string } {
  const text = raw.trim()
  if (!text) {
    throw new Error(tr("browser.pages.proxyPool.helpers.chain.parseChainImportJSON.00f2ec6"))
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(tr("browser.pages.proxyPool.helpers.chain.parseChainImportJSON.6d4c12f"))
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(tr("browser.pages.proxyPool.helpers.chain.parseChainImportJSON.27dafa3"))
  }

  const first = parseChainQuickImportHop(payload.first, tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.059b5ee"))
  const second = parseChainQuickImportHop(payload.second, tr("browser.components.ProxyImportModal.helpers.buildChainImportCandidate.482605a"))
  const localPort = parseOptionalChainPort(payload.localPort, 'localPort')
  const proxyName = String(payload.name ?? payload.proxyName ?? '').trim()
  const groupName = String(payload.group ?? payload.groupName ?? '').trim()

  return {
    form: {
      proxyName,
      localPort: localPort ? String(localPort) : '',
      first: {
        protocol: first.protocol,
        server: first.server,
        port: String(first.port),
        username: first.username || '',
        password: first.password || '',
      },
      second: {
        protocol: second.protocol,
        server: second.server,
        port: String(second.port),
        username: second.username || '',
        password: second.password || '',
      },
    },
    groupName,
  }
}
