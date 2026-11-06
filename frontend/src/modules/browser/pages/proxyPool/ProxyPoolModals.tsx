import { tr, useLocale } from '../../../../shared/i18n'
import { Button, FormItem, Input, Modal, Select, Table, Textarea } from '../../../../shared/components'
import type { TableColumn } from '../../../../shared/components/Table'
import type { ProxyIPHealthResult } from '../../types'
import { diagnosticStageLabel, normalizeProxyDiagnostic } from './diagnostics'

import {
  type ChainImportForm,
  type DirectImportForm,
  type ProxyDisplayInfo,
  type ProxyImportMode,
} from './helpers'

export interface ProxyEditFormValue {
  proxyName: string
  proxyConfig: string
  preferredKernel: string
  dnsServers: string
  groupName: string
}

export { ProxyPoolImportModal } from './ProxyPoolImportModal'

interface ProxyPoolPreviewModalProps {
  open: boolean
  importMode: ProxyImportMode
  importDnsServers: string
  previewList: ProxyDisplayInfo[]
  removedPreviewProxyNames: string[]
  importing: boolean
  onClose: () => void
  onBack: () => void
  onConfirm: () => void
  onRemoveProxy: (proxyId: string) => void
}

export function ProxyPoolPreviewModal({
  open,
  importMode,
  importDnsServers,
  previewList,
  removedPreviewProxyNames,
  importing,
  onClose,
  onBack,
  onConfirm,
  onRemoveProxy,
}: ProxyPoolPreviewModalProps) {
  useLocale()

  const previewColumns: TableColumn<ProxyDisplayInfo>[] = [
    { key: 'proxyName', title: tr("browser.components.ProxyImportModal.title.c617e8e"), width: '200px' },
    { key: 'type', title: tr("browser.components.AutomationScriptHistoryModal.text.e4e46c7"), width: '100px' },
    { key: 'server', title: tr("browser.components.ProxyImportModal.title.30d94cb"), width: '200px' },
    { key: 'port', title: tr("browser.components.ProxyImportModal.title.6cbb733"), width: '100px', render: (value) => value || '-' },
    {
      key: 'actions',
      title: tr("browser.components.AutomationScriptHistoryModal.text.f3ea6d3"),
      width: '96px',
      render: (_, record) => (
        <Button size="sm" variant="danger" onClick={() => onRemoveProxy(record.proxyId)}>{tr("browser.components.BrowserListLayout.title.3755f56")}</Button>
      ),
    },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("browser.components.ProxyImportModalView.title.bbc5274")}
      width="700px"
      footer={
        <>
          <Button variant="secondary" onClick={onBack}>{tr("browser.components.ProxyImportModalView.text.9a233f2")}</Button>
          <Button onClick={onConfirm} loading={importing} disabled={previewList.length === 0}>{tr("browser.components.ProxyImportModalView.text.de6433b")}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {importMode === 'clash' && importDnsServers.trim() && (
          <p className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] px-3 py-2 rounded">{tr("browser.components.ProxyImportModalView.text.a437f66")}</p>
        )}
        <p className="text-xs text-[var(--color-text-muted)]">{tr("browser.pages.proxyPool.ProxyPoolModals.text.e5a8bb1")}{previewList.length}{tr("browser.pages.proxyPool.ProxyPoolModals.text.6637134")}{removedPreviewProxyNames.length}{tr("browser.pages.proxyPool.ProxyPoolModals.text.096448b")}</p>
        <Table columns={previewColumns} data={previewList} rowKey="proxyId" maxHeight="380px" emptyText={tr("browser.components.ProxyImportModalView.emptyText.e95387a")} />
      </div>
    </Modal>
  )
}

interface ProxyPoolEditModalProps {
  open: boolean
  saving: boolean
  groups: string[]
  editForm: ProxyEditFormValue
  chainEditMode: boolean
  chainEditForm: ChainImportForm
  directEditMode: boolean
  directEditForm: DirectImportForm
  onClose: () => void
  onSave: () => void
  onChange: (patch: Partial<ProxyEditFormValue>) => void
  onChainEditFormChange: (patch: Partial<ChainImportForm>) => void
  onDirectEditFormChange: (patch: Partial<DirectImportForm>) => void
  onChainEditHopChange: (hop: 'first' | 'second', field: keyof ChainImportForm['first'], value: string) => void
}

