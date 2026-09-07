import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, toast } from '../../../shared/components'
import { SignalEmptyState, TelemetryStrip, TerminalPanel, WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
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

const VIEW_CONFIG: Record<LogView, { eyebrow: string; title: string; description: string; terminalTitle: string; emptyTitle: string }> = {
  all: {
    eyebrow: 'RUNTIME / LOGS',
    title: '日志与诊断',
    description: '查看内存缓冲中的运行日志。',
    terminalTitle: '应用内存缓冲 · 全部日志',
    emptyTitle: '当前没有应用日志',
  },
  network: {
    eyebrow: 'NETWORK / DIAGNOSTICS',
    title: '网络诊断日志',
    description: '筛选代理组件日志；不代表泄漏检测结果。',
    terminalTitle: '应用内存缓冲 · 网络类别',
    emptyTitle: '当前没有网络类别日志',
  },
  runs: {
    eyebrow: 'AUTOMATION / RUNS',
    title: '运行相关日志',
    description: '筛选自动化与实例运行日志。',
    terminalTitle: '应用内存缓冲 · 运行类别',
    emptyTitle: '当前没有运行类别日志',
  },
}

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
    return '[字段无法序列化]'
  }
}

function formatFields(fields?: Record<string, unknown>) {
  const redacted = redactKnownSensitiveFields(fields || {}) as Record<string, unknown>
  try {
    return JSON.stringify(redacted, null, 2)
  } catch {
    return '[字段无法序列化]'
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
    throw new Error('日志桥接尚未就绪')
  }
  const bindings: any = await import('../../../wailsjs/go/main/App')
  const entries = await bindings.GetAppLogs()
  if (!Array.isArray(entries)) throw new Error('日志数据格式异常')
  return entries
}

async function clearLogs() {
  const app = (globalThis as any).go?.main?.App
  if (!app || typeof app.ClearAppLogs !== 'function') {
    throw new Error('日志桥接尚未就绪')
  }
  const bindings: any = await import('../../../wailsjs/go/main/App')
  await bindings.ClearAppLogs()
}

