import { getLocale } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
import { useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Input, Table, toast } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'
import type { CookieInfo } from '../types'
import { clearBrowserCookies, exportBrowserCookies, fetchBrowserCookies } from '../api'

interface Props {
  profileId: string
  profileName: string
  running: boolean
  ready: boolean
}

const formatExpires = (expires: number) => {
  if (expires <= 0) return 'Session'
  return new Date(expires * 1000).toLocaleString(getLocale())
}

export function CookieManagerCard({ profileId, profileName, running, ready }: Props) {
  const uiLocale = useLocale()

  const [cookies, setCookies] = useState<CookieInfo[]>([])
  const [filterDomain, setFilterDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const loadCookies = async () => {
    if (!ready) return
    setLoading(true)
    try {
      const list = await fetchBrowserCookies(profileId)
      setCookies(list)
    } catch {
      toast.error(tr("browser.components.CookieManagerCard.CookieManagerCard.20a1bca"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (ready) loadCookies()
    else setCookies([])
  }, [profileId, ready])

  const filteredCookies = useMemo(() => {
    if (!filterDomain.trim()) return cookies
    const kw = filterDomain.toLowerCase()
    return cookies.filter(c => c.domain.toLowerCase().includes(kw))
  }, [cookies, filterDomain, uiLocale])

  const handleClear = async () => {
    setClearing(true)
    try {
      await clearBrowserCookies(profileId)
      setCookies([])
      toast.success(tr("browser.components.CookieManagerCard.CookieManagerCard.72573bb"))
    } catch {
      toast.error(tr("browser.components.CookieManagerCard.CookieManagerCard.e851151"))
    } finally {
      setClearing(false)
      setShowConfirm(false)
    }
  }

  const handleExport = async () => {
    try {
      const content = await exportBrowserCookies(profileId)
      const date = new Date().toISOString().slice(0, 10)
      const filename = `cookies_${profileName}_${date}.txt`
      const blob = new Blob([content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(tr("browser.components.CookieManagerCard.CookieManagerCard.7905c7b"))
    } catch {
      toast.error(tr("browser.components.CookieManagerCard.CookieManagerCard.d9a0ee7"))
    }
  }

  const columns: TableColumn<CookieInfo>[] = [
    { key: 'domain', title: tr("browser.components.CookieManagerCard.title.282d684"), render: v => <span className="font-mono text-xs">{v}</span> },
    { key: 'name', title: tr("browser.components.BrowserListLayout.title.1be7ae4"), render: v => <span className="font-mono text-xs">{v}</span> },
    {
      key: 'value',
      title: tr("browser.components.CookieManagerCard.title.321b955"),
      render: v => (
        <span className="font-mono text-xs max-w-[120px] truncate block" title={v as string}>{v}</span>
      ),
    },
    { key: 'expires', title: tr("browser.components.CookieManagerCard.title.27aefec"), render: v => formatExpires(v as number) },
    {
      key: 'httpOnly',
      title: tr("ui.modules.browser.components.CookieManagerCard.label.151b29c"),
      render: v => <Badge variant={v ? "success" : "default"}>{v ? tr("browser.components.CookieManagerCard.CookieManagerCard.30160a2") : tr("browser.components.CookieManagerCard.CookieManagerCard.8bf5c10")}</Badge>,
    },
    {
      key: 'secure',
      title: tr("ui.modules.browser.components.CookieManagerCard.label.ae6cf5c"),
      render: v => <Badge variant={v ? "success" : "default"}>{v ? tr("browser.components.CookieManagerCard.CookieManagerCard.30160a2") : tr("browser.components.CookieManagerCard.CookieManagerCard.8bf5c10")}</Badge>,
    },
  ]



  return (
    <Card title={tr("browser.components.CookieManagerCard.title.e36804a")} >
      {!running ? (
        <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">{tr("browser.components.CookieManagerCard.text.326c3b8")}</p>
      ) : !ready ? (
        <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">{tr("browser.components.CookieManagerCard.text.d728733")}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <Input
              placeholder={tr("browser.components.CookieManagerCard.placeholder.4f4e7f9")}
              value={filterDomain}
              onChange={e => setFilterDomain(e.target.value)}
              className="w-full sm:w-64"
            />
            <div className="flex gap-2 flex-shrink-0">
              <Button size="sm" variant="ghost" onClick={loadCookies} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />{tr("browser.components.AutomationRuntimeSnapshot.text.38108ea")}</Button>
              <Button size="sm" variant="ghost" onClick={handleExport}>
                <Download className="w-4 h-4" />{tr("browser.components.CookieManagerCard.text.c233544")}</Button>
              <Button size="sm" variant="secondary" onClick={() => setShowConfirm(true)} disabled={clearing}>
                <Trash2 className="w-4 h-4" />{tr("browser.components.CookieManagerCard.text.2e9ab49")}</Button>
            </div>
          </div>

          {showConfirm && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 flex items-center justify-between gap-4">
              <span className="text-sm text-[var(--color-text-secondary)]">{tr("browser.components.CookieManagerCard.text.da4c93f")}</span>
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" variant="ghost" onClick={() => setShowConfirm(false)}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
                <Button size="sm" onClick={handleClear} disabled={clearing}>{tr("browser.components.CookieManagerCard.text.3bc93e7")}</Button>
              </div>
            </div>
          )}

          <Table columns={columns} data={filteredCookies} rowKey="name" />
        </div>
      )}
    </Card>
  )
}