export function ProxyPoolEditModal({
  open,
  saving,
  groups,
  editForm,
  chainEditMode,
  chainEditForm,
  directEditMode,
  directEditForm,
  onClose,
  onSave,
  onChange,
  onChainEditFormChange,
  onDirectEditFormChange,
  onChainEditHopChange,
}: ProxyPoolEditModalProps) {
  useLocale()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("browser.components.ProxyPickerModal.edit.title.2b7d151")}
      width="500px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          <Button onClick={onSave} loading={saving}>{tr("browser.components.BrowserListLayout.text.fadf24d")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormItem label={tr("browser.components.ProxyImportModal.title.c617e8e")} required>
          <Input
            value={chainEditMode ? chainEditForm.proxyName : directEditMode ? directEditForm.proxyName : editForm.proxyName}
            onChange={(event) => {
              if (chainEditMode) {
                onChainEditFormChange({ proxyName: event.target.value })
                return
              }
              if (directEditMode) {
                onDirectEditFormChange({ proxyName: event.target.value })
                return
              }
              onChange({ proxyName: event.target.value })
            }}
            placeholder={tr("browser.components.ProxyImportModalView.placeholder.3de90b4")}
          />
        </FormItem>
        <FormItem label={tr("browser.components.ProxyImportModalView.label.bf588e9")}>
          <Input
            value={editForm.groupName}
            onChange={(event) => onChange({ groupName: event.target.value })}
            placeholder={tr("browser.components.GroupTreeNav.placeholder.65731c1")}
            list="edit-proxy-groups-datalist"
          />
          <datalist id="edit-proxy-groups-datalist">
            {groups.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
        </FormItem>
        <FormItem label={tr("browser.pages.proxyPool.ProxyCoreDownloadModal.label.0d1f972")}>
          <Select
            value={editForm.preferredKernel || tr("ui.modules.browser.pages.proxyPool.ProxyPoolModals.label.0d612c1")}
            onChange={(event) => onChange({ preferredKernel: event.target.value })}
            options={[
              { value: 'auto', label: tr("browser.pages.proxyPool.ProxyPoolModals.label.4afad87") },
              { value: 'xray', label: "Xray" },
              { value: 'sing-box', label: 'sing-box' },
              { value: 'mihomo', label: "Mihomo" },
            ]}
          />
        </FormItem>
        {chainEditMode ? (
          <div className="space-y-4">
            <FormItem label={tr("browser.components.ProxyImportModalView.label.d3f4ba1")}>
              <Input
                type="number"
                min={1}
                max={65535}
                value={chainEditForm.localPort}
                onChange={(event) => onChainEditFormChange({ localPort: event.target.value })}
                placeholder={tr("browser.components.ProxyImportModalView.placeholder.08eb3ce")}
              />
            </FormItem>
            <div className="rounded-md border border-[var(--color-border)] p-3 space-y-3">
              <h4 className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.components.ProxyImportModalView.text.05d4bfc")}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormItem label={tr("browser.components.ProxyImportModalView.label.b0c4316")}>
                  <Select
                    value={chainEditForm.first.protocol}
                    onChange={(event) => onChainEditHopChange('first', 'protocol', event.target.value)}
                    options={[
                      { value: 'http', label: "HTTP" },
                      { value: 'socks5', label: "SOCKS5" },
                    ]}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.903f8d3")} required>
                  <Input
                    value={chainEditForm.first.server}
                    onChange={(event) => onChainEditHopChange('first', 'server', event.target.value)}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.52b14ee")} required>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={chainEditForm.first.port}
                    onChange={(event) => onChainEditHopChange('first', 'port', event.target.value)}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.75312f8")}>
                  <Input
                    value={chainEditForm.first.username}
                    onChange={(event) => onChainEditHopChange('first', 'username', event.target.value)}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.29e03e6")}>
                  <Input
                    type="password"
                    value={chainEditForm.first.password}
                    onChange={(event) => onChainEditHopChange('first', 'password', event.target.value)}
                  />
                </FormItem>
              </div>
            </div>
            <div className="rounded-md border border-[var(--color-border)] p-3 space-y-3">
              <h4 className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.components.ProxyImportModalView.text.bf35c8b")}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormItem label={tr("browser.components.ProxyImportModalView.label.b0c4316")}>
                  <Select
                    value={chainEditForm.second.protocol}
                    onChange={(event) => onChainEditHopChange('second', 'protocol', event.target.value)}
                    options={[
                      { value: 'http', label: "HTTP" },
                      { value: 'socks5', label: "SOCKS5" },
                    ]}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.903f8d3")} required>
                  <Input
                    value={chainEditForm.second.server}
                    onChange={(event) => onChainEditHopChange('second', 'server', event.target.value)}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.52b14ee")} required>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={chainEditForm.second.port}
                    onChange={(event) => onChainEditHopChange('second', 'port', event.target.value)}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.75312f8")}>
                  <Input
                    value={chainEditForm.second.username}
                    onChange={(event) => onChainEditHopChange('second', 'username', event.target.value)}
                  />
                </FormItem>
                <FormItem label={tr("browser.components.ProxyImportModalView.label.29e03e6")}>
                  <Input
                    type="password"
                    value={chainEditForm.second.password}
                    onChange={(event) => onChainEditHopChange('second', 'password', event.target.value)}
                  />
                </FormItem>
              </div>
            </div>
          </div>
        ) : directEditMode ? (
          <div className="rounded-md border border-[var(--color-border)] p-3 space-y-3">
            <h4 className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.pages.proxyPool.ProxyPoolModals.text.0965c09")}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormItem label={tr("browser.components.ProxyImportModalView.label.b0c4316")}>
                <Select
                  value={directEditForm.protocol}
                  onChange={(event) => onDirectEditFormChange({ protocol: event.target.value as DirectImportForm['protocol'] })}
                  options={[
                    { value: 'http', label: "HTTP" },
                    { value: 'https', label: "HTTPS" },
                    { value: 'socks5', label: "SOCKS5" },
                  ]}
                />
              </FormItem>
              <FormItem label={tr("browser.components.ProxyImportModalView.label.903f8d3")} required>
                <Input
                  value={directEditForm.server}
                  onChange={(event) => onDirectEditFormChange({ server: event.target.value })}
                />
              </FormItem>
              <FormItem label={tr("browser.components.ProxyImportModalView.label.52b14ee")} required>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={directEditForm.port}
                  onChange={(event) => onDirectEditFormChange({ port: event.target.value })}
                />
              </FormItem>
              <FormItem label={tr("browser.components.ProxyImportModalView.label.75312f8")}>
                <Input
                  value={directEditForm.username}
                  onChange={(event) => onDirectEditFormChange({ username: event.target.value })}
                />
              </FormItem>
              <FormItem label={tr("browser.components.ProxyImportModalView.label.29e03e6")}>
                <Input
                  type="password"
                  value={directEditForm.password}
                  onChange={(event) => onDirectEditFormChange({ password: event.target.value })}
                />
              </FormItem>
            </div>
          </div>
        ) : (
          <FormItem label={tr("browser.components.ProxyPickerModal.edit.label.6c9e697")}>
            <Textarea
              value={editForm.proxyConfig}
              onChange={(event) => onChange({ proxyConfig: event.target.value })}
              rows={10}
              placeholder={tr("browser.pages.proxyPool.ProxyPoolModals.placeholder.6070b3a")}
            />
          </FormItem>
        )}
        <FormItem label={tr("browser.components.ProxyPickerModal.edit.label.dca90c5")}>
          <Textarea
            value={editForm.dnsServers}
            onChange={(event) => onChange({ dnsServers: event.target.value })}
            rows={6}
            placeholder={`dns:\n  enable: true\n  nameserver:\n    - 119.29.29.29\n    - 223.5.5.5`}
          />
        </FormItem>
      </div>
    </Modal>
  )
}

