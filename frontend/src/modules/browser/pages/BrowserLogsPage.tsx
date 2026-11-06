import { getLocale, translateMessage } from '../../../shared/i18n'
import { tr, useLocale, localized } from '../../../shared/i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, toast } from '../../../shared/components'
import { SignalEmptyState, TerminalPanel, WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
import './network-pages.css'

interface LogEntry {
  time: string
  level: string
  component: string
  message: string
  method?: string
  durationMs?: number
  fields?: Record<string, unknown>
}

type LogView = 'all' | 'network' | 'runs'
type QuickFilter = 'ALL' | 'ERRORS' | 'SLOW' | 'FRONTEND' | 'BACKEND'

const LEVELS = ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR'] as const
const SENSITIVE_FIELD_NAMES = new Set(['password', 'token', 'secret'])
const NETWORK_COMPONENTS = new Set(['Xray', 'SingBox', 'Mihomo', 'Clash', 'SpeedTest', 'ProxyHTTPClient', 'ProxyCore', 'Tor'])
const RUN_COMPONENTS = new Set(['Automation', 'LaunchServer', 'Browser'])
const NETWORK_METHOD_PREFIXES = [
  'BrowserProxy',
  'GetProxyCheckSettings',
  'SaveBrowserProxies',
  'SaveProxyCheckSettings',
  'TestProxy',
  'ValidateProxyConfig',
  'GetTorStatus',
  'SetTorRuntimePath',
  'BrowserInstanceStart',
  'BrowserInstanceStop',
  'BrowserInstanceRestart',
]
const RUN_METHOD_PREFIXES = [
  'AutomationDemoLaunchProfile',
  'AutomationProbeSystemNode',
  'AutomationRuntimeSelfCheck',
  'AutomationScriptRun',
  'GetAutomationState',
  'GetLaunchServerInfo',
  'InstallAutomationRuntime',
  'SaveAutomationRuntimeSettings',
  'SaveAutomationSettings',
  'SaveLaunchServerSettings',
  'StartInstanceWithParams',
  'BrowserInstanceStart',
  'BrowserInstanceStop',
  'BrowserInstanceRestart',
]

const VIEW_CONFIG: Record<LogView, { eyebrow: string; title: string; description: string; terminalTitle: string; emptyTitle: string }> = localized(() => ({
  all: {
    eyebrow: 'RUNTIME / LOGS',
    title: tr("config.navigation.config.name.53a41da"),
    description: tr("browser.pages.BrowserLogsPage.description.9515b69"),
    terminalTitle: tr("browser.pages.BrowserLogsPage.terminalTitle.c9f518a"),
    emptyTitle: tr("browser.pages.BrowserLogsPage.emptyTitle.03c5a70"),
  },
  network: {
    eyebrow: 'NETWORK / DIAGNOSTICS',
    title: tr("browser.pages.BrowserLogsPage.title.99d823c"),
    description: tr("browser.pages.BrowserLogsPage.description.3d3b216"),
    terminalTitle: tr("browser.pages.BrowserLogsPage.terminalTitle.45d5a57"),
    emptyTitle: tr("browser.pages.BrowserLogsPage.emptyTitle.1fee0dc"),
  },
  runs: {
    eyebrow: 'AUTOMATION / RUNS',
    title: tr("browser.pages.BrowserLogsPage.title.b0613f0"),
    description: tr("browser.pages.BrowserLogsPage.description.7cb895a"),
    terminalTitle: tr("browser.pages.BrowserLogsPage.terminalTitle.53a0d37"),
    emptyTitle: tr("browser.pages.BrowserLogsPage.emptyTitle.ecf289f"),
  },
}))

function resolveLogView(value: string | null): LogView {
  if (value === 'network' || value === 'runs') return value
  return 'all'
}

function getMethod(entry: LogEntry) {
  return String(entry.method || entry.fields?.method || '')
}

function getDuration(entry: LogEntry) {
  const value = Number(entry.durationMs ?? entry.fields?.duration_ms ?? entry.fields?.durationMs ?? 0)
  return Number.isFinite(value) ? value : 0
}

function hasMethodPrefix(method: string, prefixes: string[]) {
  return prefixes.some(prefix => method.startsWith(prefix))
}

function belongsToView(entry: LogEntry, view: LogView) {
  if (view === 'all') return true
  const method = getMethod(entry)
  if (view === 'network') {
    return NETWORK_COMPONENTS.has(entry.component) || hasMethodPrefix(method, NETWORK_METHOD_PREFIXES)
  }
  return RUN_COMPONENTS.has(entry.component) || hasMethodPrefix(method, RUN_METHOD_PREFIXES)
}

function redactKnownSensitiveFields(value: unknown, fieldName = ''): unknown {
  if (SENSITIVE_FIELD_NAMES.has(fieldName.toLowerCase())) return '[REDACTED]'
  if (Array.isArray(value)) return value.map(item => redactKnownSensitiveFields(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactKnownSensitiveFields(item, key)]),
    )
  }
  return value
}

