import { tr, useLocale } from '../../../shared/i18n'
import { Button, FormItem, Input, Modal, Select, Table, Textarea } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'
import type { BrowserProxy } from '../types'
import { DIRECT_QUICK_IMPORT_TEMPLATE } from '../pages/proxyPool/helpers'
import {
  DIRECT_PROXY_PROTOCOL_OPTIONS,
  type ChainHopForm,
  type ChainImportForm,
  type DirectImportForm,
  type ProxyDisplayInfo,
  type ProxyImportMode,
} from './ProxyImportModal.types'

interface ProxyImportModalViewProps {
  open: boolean
  onClose: () => void
  fetchingImportUrl: boolean
  canParseImport: boolean
  importMode: ProxyImportMode
  importUrl: string
  importFetchProxyId: string
  importResolvedUrl: string
  importText: string
  importDnsServers: string
  importNamePrefix: string
  importGroupName: string
  directImportText: string
  directImportForm: DirectImportForm
  chainImportForm: ChainImportForm
  groups: string[]
  fetchProxyOptions: BrowserProxy[]
  previewModalOpen: boolean
  previewList: ProxyDisplayInfo[]
  importing: boolean
  previewColumns: TableColumn<ProxyDisplayInfo>[]
  onParseImport: () => void
  onImportModeChange: (mode: ProxyImportMode) => void
  onImportUrlChange: (value: string) => void
  onImportFetchProxyIdChange: (value: string) => void
  onImportResolvedUrlChange: (value: string) => void
  onFetchImportURL: () => Promise<void>
  onImportTextChange: (value: string) => void
  onImportDnsServersChange: (value: string) => void
  onImportNamePrefixChange: (value: string) => void
  onImportGroupNameChange: (value: string) => void
  onDirectImportTextChange: (value: string) => void
  onDirectImportFormChange: import("react").Dispatch<import("react").SetStateAction<DirectImportForm>>
  onChainImportFormChange: import("react").Dispatch<import("react").SetStateAction<ChainImportForm>>
  onUpdateChainHop: (hop: 'first' | 'second', field: keyof ChainHopForm, value: string) => void
  onFillDirectTemplate: () => void
  onCopyDirectTemplate: () => Promise<void>
  onApplyDirectText: () => void
  onPreviewModalOpenChange: (open: boolean) => void
  onConfirmImport: () => Promise<void>
}

