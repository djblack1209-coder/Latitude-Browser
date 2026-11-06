import { tr, useLocale, localized } from '../../../../shared/i18n'
import { Button, FormItem, Input, Modal, Select, Textarea } from '../../../../shared/components'
import type { BrowserProxy } from '../../types'
import {
  CHAIN_QUICK_IMPORT_TEMPLATE,
  DIRECT_QUICK_IMPORT_TEMPLATE,
  DIRECT_PROXY_PROTOCOL_OPTIONS,
  type ChainImportForm,
  type DirectImportForm,
  type ProxyImportMode,
} from './helpers'

interface ProxyPoolImportModalProps {
  open: boolean
  groups: string[]
  importMode: ProxyImportMode
  importUrl: string
  importFetchProxyId: string
  importResolvedUrl: string
  importText: string
  importDnsServers: string
  importNamePrefix: string
  importGroupName: string
  chainImportText: string
  directImportText: string
  chainImportForm: ChainImportForm
  directImportForm: DirectImportForm
  fetchingImportUrl: boolean
  fetchProxyOptions: BrowserProxy[]
  canParseImport: boolean
  onClose: () => void
  onParse: () => void
  onFetchImportUrl: () => void
  onImportModeChange: (nextMode: ProxyImportMode) => void
  onImportUrlChange: (nextValue: string) => void
  onImportFetchProxyIdChange: (nextValue: string) => void
  onImportTextChange: (nextValue: string) => void
  onImportDnsServersChange: (nextValue: string) => void
  onImportNamePrefixChange: (nextValue: string) => void
  onImportGroupNameChange: (nextValue: string) => void
  onChainImportTextChange: (nextValue: string) => void
  onDirectImportTextChange: (nextValue: string) => void
  onApplyChainJSON: () => void
  onApplyDirectText: () => void
  onChainImportFormChange: (patch: Partial<ChainImportForm>) => void
  onChainImportHopChange: (hop: 'first' | 'second', field: keyof ChainImportForm['first'], value: string) => void
  onFillChainTemplate: () => void
  onCopyChainTemplate: () => void
  onFillDirectTemplate: () => void
  onCopyDirectTemplate: () => void
  onDirectImportFormChange: (patch: Partial<DirectImportForm>) => void
}

const importModeTabs: Array<{ value: ProxyImportMode; label: string; hint: string }> = localized(() => ([
  { value: 'clash', label: tr("browser.components.ProxyImportModalView.text.7aa93f5"), hint: tr("browser.pages.proxyPool.ProxyPoolImportModal.hint.f6c4274") },
  { value: 'direct', label: tr("ui.modules.browser.pages.proxyPool.ProxyPoolImportModal.label.3947166"), hint: tr("browser.pages.proxyPool.ProxyPoolImportModal.hint.6f37c9e") },
  { value: 'chain', label: tr("browser.components.ProxyImportModalView.text.af838e5"), hint: tr("browser.pages.proxyPool.ProxyPoolImportModal.hint.95825eb") },
]))