function serializeFields(fields?: Record<string, unknown>) {
  if (!fields || Object.keys(fields).length === 0) return ''
  try {
    return JSON.stringify(redactKnownSensitiveFields(fields))
  } catch {
    return tr("browser.pages.BrowserLogsPage.serializeFields.c63ac3d")
  }
}

function formatFields(fields?: Record<string, unknown>) {
  const redacted = redactKnownSensitiveFields(fields || {}) as Record<string, unknown>
  try {
    return JSON.stringify(redacted, null, 2)
  } catch {
    return tr("browser.pages.BrowserLogsPage.serializeFields.c63ac3d")
  }
}

function levelVariant(level: string): 'default' | 'info' | 'warning' | 'error' {
  switch (level) {
    case 'ERROR': return 'error'
    case 'WARN': return 'warning'
    case 'DEBUG': return 'default'
    default: return 'info'
  }
}

async function fetchLogs(): Promise<LogEntry[]> {
  const app = (globalThis as any).go?.main?.App
  if (!app || typeof app.GetAppLogs !== 'function') {
    throw new Error(tr("browser.pages.BrowserLogsPage.fetchLogs.db5d414"))
  }
  const bindings: any = await import('../../../wailsjs/go/main/App')
  const entries = await bindings.GetAppLogs()
  if (!Array.isArray(entries)) throw new Error(tr("browser.pages.BrowserLogsPage.fetchLogs.66eb8d2"))
  return entries
}

async function clearLogs() {
  const app = (globalThis as any).go?.main?.App
  if (!app || typeof app.ClearAppLogs !== 'function') {
    throw new Error(tr("browser.pages.BrowserLogsPage.fetchLogs.db5d414"))
  }
  const bindings: any = await import('../../../wailsjs/go/main/App')
  await bindings.ClearAppLogs()
}