export function ProxyImportModalView({
  open,
  onClose,
  fetchingImportUrl,
  canParseImport,
  importMode,
  importUrl,
  importFetchProxyId,
  importResolvedUrl,
  importText,
  importDnsServers,
  importNamePrefix,
  importGroupName,
  directImportText,
  directImportForm,
  chainImportForm,
  groups,
  fetchProxyOptions,
  previewModalOpen,
  previewList,
  importing,
  previewColumns,
  onParseImport,
  onImportModeChange,
  onImportUrlChange,
  onImportFetchProxyIdChange,
  onImportResolvedUrlChange,
  onFetchImportURL,
  onImportTextChange,
  onImportDnsServersChange,
  onImportNamePrefixChange,
  onImportGroupNameChange,
  onDirectImportTextChange,
  onDirectImportFormChange,
  onChainImportFormChange,
  onUpdateChainHop,
  onFillDirectTemplate,
  onCopyDirectTemplate,
  onApplyDirectText,
  onPreviewModalOpenChange,
  onConfirmImport,
}: ProxyImportModalViewProps) {
  useLocale()

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={tr("browser.components.ProxyImportModalView.title.44de58e")}
        width="600px"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={fetchingImportUrl}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
            <Button onClick={onParseImport} disabled={fetchingImportUrl || !canParseImport}>{tr("browser.components.ProxyImportModalView.text.af57b02")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={importMode === 'clash' ? undefined : "secondary"}
              onClick={() => onImportModeChange('clash')}
            >{tr("browser.components.ProxyImportModalView.text.7aa93f5")}</Button>
            <Button
              variant={importMode === 'direct' ? undefined : "secondary"}
              onClick={() => onImportModeChange('direct')}
            >{tr("ui.modules.browser.components.ProxyImportModalView.label.3947166")}</Button>
            <Button
              variant={importMode === 'chain' ? undefined : "secondary"}
              onClick={() => onImportModeChange('chain')}
            >{tr("browser.components.ProxyImportModalView.text.af838e5")}</Button>
          </div>
          {importMode === 'clash' && (
            <>
              <FormItem label={tr("browser.components.ProxyImportModalView.label.2720c84")}>
                <div className="grid grid-cols-[minmax(0,1fr)_150px_auto] gap-2">
                  <Input
                    value={importUrl}
                    onChange={e => {
                      const next = e.target.value
                      onImportUrlChange(next)
                      if (importResolvedUrl.trim() && next.trim() !== importResolvedUrl.trim()) {
                        onImportResolvedUrlChange('')
                      }
                    }}
                    placeholder={tr("browser.components.ProxyImportModalView.placeholder.6c1f23d")}
                    className="flex-1"
                  />
                  <Select
                    value={importFetchProxyId}
                    onChange={e => onImportFetchProxyIdChange(e.target.value)}
                    disabled={fetchingImportUrl}
                    options={[
                      { value: '', label: tr("browser.components.ProxyImportModalView.label.7fce46d") },
                      ...fetchProxyOptions.map(proxy => ({
                        value: proxy.proxyId,
                        label: proxy.proxyName || proxy.proxyId,
                      })),
                    ]}
                  />
                  <Button
                    variant="secondary"
                    onClick={onFetchImportURL}
                    loading={fetchingImportUrl}
                    disabled={!importUrl.trim()}
                  >{tr("browser.components.ProxyImportModalView.text.64042d5")}</Button>
                </div>
                {importResolvedUrl.trim() && (
                  <p className="text-xs text-[var(--color-success)] mt-1 break-all">{tr("browser.components.ProxyImportModalView.text.482a36e")}{importResolvedUrl}
                  </p>
                )}
              </FormItem>
              <Textarea
                value={importText}
                onChange={e => onImportTextChange(e.target.value)}
                rows={12}
                placeholder={`proxies:\n  - name: vless-v6\n    type: vless\n    server: example.com\n    port: 443\n    uuid: your-uuid\n    ...`}
              />
            </>
          )}
          {importMode === 'direct' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormItem label={tr("browser.components.ProxyImportModalView.label.cceab16")} required>
                  <Select
                    options={[...DIRECT_PROXY_PROTOCOL_OPTIONS]}
                    value={directImportForm.protocol}
                    onChange={e => onDirectImportFormChange(prev => ({ ...prev, protocol: e.target.value as DirectImportForm['protocol'] }))}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.8adc21f")}>
                  <Input
                    value={directImportForm.proxyName}
                    onChange={e => onDirectImportFormChange(prev => ({ ...prev, proxyName: e.target.value }))}
                    placeholder={tr("browser.components.ProxyImportModalView.placeholder.3de90b4")}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.903f8d3")} required>
                  <Input
                    value={directImportForm.server}
                    onChange={e => onDirectImportFormChange(prev => ({ ...prev, server: e.target.value }))}
                    placeholder={tr("browser.components.ProxyImportModalView.placeholder.0f27921")}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.52b14ee")} required>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={directImportForm.port}
                    onChange={e => onDirectImportFormChange(prev => ({ ...prev, port: e.target.value }))}
                    placeholder={tr("browser.components.ProxyImportModalView.placeholder.b50ae7c")}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.75312f8")}>
                  <Input
                    value={directImportForm.username}
                    onChange={e => onDirectImportFormChange(prev => ({ ...prev, username: e.target.value }))}
                    placeholder={tr("browser.components.ProxyImportModalView.placeholder.77980ea")}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.29e03e6")}>
                  <Input
                    type="password"
                    value={directImportForm.password}
                    onChange={e => onDirectImportFormChange(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={tr("browser.components.ProxyImportModalView.placeholder.9ce530c")}
                  />
                </FormItem>
              </div>
              <FormItem label={tr("browser.components.ProxyImportModalView.label.f02332d")}>
                <Textarea
                  value={directImportText}
                  onChange={e => onDirectImportTextChange(e.target.value)}
                  rows={8}
                  placeholder={DIRECT_QUICK_IMPORT_TEMPLATE}
                />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={onFillDirectTemplate}>{tr("browser.components.ProxyImportModalView.text.036c96a")}</Button>
                  <Button size="sm" variant="secondary" onClick={() => void onCopyDirectTemplate()}>{tr("browser.components.ProxyImportModalView.text.b880979")}</Button>
                  <Button size="sm" variant="secondary" onClick={onApplyDirectText} disabled={!directImportText.trim()}>{tr("browser.components.ProxyImportModalView.text.1b7d8a6")}</Button>
                </div>
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">{tr("browser.components.ProxyImportModalView.text.1034d7d")}</p>
              </FormItem>
            </div>
          )}
          {importMode === 'chain' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormItem label={tr("browser.components.ProxyImportModalView.label.8adc21f")}>
                  <Input
                    value={chainImportForm.proxyName}
                    onChange={e => onChainImportFormChange(prev => ({ ...prev, proxyName: e.target.value }))}
                    placeholder={tr("browser.components.ProxyImportModalView.placeholder.1c99aa8")}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.d3f4ba1")}>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={chainImportForm.localPort}
                    onChange={e => onChainImportFormChange(prev => ({ ...prev, localPort: e.target.value }))}
                    placeholder={tr("browser.components.ProxyImportModalView.placeholder.08eb3ce")}
                  />
                </FormItem>
              </div>

              <div className="rounded-md border border-[var(--color-border)] p-3 space-y-3">
                <h4 className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.components.ProxyImportModalView.text.05d4bfc")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormItem label={tr("browser.components.ProxyImportModalView.label.b0c4316")}>
                    <Select
                      value={chainImportForm.first.protocol}
                      onChange={e => onUpdateChainHop('first', 'protocol', e.target.value)}
                      options={[
                        { value: 'http', label: "HTTP" },
                        { value: 'socks5', label: "SOCKS5" },
                      ]}
                    />
                  </FormItem>
                  <FormItem label={tr("browser.components.ProxyImportModalView.label.903f8d3")} required>
                    <Input
                      value={chainImportForm.first.server}
                      onChange={e => onUpdateChainHop('first', 'server', e.target.value)}
                      placeholder={tr("browser.components.ProxyImportModalView.placeholder.b6d3b53")}
                    />
                  </FormItem>
                  <FormItem label={tr("browser.components.ProxyImportModalView.label.52b14ee")} required>
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={chainImportForm.first.port}
                      onChange={e => onUpdateChainHop('first', 'port', e.target.value)}
                      placeholder={tr("browser.components.ProxyImportModalView.placeholder.b50ae7c")}
                    />
                  </FormItem>
                  <FormItem label={tr("browser.components.ProxyImportModalView.label.75312f8")}>
                    <Input
                      value={chainImportForm.first.username}
                      onChange={e => onUpdateChainHop('first', 'username', e.target.value)}
                      placeholder={tr("browser.components.ProxyImportModalView.placeholder.77980ea")}
                    />
                  </FormItem>
                  <FormItem label={tr("browser.components.ProxyImportModalView.label.29e03e6")}>
                    <Input
                      type="password"
                      value={chainImportForm.first.password}
                      onChange={e => onUpdateChainHop('first', 'password', e.target.value)}
                      placeholder={tr("browser.components.ProxyImportModalView.placeholder.9ce530c")}
                    />
                  </FormItem>
                </div>
              </div>

              <div className="rounded-md border border-[var(--color-border)] p-3 space-y-3">
                <h4 className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.components.ProxyImportModalView.text.bf35c8b")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormItem label={tr("browser.components.ProxyImportModalView.label.b0c4316")}>
                    <Select
                      value={chainImportForm.second.protocol}
                      onChange={e => onUpdateChainHop('second', 'protocol', e.target.value)}
                      options={[
                        { value: 'http', label: "HTTP" },
                        { value: 'socks5', label: "SOCKS5" },
                      ]}
                    />
                  </FormItem>
                  <FormItem label={tr("browser.components.ProxyImportModalView.label.903f8d3")} required>
                    <Input
                      value={chainImportForm.second.server}
                      onChange={e => onUpdateChainHop('second', 'server', e.target.value)}
                      placeholder={tr("browser.components.ProxyImportModalView.placeholder.3693f3b")}
                    />
                  </FormItem>
                  <FormItem label={tr("browser.components.ProxyImportModalView.label.52b14ee")} required>
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={chainImportForm.second.port}
                      onChange={e => onUpdateChainHop('second', 'port', e.target.value)}
                      placeholder={tr("browser.components.ProxyImportModalView.placeholder.86796be")}
                    />
                  </FormItem>
                  <FormItem label={tr("browser.components.ProxyImportModalView.label.75312f8")}>
                    <Input
                      value={chainImportForm.second.username}
                      onChange={e => onUpdateChainHop('second', 'username', e.target.value)}
                      placeholder={tr("browser.components.ProxyImportModalView.placeholder.77980ea")}
                    />
                  </FormItem>
                  <FormItem label={tr("browser.components.ProxyImportModalView.label.29e03e6")}>
                    <Input
                      type="password"
                      value={chainImportForm.second.password}
                      onChange={e => onUpdateChainHop('second', 'password', e.target.value)}
                      placeholder={tr("browser.components.ProxyImportModalView.placeholder.9ce530c")}
                    />
                  </FormItem>
                </div>
              </div>
            </div>
          )}

          <FormItem label={tr("browser.components.ProxyImportModalView.label.bf588e9")}>
            <Input
              value={importGroupName}
              onChange={e => onImportGroupNameChange(e.target.value)}
              placeholder={tr("browser.components.GroupTreeNav.placeholder.65731c1")}
              list="proxy-groups-datalist"
            />
            {groups.length > 0 && (
              <datalist id="proxy-groups-datalist">
                {groups.map(g => <option key={g} value={g} />)}
              </datalist>
            )}
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{tr("browser.components.ProxyImportModalView.text.661e125")}</p>
          </FormItem>
          {importMode === 'clash' && (
            <FormItem label={tr("browser.components.ProxyImportModalView.label.86c8e87")}>
              <Input
                value={importNamePrefix}
                onChange={e => onImportNamePrefixChange(e.target.value)}
                placeholder={tr("browser.components.ProxyImportModalView.placeholder.4b175db")}
              />
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{tr("browser.components.ProxyImportModalView.text.164fee8")}<code className="px-1 bg-[var(--color-bg-secondary)] rounded">{tr("browser.components.ProxyImportModalView.text.ba91499")}</code>{tr("browser.components.ProxyImportModalView.text.f65b57f")}</p>
            </FormItem>
          )}
          {importMode === 'clash' && (
            <FormItem label={tr("browser.components.ProxyImportModalView.label.0b116c0")}>
              <Textarea value={importDnsServers} onChange={e => onImportDnsServersChange(e.target.value)} rows={5}
                placeholder={`dns:\n  enable: true\n  nameserver:\n    - 119.29.29.29\n    - 223.5.5.5`} />
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{tr("browser.components.ProxyImportModalView.text.e20b2f3")}</p>
            </FormItem>
          )}
        </div>
      </Modal>

      <Modal
        open={previewModalOpen}
        onClose={() => onPreviewModalOpenChange(false)}
        title={tr("browser.components.ProxyImportModalView.title.bbc5274")}
        width="700px"
        footer={
          <>
            <Button variant="secondary" onClick={() => onPreviewModalOpenChange(false)}>{tr("browser.components.ProxyImportModalView.text.9a233f2")}</Button>
            <Button onClick={onConfirmImport} loading={importing} disabled={previewList.length === 0}>{tr("browser.components.ProxyImportModalView.text.de6433b")}</Button>
          </>
        }
      >
        <div className="space-y-3">
          {importMode === 'clash' && importDnsServers.trim() && (
            <p className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] px-3 py-2 rounded">{tr("browser.components.ProxyImportModalView.text.a437f66")}</p>
          )}
          <Table columns={previewColumns} data={previewList} rowKey="proxyId" maxHeight="380px" emptyText={tr("browser.components.ProxyImportModalView.emptyText.e95387a")} />
        </div>
      </Modal>
    </>
  )
}