export function ProxyPoolImportModal({
  open,
  groups,
  importMode,
  importUrl,
  importFetchProxyId,
  importResolvedUrl,
  importText,
  importDnsServers,
  importNamePrefix,
  importGroupName,
  chainImportText,
  directImportText,
  chainImportForm,
  directImportForm,
  fetchingImportUrl,
  fetchProxyOptions,
  canParseImport,
  onClose,
  onParse,
  onFetchImportUrl,
  onImportModeChange,
  onImportUrlChange,
  onImportFetchProxyIdChange,
  onImportTextChange,
  onImportDnsServersChange,
  onImportNamePrefixChange,
  onImportGroupNameChange,
  onChainImportTextChange,
  onDirectImportTextChange,
  onApplyChainJSON,
  onApplyDirectText,
  onChainImportFormChange,
  onChainImportHopChange,
  onFillChainTemplate,
  onCopyChainTemplate,
  onFillDirectTemplate,
  onCopyDirectTemplate,
  onDirectImportFormChange,
}: ProxyPoolImportModalProps) {
  useLocale()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("browser.components.ProxyImportModalView.title.44de58e")}
      width="720px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={fetchingImportUrl}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          <Button onClick={onParse} disabled={fetchingImportUrl || !canParseImport}>{tr("browser.components.ProxyImportModalView.text.af57b02")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[var(--color-bg-secondary)] p-1">
          {importModeTabs.map(tab => {
            const active = importMode === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => onImportModeChange(tab.value)}
                className={active
                  ? 'rounded-xl bg-[var(--color-text-primary)] px-4 py-3 text-left text-white shadow-sm'
                  : 'rounded-xl px-4 py-3 text-left text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-primary)] hover:text-[var(--color-text-primary)]'
                }
              >
                <span className="block text-sm font-semibold">{tab.label}</span>
                <span className={active ? 'mt-1 block text-xs text-white/75' : 'mt-1 block text-xs text-[var(--color-text-muted)]'}>{tab.hint}</span>
              </button>
            )
          })}
        </div>

        {importMode === 'clash' && (
          <>
            <FormItem label={tr("browser.components.ProxyImportModalView.label.2720c84")}>
              <div className="grid grid-cols-[minmax(0,1fr)_150px_auto] gap-2">
                <Input
                  value={importUrl}
                  onChange={(event) => onImportUrlChange(event.target.value)}
                  placeholder={tr("browser.components.ProxyImportModalView.placeholder.6c1f23d")}
                  className="flex-1"
                />
                <Select
                  value={importFetchProxyId}
                  onChange={(event) => onImportFetchProxyIdChange(event.target.value)}
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
                  onClick={onFetchImportUrl}
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
              onChange={(event) => onImportTextChange(event.target.value)}
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
                  onChange={(event) =>
                    onDirectImportFormChange({ protocol: event.target.value as DirectImportForm['protocol'] })
                  }
                />
              </FormItem>
              <FormItem label={tr("browser.components.ProxyImportModalView.label.8adc21f")}>
                <Input
                  value={directImportForm.proxyName}
                  onChange={(event) => onDirectImportFormChange({ proxyName: event.target.value })}
                  placeholder={tr("browser.components.ProxyImportModalView.placeholder.3de90b4")}
                />
              </FormItem>
              <FormItem label={tr("browser.components.ProxyImportModalView.label.903f8d3")} required>
                <Input
                  value={directImportForm.server}
                  onChange={(event) => onDirectImportFormChange({ server: event.target.value })}
                  placeholder={tr("browser.components.ProxyImportModalView.placeholder.0f27921")}
                />
              </FormItem>
              <FormItem label={tr("browser.components.ProxyImportModalView.label.52b14ee")} required>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={directImportForm.port}
                  onChange={(event) => onDirectImportFormChange({ port: event.target.value })}
                  placeholder={tr("browser.components.ProxyImportModalView.placeholder.b50ae7c")}
                />
              </FormItem>
              <FormItem label={tr("browser.components.ProxyImportModalView.label.75312f8")}>
                <Input
                  value={directImportForm.username}
                  onChange={(event) => onDirectImportFormChange({ username: event.target.value })}
                  placeholder={tr("browser.components.ProxyImportModalView.placeholder.77980ea")}
                />
              </FormItem>
              <FormItem label={tr("browser.components.ProxyImportModalView.label.29e03e6")}>
                <Input
                  type="password"
                  value={directImportForm.password}
                  onChange={(event) => onDirectImportFormChange({ password: event.target.value })}
                  placeholder={tr("browser.components.ProxyImportModalView.placeholder.9ce530c")}
                />
              </FormItem>
            </div>
            <FormItem label={tr("browser.components.ProxyImportModalView.label.f02332d")}>
              <Textarea
                value={directImportText}
                onChange={(event) => onDirectImportTextChange(event.target.value)}
                rows={8}
                placeholder={DIRECT_QUICK_IMPORT_TEMPLATE}
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={onFillDirectTemplate}>{tr("browser.components.ProxyImportModalView.text.036c96a")}</Button>
                <Button size="sm" variant="secondary" onClick={onCopyDirectTemplate}>{tr("browser.components.ProxyImportModalView.text.b880979")}</Button>
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
                  onChange={(event) => onChainImportFormChange({ proxyName: event.target.value })}
                  placeholder={tr("browser.pages.proxyPool.ProxyPoolImportModal.placeholder.d61f953")}
                />
              </FormItem>
              <FormItem label={tr("browser.components.ProxyImportModalView.label.d3f4ba1")}>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={chainImportForm.localPort}
                  onChange={(event) => onChainImportFormChange({ localPort: event.target.value })}
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
                    onChange={(event) => onChainImportHopChange('first', 'protocol', event.target.value)}
                    options={[
                      { value: 'http', label: "HTTP" },
                      { value: 'socks5', label: "SOCKS5" },
                    ]}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.903f8d3")} required>
                  <Input
                    value={chainImportForm.first.server}
                    onChange={(event) => onChainImportHopChange('first', 'server', event.target.value)}
                    placeholder={tr("browser.components.ProxyImportModalView.label.903f8d3")}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.52b14ee")} required>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={chainImportForm.first.port}
                    onChange={(event) => onChainImportHopChange('first', 'port', event.target.value)}
                    placeholder={tr("browser.components.ProxyImportModal.title.6cbb733")}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.75312f8")}>
                  <Input
                    value={chainImportForm.first.username}
                    onChange={(event) => onChainImportHopChange('first', 'username', event.target.value)}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.29e03e6")}>
                  <Input
                    type="password"
                    value={chainImportForm.first.password}
                    onChange={(event) => onChainImportHopChange('first', 'password', event.target.value)}
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
                    onChange={(event) => onChainImportHopChange('second', 'protocol', event.target.value)}
                    options={[
                      { value: 'http', label: "HTTP" },
                      { value: 'socks5', label: "SOCKS5" },
                    ]}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.903f8d3")} required>
                  <Input
                    value={chainImportForm.second.server}
                    onChange={(event) => onChainImportHopChange('second', 'server', event.target.value)}
                    placeholder={tr("browser.components.ProxyImportModalView.label.903f8d3")}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.52b14ee")} required>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={chainImportForm.second.port}
                    onChange={(event) => onChainImportHopChange('second', 'port', event.target.value)}
                    placeholder={tr("browser.components.ProxyImportModal.title.6cbb733")}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.75312f8")}>
                  <Input
                    value={chainImportForm.second.username}
                    onChange={(event) => onChainImportHopChange('second', 'username', event.target.value)}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.29e03e6")}>
                  <Input
                    type="password"
                    value={chainImportForm.second.password}
                    onChange={(event) => onChainImportHopChange('second', 'password', event.target.value)}
                  />
                </FormItem>
              </div>
            </div>
            <FormItem label={tr("browser.pages.proxyPool.ProxyPoolImportModal.label.09c115a")}>
              <Textarea
                value={chainImportText}
                onChange={(event) => onChainImportTextChange(event.target.value)}
                rows={10}
                placeholder={CHAIN_QUICK_IMPORT_TEMPLATE}
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={onFillChainTemplate}>{tr("browser.components.ProxyImportModalView.text.036c96a")}</Button>
                <Button size="sm" variant="secondary" onClick={onCopyChainTemplate}>{tr("browser.components.ProxyImportModalView.text.b880979")}</Button>
                <Button size="sm" variant="secondary" onClick={onApplyChainJSON} disabled={!chainImportText.trim()}>{tr("browser.pages.proxyPool.ProxyPoolImportModal.text.ee52d34")}</Button>
              </div>
            </FormItem>
          </div>
        )}
        <FormItem label={tr("browser.components.ProxyImportModalView.label.bf588e9")}>
          <Input
            value={importGroupName}
            onChange={(event) => onImportGroupNameChange(event.target.value)}
            placeholder={tr("browser.components.GroupTreeNav.placeholder.65731c1")}
            list="proxy-groups-datalist"
          />
          {groups.length > 0 && (
            <datalist id="proxy-groups-datalist">
              {groups.map((group) => (
                <option key={group} value={group} />
              ))}
            </datalist>
          )}
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{tr("browser.components.ProxyImportModalView.text.661e125")}</p>
        </FormItem>
        {importMode === 'clash' && (
          <FormItem label={tr("browser.components.ProxyImportModalView.label.86c8e87")}>
            <Input
              value={importNamePrefix}
              onChange={(event) => onImportNamePrefixChange(event.target.value)}
              placeholder={tr("browser.components.ProxyImportModalView.placeholder.4b175db")}
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{tr("browser.components.ProxyImportModalView.text.164fee8")}<code className="px-1 bg-[var(--color-bg-secondary)] rounded">{tr("browser.components.ProxyImportModalView.text.ba91499")}</code>{tr("browser.components.ProxyImportModalView.text.f65b57f")}</p>
          </FormItem>
        )}
        {importMode === 'clash' && (
          <FormItem label={tr("browser.components.ProxyImportModalView.label.0b116c0")}>
            <Textarea
              value={importDnsServers}
              onChange={(event) => onImportDnsServersChange(event.target.value)}
              rows={5}
              placeholder={`dns:\n  enable: true\n  nameserver:\n    - 119.29.29.29\n    - 223.5.5.5`}
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{tr("browser.components.ProxyImportModalView.text.e20b2f3")}</p>
          </FormItem>
        )}
      </div>
    </Modal>
  )
}
