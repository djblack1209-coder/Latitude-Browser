import { tr, useLocale } from '../../../shared/i18n'
﻿import type { Dispatch, SetStateAction } from 'react'
import { Button, FormItem, Input, Modal, Select, Textarea } from '../../../shared/components'
import type { ChainEditForm, ChainHopForm } from './ProxyPickerModal.helpers'

interface ProxyEditModalProps {
  open: boolean
  chainEditMode: boolean
  editName: string
  editConfig: string
  editGroup: string
  editDnsServers: string
  chainEditForm: ChainEditForm
  saving: boolean
  setEditName: Dispatch<SetStateAction<string>>
  setEditConfig: Dispatch<SetStateAction<string>>
  setEditGroup: Dispatch<SetStateAction<string>>
  setEditDnsServers: Dispatch<SetStateAction<string>>
  setChainEditForm: Dispatch<SetStateAction<ChainEditForm>>
  updateChainHop: (hop: 'first' | 'second', field: keyof ChainHopForm, value: string) => void
  onClose: () => void
  onSave: () => void
}

export function ProxyEditModal({
  open,
  chainEditMode,
  editName,
  editConfig,
  editGroup,
  editDnsServers,
  chainEditForm,
  saving,
  setEditName,
  setEditConfig,
  setEditGroup,
  setEditDnsServers,
  setChainEditForm,
  updateChainHop,
  onClose,
  onSave,
}: ProxyEditModalProps) {
  useLocale()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("browser.components.ProxyPickerModal.edit.title.2b7d151")}
      width="520px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          <Button onClick={onSave} loading={saving}>{tr("browser.components.BrowserListLayout.text.fadf24d")}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormItem label={tr("browser.components.ProxyImportModal.title.c617e8e")} required>
          <Input
            value={chainEditMode ? chainEditForm.proxyName : editName}
            onChange={e => {
              if (chainEditMode) {
                setChainEditForm(prev => ({ ...prev, proxyName: e.target.value }))
              } else {
                setEditName(e.target.value)
              }
            }}
            placeholder={tr("browser.components.ProxyImportModalView.placeholder.3de90b4")}
          />
        </FormItem>

        <FormItem label={tr("browser.components.ProxyImportModalView.label.bf588e9")}>
          <Input value={editGroup} onChange={e => setEditGroup(e.target.value)} placeholder={tr("browser.components.GroupTreeNav.placeholder.65731c1")} />
        </FormItem>

        {chainEditMode ? (
          <div className="space-y-3 rounded-md border border-[var(--color-border)] p-3">
            <FormItem label={tr("browser.components.ProxyImportModalView.label.d3f4ba1")}>
              <Input
                type="number"
                min={1}
                max={65535}
                value={chainEditForm.localPort}
                onChange={e => setChainEditForm(prev => ({ ...prev, localPort: e.target.value }))}
                placeholder={tr("browser.components.ProxyImportModalView.placeholder.08eb3ce")}
              />
            </FormItem>
            <ChainHopSection title={tr("browser.components.ProxyImportModalView.text.05d4bfc")} hop="first" form={chainEditForm} updateChainHop={updateChainHop} />
            <ChainHopSection title={tr("browser.components.ProxyImportModalView.text.bf35c8b")} hop="second" form={chainEditForm} updateChainHop={updateChainHop} />
          </div>
        ) : (
          <FormItem label={tr("browser.components.ProxyPickerModal.edit.label.6c9e697")} required>
            <Textarea
              value={editConfig}
              onChange={e => setEditConfig(e.target.value)}
              rows={6}
              placeholder={tr("browser.components.ProxyPickerModal.edit.placeholder.8f42c2f")}
            />
          </FormItem>
        )}

        <FormItem label={tr("browser.components.ProxyPickerModal.edit.label.dca90c5")}>
          <Textarea
            value={editDnsServers}
            onChange={e => setEditDnsServers(e.target.value)}
            rows={4}
            placeholder={`dns:\n  enable: true\n  nameserver:\n    - 119.29.29.29\n    - 223.5.5.5`}
          />
        </FormItem>
      </div>
    </Modal>
  )
}

function ChainHopSection({
  title,
  hop,
  form,
  updateChainHop,
}: {
  title: string
  hop: 'first' | 'second'
  form: ChainEditForm
  updateChainHop: (hop: 'first' | 'second', field: keyof ChainHopForm, value: string) => void
}) {
  useLocale()

  const hopForm = form[hop]

  return (
    <div className="rounded-md border border-[var(--color-border)] p-3 space-y-3">
      <h4 className="text-sm font-medium text-[var(--color-text-primary)]">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormItem label={tr("browser.components.ProxyImportModalView.label.b0c4316")}>
          <Select
            value={hopForm.protocol}
            onChange={e => updateChainHop(hop, 'protocol', e.target.value)}
            options={[
              { value: 'http', label: "HTTP" },
              { value: 'socks5', label: "SOCKS5" },
            ]}
          />
        </FormItem>
        <FormItem label={tr("browser.components.ProxyImportModalView.label.903f8d3")} required>
          <Input value={hopForm.server} onChange={e => updateChainHop(hop, 'server', e.target.value)} />
        </FormItem>
        <FormItem label={tr("browser.components.ProxyImportModalView.label.52b14ee")} required>
          <Input type="number" min={1} max={65535} value={hopForm.port} onChange={e => updateChainHop(hop, 'port', e.target.value)} />
        </FormItem>
        <FormItem label={tr("browser.components.ProxyImportModalView.label.75312f8")}>
          <Input value={hopForm.username} onChange={e => updateChainHop(hop, 'username', e.target.value)} />
        </FormItem>
        <FormItem label={tr("browser.components.ProxyImportModalView.label.29e03e6")}>
          <Input type="password" value={hopForm.password} onChange={e => updateChainHop(hop, 'password', e.target.value)} />
        </FormItem>
      </div>
    </div>
  )
}