interface ProxyPoolIPHealthDetailModalProps {
  open: boolean
  detail: ProxyIPHealthResult | null
  onClose: () => void
}

export function ProxyPoolIPHealthDetailModal({
  open,
  detail,
  onClose,
}: ProxyPoolIPHealthDetailModalProps) {
  useLocale()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("browser.pages.proxyPool.ProxyPoolModals.title.521068c")}
      width="760px"
      footer={
        <Button variant="secondary" onClick={onClose}>{tr("ui.components.Modal.aria_label.6c14bd7")}</Button>
      }
    >
      <div className="space-y-3">
        {detail && (
          <>
            <div className="text-xs text-[var(--color-text-muted)]">{tr("browser.pages.proxyPool.ProxyPoolModals.text.0fba978")}{detail.proxyId}{tr("browser.pages.proxyPool.ProxyPoolModals.text.2777e68")}{detail.source}{tr("browser.pages.proxyPool.ProxyPoolModals.text.739d254")}{detail.updatedAt}
            </div>
            {(() => {
              const diagnostic = normalizeProxyDiagnostic(detail as unknown as Record<string, unknown>, {
                proxyId: detail.proxyId,
                checkedAt: detail.updatedAt,
                engine: detail.engine,
                source: detail.source,
              })
              return (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-3 py-2 text-xs sm:grid-cols-4">
                  <div><span className="text-[var(--color-text-muted)]">{tr("browser.pages.proxyPool.ProxyPoolModals.text.4ca39fa")}</span><div className="mt-0.5 text-[var(--color-text-primary)]">{diagnosticStageLabel(diagnostic.stage)}</div></div>
                  <div><span className="text-[var(--color-text-muted)]">{tr("browser.pages.proxyPool.ProxyPoolModals.text.e08c1d4")}</span><div className="mt-0.5 font-mono text-[var(--color-text-primary)]">{diagnostic.code || '-'}</div></div>
                  <div><span className="text-[var(--color-text-muted)]">{tr("browser.pages.BrowserDetailPage.text.8f190c5")}</span><div className="mt-0.5 text-[var(--color-text-primary)]">{diagnostic.engine || '-'}</div></div>
                  <div><span className="text-[var(--color-text-muted)]">{tr("browser.pages.proxyPool.ProxyPoolModals.text.941f083")}</span><div className="mt-0.5 truncate text-[var(--color-text-primary)]" title={diagnostic.targetUrl || undefined}>{diagnostic.targetUrl || '-'}</div></div>
                </div>
              )
            })()}
            {!detail.ok && <div className="text-sm text-[var(--color-error)]">{detail.error || tr("browser.pages.proxyPool.ProxyPoolModals.ProxyPoolIPHealthDetailModal.92d705e")}</div>}
            <pre className="max-h-[420px] overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 text-xs leading-5">
              {JSON.stringify(detail.rawData || {}, null, 2)}
            </pre>
          </>
        )}
      </div>
    </Modal>
  )
}