export function BrowserLogsPage() {
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
      setReadError(error instanceof Error ? error.message : '读取日志失败')
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
    })), [logs, view])

  const components = useMemo(() => Array.from(new Set(viewRows.map(row => row.entry.component).filter(Boolean))).sort(), [viewRows])
  const methods = useMemo(() => Array.from(new Set(viewRows.map(row => row.method).filter(Boolean))).sort(), [viewRows])

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
  }), [componentFilter, durationMin, fieldKeyword, keyword, levelFilter, methodFilter, quickFilter, timeFrom, timeTo, viewRows])

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
      toast.success('内存日志已清空')
    } catch (error) {
      const message = error instanceof Error ? error.message : '清空日志失败'
      toast.error(`${message}，已保留当前记录`)
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
  const errors = viewRows.filter(row => row.entry.level === 'ERROR').length
  const warnings = viewRows.filter(row => row.entry.level === 'WARN').length
  const lastReadLabel = lastLoadedAt
    ? lastLoadedAt.toLocaleTimeString('zh-CN', { hour12: false })
    : '尚未成功读取'

  return (
    <div className="network-page network-logs-page space-y-4">
      <WorkspaceHeader
        eyebrow={viewConfig.eyebrow}
        title={viewConfig.title}
        description={viewConfig.description}
        className="network-workspace-header"
        actions={(
          <>
            <label className="network-auto-refresh-control">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={event => setAutoRefresh(event.target.checked)}
                aria-label="自动刷新日志"
              />
              <span className="network-auto-refresh-track" aria-hidden="true"><span /></span>
              <span className="network-auto-refresh-copy">
                <strong>自动刷新</strong>
                <small>{autoRefresh ? '每 3 秒' : '已暂停'}</small>
              </span>
            </label>
            <Button variant="secondary" size="sm" onClick={() => void load()} loading={loading} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              刷新
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void handleClear()} loading={clearing} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              清空
            </Button>
          </>
        )}
      >
        <TelemetryStrip
          className="network-telemetry-strip"
          items={[
            {
              label: '当前类别',
              value: viewRows.length,
              detail: `内存缓冲共 ${logs.length} 条`,
              tone: viewRows.length > 0 ? 'accent' : 'neutral',
            },
            {
              label: '筛选显示',
              value: filteredRows.length,
              detail: filteredRows.length === viewRows.length ? '未排除类别内记录' : `已排除 ${viewRows.length - filteredRows.length} 条`,
            },
            {
              label: '错误',
              value: errors,
              detail: 'ERROR 级别记录',
              tone: errors > 0 ? 'danger' : 'neutral',
            },
            {
              label: '警告',
              value: warnings,
              detail: 'WARN 级别记录',
              tone: warnings > 0 ? 'warning' : 'neutral',
            },
          ]}
        />
      </WorkspaceHeader>

      <section className="network-log-controls" aria-label="日志筛选">
        <div className="network-log-filter-row">
          <div className="network-filter-buttons" aria-label="按日志级别筛选">
            {LEVELS.map(level => (
              <button
                type="button"
                key={level}
                onClick={() => setLevelFilter(level)}
                aria-pressed={levelFilter === level}
                data-active={levelFilter === level ? 'true' : 'false'}
              >
                {level}
              </button>
            ))}
          </div>
          <div className="network-filter-buttons network-quick-filters" aria-label="快速筛选">
            {([
              ['ALL', '全部'],
              ['ERRORS', '只看异常'],
              ['SLOW', '慢调用'],
              ['FRONTEND', '前端操作'],
              ['BACKEND', '后端组件'],
            ] as Array<[QuickFilter, string]>).map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setQuickFilter(value)}
                aria-pressed={quickFilter === value}
                data-active={quickFilter === value ? 'true' : 'false'}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="network-log-count">{filteredRows.length} / {viewRows.length} 条</span>
        </div>

        <div className="network-log-search-row">
          <label className="network-field network-log-search">
            <span>搜索</span>
            <input
              value={keyword}
              onChange={event => setKeyword(event.target.value)}
              placeholder="消息、组件、方法或字段"
            />
          </label>
          <label className="network-auto-scroll-control">
            <input type="checkbox" checked={autoScroll} onChange={event => setAutoScroll(event.target.checked)} />
            <span>跟随最新日志</span>
          </label>
          <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            重置筛选
          </Button>
        </div>

        <details className="network-advanced-filters">
          <summary>
            <span><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />高级筛选</span>
            <span>{advancedFilterCount > 0 ? `${advancedFilterCount} 项已启用` : '按组件、方法、字段、耗时与时间过滤'}</span>
          </summary>
          <div className="network-advanced-filter-grid">
            <label className="network-field">
              <span>组件</span>
              <select value={componentFilter} onChange={event => setComponentFilter(event.target.value)}>
                <option value="ALL">全部组件</option>
                {components.map(component => <option key={component} value={component}>{component}</option>)}
              </select>
            </label>
            <label className="network-field">
              <span>方法</span>
              <select value={methodFilter} onChange={event => setMethodFilter(event.target.value)}>
                <option value="ALL">全部方法</option>
                {methods.map(method => <option key={method} value={method}>{method}</option>)}
              </select>
            </label>
            <label className="network-field">
              <span>字段内容</span>
              <input value={fieldKeyword} onChange={event => setFieldKeyword(event.target.value)} placeholder="搜索结构化字段" />
            </label>
            <label className="network-field">
              <span>最小耗时</span>
              <input type="number" min="0" value={durationMin} onChange={event => setDurationMin(event.target.value)} placeholder="毫秒" />
            </label>
            <label className="network-field">
              <span>开始时间</span>
              <input type="datetime-local" value={timeFrom} onChange={event => setTimeFrom(event.target.value)} />
            </label>
            <label className="network-field">
              <span>结束时间</span>
              <input type="datetime-local" value={timeTo} onChange={event => setTimeTo(event.target.value)} />
            </label>
          </div>
        </details>
      </section>

      <TerminalPanel
        title={viewConfig.terminalTitle}
        className="network-log-terminal"
        meta={<span>{readError ? '读取失败，保留上次结果' : `最近读取 ${lastReadLabel}`}</span>}
      >
        {readError && (
          <div className="network-log-error" role="alert">
            <strong>日志读取失败</strong>
            <span>{readError}。{logs.length > 0 ? '下方仍显示最后一次成功读取的记录。' : '当前没有可显示的缓存记录。'}</span>
          </div>
        )}
        <div ref={logContainerRef} className="network-log-viewport">
          {loading && logs.length === 0 ? (
            <SignalEmptyState symbol="logs" title="正在读取日志" description="等待应用内存缓冲返回记录。" />
          ) : readError && logs.length === 0 ? (
            <SignalEmptyState
              symbol="logs"
              title="无法读取日志"
              description={readError}
              action={<Button size="sm" variant="secondary" onClick={() => void load()}>重新读取</Button>}
            />
          ) : filteredRows.length === 0 ? (
            <SignalEmptyState
              symbol="logs"
              title={viewRows.length === 0 ? viewConfig.emptyTitle : '没有匹配当前筛选的日志'}
              description={viewRows.length === 0 ? '新的匹配记录写入内存缓冲后会出现在这里。' : '调整级别、快速筛选或高级条件后再试。'}
              action={viewRows.length > 0 ? <Button size="sm" variant="secondary" onClick={resetFilters}>清除筛选</Button> : undefined}
            />
          ) : (
            <table className="network-log-table">
              <thead>
                <tr>
                  <th aria-label="行号">#</th>
                  <th>时间</th>
                  <th>级别</th>
                  <th>组件</th>
                  <th>消息</th>
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
                      <td className="network-log-component" title={entry.component}>{entry.component || 'Unknown'}</td>
                      <td className="network-log-message">
                        <div>
                          <span>{entry.message}</span>
                          {(method || duration > 0) && (
                            <span className="network-log-inline-meta">
                              {method && `method=${method}`}{method && duration > 0 ? ' ' : ''}{duration > 0 && `duration=${duration}ms`}
                            </span>
                          )}
                        </div>
                        {fieldCount > 0 && (
                          <details className="network-log-fields">
                            <summary>结构化字段 {fieldCount}</summary>
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