export function BrowserLogsPage() {
  const uiLocale = useLocale()

  const [searchParams] = useSearchParams()
  const view = resolveLogView(searchParams.get('view'))
  const viewConfig = VIEW_CONFIG[view]
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [levelFilter, setLevelFilter] = useState('ALL')
  const [componentFilter, setComponentFilter] = useState('ALL')
  const [methodFilter, setMethodFilter] = useState('ALL')
  const [keyword, setKeyword] = useState('')
  const [fieldKeyword, setFieldKeyword] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL')
  const [durationMin, setDurationMin] = useState('')
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const [autoScroll, setAutoScroll] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [readError, setReadError] = useState('')
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const initialScrollDoneRef = useRef(false)
  const latestLoadIdRef = useRef(0)
  const manualLoadCountRef = useRef(0)

  const scrollLogsToBottom = (behavior: ScrollBehavior = 'auto') => {
    requestAnimationFrame(() => {
      const container = logContainerRef.current
      if (!container) return
      container.scrollTo({ top: container.scrollHeight, behavior })
    })
  }

  const load = useCallback(async (silent = false) => {
    const requestId = ++latestLoadIdRef.current
    if (!silent) {
      manualLoadCountRef.current += 1
      setLoading(true)
    }
    try {
      const data = await fetchLogs()
      if (requestId !== latestLoadIdRef.current) return
      setLogs(data)
      setReadError('')
      setLastLoadedAt(new Date())
    } catch (error) {
      if (requestId !== latestLoadIdRef.current) return
      setReadError(error instanceof Error ? error.message : tr("browser.pages.BrowserLogsPage.BrowserLogsPage.aa2684e"))
    } finally {
      if (!silent) {
        manualLoadCountRef.current = Math.max(0, manualLoadCountRef.current - 1)
        if (manualLoadCountRef.current === 0) setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => void load(true), 3000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, load])

  useEffect(() => {
    setComponentFilter('ALL')
    setMethodFilter('ALL')
    setQuickFilter('ALL')
    initialScrollDoneRef.current = false
  }, [view])

  const viewRows = useMemo(() => logs
    .filter(entry => belongsToView(entry, view))
    .map((entry, index) => ({
      entry,
      line: index + 1,
      method: getMethod(entry),
      duration: getDuration(entry),
      serializedFields: serializeFields(entry.fields),
    })), [logs, view, uiLocale])

  const components = useMemo(() => Array.from(new Set(viewRows.map(row => row.entry.component).filter(Boolean))).sort(), [viewRows, uiLocale])
  const methods = useMemo(() => Array.from(new Set(viewRows.map(row => row.method).filter(Boolean))).sort(), [viewRows, uiLocale])

  const filteredRows = useMemo(() => viewRows.filter(row => {
    const { entry, method, duration, serializedFields } = row
    if (levelFilter !== 'ALL' && entry.level !== levelFilter) return false
    if (componentFilter !== 'ALL' && entry.component !== componentFilter) return false
    if (methodFilter !== 'ALL' && method !== methodFilter) return false
    if (quickFilter === 'ERRORS' && entry.level !== 'ERROR') return false
    if (quickFilter === 'SLOW' && duration < 1000) return false
    if (quickFilter === 'FRONTEND' && entry.component !== 'Frontend') return false
    if (quickFilter === 'BACKEND' && entry.component === 'Frontend') return false
    if (durationMin && duration < Number(durationMin)) return false
    if (timeFrom && entry.time < timeFrom.replace('T', ' ')) return false
    if (timeTo && entry.time > timeTo.replace('T', ' ')) return false
    const fieldText = serializedFields.toLowerCase()
    const query = keyword.trim().toLowerCase()
    if (query && !entry.message.toLowerCase().includes(query) &&
        !entry.component.toLowerCase().includes(query) &&
        !method.toLowerCase().includes(query) &&
        !fieldText.includes(query)) return false
    const fieldQuery = fieldKeyword.trim().toLowerCase()
    if (fieldQuery && !fieldText.includes(fieldQuery)) return false
    return true
  }), [componentFilter, durationMin, fieldKeyword, keyword, levelFilter, methodFilter, quickFilter, timeFrom, timeTo, viewRows, uiLocale])

  useEffect(() => {
    if (autoScroll) scrollLogsToBottom('auto')
  }, [autoScroll, filteredRows.length])

  useEffect(() => {
    if (initialScrollDoneRef.current || loading || filteredRows.length === 0) return
    initialScrollDoneRef.current = true
    scrollLogsToBottom('auto')
  }, [filteredRows.length, loading])

  const handleClear = async () => {
    setClearing(true)
    try {
      await clearLogs()
      latestLoadIdRef.current += 1
      setLogs([])
      setReadError('')
      initialScrollDoneRef.current = false
      toast.success(tr("browser.pages.BrowserLogsPage.BrowserLogsPage.a1850d5"))
    } catch (error) {
      const message = error instanceof Error ? error.message : tr("browser.pages.BrowserLogsPage.BrowserLogsPage.2e0e7f9")
      toast.error(tr("browser.pages.BrowserLogsPage.BrowserLogsPage.a32e7cf", [message]))
    } finally {
      setClearing(false)
    }
  }

  const resetFilters = () => {
    setLevelFilter('ALL')
    setComponentFilter('ALL')
    setMethodFilter('ALL')
    setQuickFilter('ALL')
    setKeyword('')
    setFieldKeyword('')
    setDurationMin('')
    setTimeFrom('')
    setTimeTo('')
  }

  const advancedFilterCount = [componentFilter !== 'ALL', methodFilter !== 'ALL', !!fieldKeyword, !!durationMin, !!timeFrom, !!timeTo]
    .filter(Boolean).length
  const lastReadLabel = lastLoadedAt
    ? lastLoadedAt.toLocaleTimeString(getLocale(), { hour12: false })
    : tr("browser.pages.BrowserLogsPage.BrowserLogsPage.988836e")

  return (
    <div className="network-page network-logs-page space-y-4">
      <WorkspaceHeader

        title={viewConfig.title}

        className="network-workspace-header"
        actions={(
          <>
            <label className="network-auto-refresh-control">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={event => setAutoRefresh(event.target.checked)}
                aria-label={tr("browser.pages.BrowserLogsPage.aria_label.8b57086")}
              />
              <span className="network-auto-refresh-track" aria-hidden="true"><span /></span>
              <span className="network-auto-refresh-copy">
                <strong>{tr("browser.pages.BrowserLogsPage.text.297a7ec")}</strong>
                <small>{autoRefresh ? tr("browser.pages.BrowserLogsPage.BrowserLogsPage.ca4e0b3") : tr("browser.pages.BrowserLogsPage.BrowserLogsPage.fcbae46")}</small>
              </span>
            </label>
            <Button variant="secondary" size="sm" onClick={() => void load()} loading={loading} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.components.AutomationRuntimeSnapshot.text.38108ea")}</Button>
            <Button variant="secondary" size="sm" onClick={() => void handleClear()} loading={clearing} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.pages.BrowserLogsPage.text.84fcd70")}</Button>
          </>
        )}
      >

      </WorkspaceHeader>

      <section className="network-log-controls" aria-label={tr("browser.pages.BrowserLogsPage.aria_label.c8082c8")}>
        <div className="network-log-filter-row">
          <div className="network-filter-buttons" aria-label={tr("browser.pages.BrowserLogsPage.aria_label.03ca0fa")}>
            {LEVELS.map(level => (
              <button
                type="button"
                key={level}
                onClick={() => setLevelFilter(level)}
                aria-pressed={levelFilter === level}
                data-active={levelFilter === level ? "true" : "false"}
              >
                {level}
              </button>
            ))}
          </div>
          <div className="network-filter-buttons network-quick-filters" aria-label={tr("browser.pages.BrowserLogsPage.aria_label.582419b")}>
            {([
              ['ALL', tr("browser.components.GroupTreeNav.text.778fc8f")],
              ['ERRORS', tr("browser.pages.BrowserLogsPage.BrowserLogsPage.768e7f1")],
              ['SLOW', tr("browser.pages.BrowserLogsPage.BrowserLogsPage.923101c")],
              ['FRONTEND', tr("browser.pages.BrowserLogsPage.BrowserLogsPage.3d9fa23")],
              ['BACKEND', tr("browser.pages.BrowserLogsPage.BrowserLogsPage.13cfabd")],
            ] as Array<[QuickFilter, string]>).map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setQuickFilter(value)}
                aria-pressed={quickFilter === value}
                data-active={quickFilter === value ? "true" : "false"}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="network-log-count">{filteredRows.length} / {viewRows.length}{tr("browser.pages.BrowserLogsPage.text.eb8c2d5")}</span>
        </div>

        <div className="network-log-search-row">
          <label className="network-field network-log-search">
            <span>{tr("browser.pages.BrowserLogsPage.text.f040908")}</span>
            <input
              value={keyword}
              onChange={event => setKeyword(event.target.value)}
              placeholder={tr("browser.pages.BrowserLogsPage.placeholder.64ee559")}
            />
          </label>
          <label className="network-auto-scroll-control">
            <input type="checkbox" checked={autoScroll} onChange={event => setAutoScroll(event.target.checked)} />
            <span>{tr("browser.pages.BrowserLogsPage.text.43abbba")}</span>
          </label>
          <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.pages.BrowserLogsPage.text.b63e282")}</Button>
        </div>

        <details className="network-advanced-filters">
          <summary>
            <span><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.pages.BrowserLogsPage.text.6ac0ea8")}</span>
            <span>{advancedFilterCount > 0 ? tr("browser.pages.BrowserLogsPage.BrowserLogsPage.f15c6df", [advancedFilterCount]) : tr("browser.pages.BrowserLogsPage.BrowserLogsPage.eaa62e1")}</span>
          </summary>
          <div className="network-advanced-filter-grid">
            <label className="network-field">
              <span>{tr("browser.pages.BrowserLogsPage.text.7359f06")}</span>
              <select value={componentFilter} onChange={event => setComponentFilter(event.target.value)}>
                <option value="ALL">{tr("browser.pages.BrowserLogsPage.text.b5e6890")}</option>
                {components.map(component => <option key={component} value={component}>{component}</option>)}
              </select>
            </label>
            <label className="network-field">
              <span>{tr("browser.pages.BrowserLogsPage.text.b77e2ac")}</span>
              <select value={methodFilter} onChange={event => setMethodFilter(event.target.value)}>
                <option value="ALL">{tr("browser.pages.BrowserLogsPage.text.08d8d0e")}</option>
                {methods.map(method => <option key={method} value={method}>{method}</option>)}
              </select>
            </label>
            <label className="network-field">
              <span>{tr("browser.pages.BrowserLogsPage.text.404fab0")}</span>
              <input value={fieldKeyword} onChange={event => setFieldKeyword(event.target.value)} placeholder={tr("browser.pages.BrowserLogsPage.placeholder.117d30c")} />
            </label>
            <label className="network-field">
              <span>{tr("browser.pages.BrowserLogsPage.text.4377ddf")}</span>
              <input type="number" min="0" value={durationMin} onChange={event => setDurationMin(event.target.value)} placeholder={tr("browser.pages.BrowserLogsPage.placeholder.f3c3d56")} />
            </label>
            <label className="network-field">
              <span>{tr("browser.pages.BrowserLogsPage.text.e8868af")}</span>
              <input type="datetime-local" value={timeFrom} onChange={event => setTimeFrom(event.target.value)} />
            </label>
            <label className="network-field">
              <span>{tr("browser.components.AutomationScriptHistoryModal.label.a0bb9f4")}</span>
              <input type="datetime-local" value={timeTo} onChange={event => setTimeTo(event.target.value)} />
            </label>
          </div>
        </details>
      </section>

      <TerminalPanel
        title={viewConfig.terminalTitle}
        className="network-log-terminal"
        meta={<span>{readError ? tr("browser.pages.BrowserLogsPage.BrowserLogsPage.442d940") : tr("browser.pages.BrowserLogsPage.BrowserLogsPage.f90ae4a", [lastReadLabel])}</span>}
      >
        {readError && (
          <div className="network-log-error" role="alert">
            <strong>{tr("browser.pages.BrowserLogsPage.text.e855c69")}</strong>
            <span>{translateMessage(readError)}。{logs.length > 0 ? tr("browser.pages.BrowserLogsPage.BrowserLogsPage.ebcb354") : tr("browser.pages.BrowserLogsPage.BrowserLogsPage.25fc8cd")}</span>
          </div>
        )}
        <div ref={logContainerRef} className="network-log-viewport">
          {loading && logs.length === 0 ? (
            <SignalEmptyState symbol="logs" title={tr("browser.pages.BrowserLogsPage.title.3534e6f")}  />
          ) : readError && logs.length === 0 ? (
            <SignalEmptyState
              symbol="logs"
              title={tr("browser.pages.BrowserLogsPage.title.3ec024d")}

              action={<Button size="sm" variant="secondary" onClick={() => void load()}>{tr("browser.pages.AutoConfigPage.text.7784972")}</Button>}
            />
          ) : filteredRows.length === 0 ? (
            <SignalEmptyState
              symbol="logs"
              title={viewRows.length === 0 ? viewConfig.emptyTitle : tr("browser.pages.BrowserLogsPage.BrowserLogsPage.1addc7f")}

              action={viewRows.length > 0 ? <Button size="sm" variant="secondary" onClick={resetFilters}>{tr("browser.components.BrowserProfilesPanel.text.4bbc4e5")}</Button> : undefined}
            />
          ) : (
            <table className="network-log-table">
              <thead>
                <tr>
                  <th aria-label={tr("browser.pages.BrowserLogsPage.aria_label.f81e575")}>#</th>
                  <th>{tr("browser.pages.BrowserLogsPage.text.89b4aa6")}</th>
                  <th>{tr("browser.pages.BrowserLogsPage.text.2548499")}</th>
                  <th>{tr("browser.pages.BrowserLogsPage.text.7359f06")}</th>
                  <th>{tr("browser.pages.BrowserLogsPage.text.dc6de3f")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(({ entry, line, method, duration }) => {
                  const fieldCount = entry.fields ? Object.keys(entry.fields).length : 0
                  return (
                    <tr key={`${entry.time}-${entry.component}-${line}`} data-level={entry.level}>
                      <td className="network-log-line">{String(line).padStart(3, '0')}</td>
                      <td className="network-log-time">{entry.time}</td>
                      <td><Badge variant={levelVariant(entry.level)} className="network-log-level">{entry.level}</Badge></td>
                      <td className="network-log-component" title={entry.component}>{entry.component || tr("ui.modules.browser.pages.BrowserLogsPage.label.bc7819b")}</td>
                      <td className="network-log-message">
                        <div>
                          <span>{translateMessage(entry.message)}</span>
                          {(method || duration > 0) && (
                            <span className="network-log-inline-meta">
                              {method && `method=${method}`}{method && duration > 0 ? ' ' : ''}{duration > 0 && `duration=${duration}ms`}
                            </span>
                          )}
                        </div>
                        {fieldCount > 0 && (
                          <details className="network-log-fields">
                            <summary>{tr("browser.pages.BrowserLogsPage.text.e8781df")}{fieldCount}</summary>
                            <pre>{formatFields(entry.fields)}</pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </TerminalPanel>
    </div>
  )
}
