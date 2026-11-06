import { tr, useLocale, localized } from '../../../../shared/i18n'
import { useState } from 'react'

import { Button, Modal } from '../../../../shared/components'

type UsageGuideTab = 'clash' | 'direct' | 'ipfly'
type ChannelDetailTab = 'ipfly'

interface ProxyPoolUsageGuideModalProps {
  open: boolean
  onClose: () => void
}

const usageTabs: Array<{ value: UsageGuideTab; label: string; hint: string }> = localized(() => ([
  { value: 'clash', label: tr("browser.components.ProxyImportModalView.text.7aa93f5"), hint: tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.hint.47f3347") },
  { value: 'direct', label: tr("ui.modules.browser.pages.proxyPool.ProxyPoolUsageGuideModal.label.3947166"), hint: tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.hint.4ed2d43") },
  { value: 'ipfly', label: tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.label.c0142ab"), hint: tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.hint.d2c0c3e") },
]))

const channelDetailTabs: Array<{ value: ChannelDetailTab; label: string; hint: string }> = localized(() => ([
  { value: 'ipfly', label: tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.label.3d11f10"), hint: tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.hint.9116ff2") },
]))

const clashYAML = `proxies:
  - name: hk-vless
    type: vless
    server: example.com
    port: 443
    uuid: your-uuid
    network: ws
    tls: true
    servername: example.com
    ws-opts:
      path: /proxy`




const directJSON = () => tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.message.33bb52d")
const directLines = () => tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.message.2bd390a")
const ipflyJSON = () => tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.message.90b4986")

export function ProxyPoolUsageGuideModal({ open, onClose }: ProxyPoolUsageGuideModalProps) {
  useLocale()

  const [activeTab, setActiveTab] = useState<UsageGuideTab>('ipfly')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.89ea43c")}
      width="920px"
      footer={<Button onClick={onClose}>{tr("browser.pages.BrowserEditPage.text.cb63c62")}</Button>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[var(--color-bg-secondary)] p-1">
          {usageTabs.map(tab => {
            const active = activeTab === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
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

        {activeTab === 'clash' && <ClashGuide />}
        {activeTab === 'direct' && <DirectGuide />}
        {activeTab === 'ipfly' && <IPFLYGuide />}
      </div>
    </Modal>
  )
}

function ClashGuide() {
  useLocale()

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <GuideCard title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.5a6c01a")} text={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.96b0718")} />
        <GuideCard title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.c722a6e")} text={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.046f597")} />
        <GuideCard title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.ebb0287")} text={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.b138f91")} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
        <InfoPanel
          title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.a531714")}
          items={[
            tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.ClashGuide.a85eb05"),
            tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.ClashGuide.88593b0"),
            tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.ClashGuide.79ec41e"),
          ]}
        />
        <CodeBlock value={clashYAML} />
      </div>
      <InfoPanel
        title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.65b10b6")}
        items={[
          tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.ClashGuide.2269da3"),
          tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.ClashGuide.986cb97"),
          tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.ClashGuide.abc6d43"),
        ]}
      />
    </div>
  )
}

function DirectGuide() {
  useLocale()

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <GuideCard title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.009d0a0")} text={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.016589a")} />
        <GuideCard title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.865c558")} text={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.d362f8f")} />
        <GuideCard title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.0cfc7c7")} text={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.d230dcf")} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
        <InfoPanel
          title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.b8c63ae")}
          items={[
            tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.DirectGuide.ca6203b"),
            tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.DirectGuide.8172670"),
            tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.DirectGuide.0dfd85b"),
          ]}
        />
        <CodeBlock value={directJSON()} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
        <InfoPanel
          title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.6470a2c")}
          items={[
            tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.DirectGuide.b9d4bfe"),
            tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.DirectGuide.962d2be"),
            tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.DirectGuide.dbf01d2"),
          ]}
        />
        <CodeBlock value={directLines()} />
      </div>
    </div>
  )
}

function IPFLYGuide() {
  useLocale()

  const [activeDetailTab, setActiveDetailTab] = useState<ChannelDetailTab>('ipfly')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-xl bg-[var(--color-bg-secondary)] p-2">
        {channelDetailTabs.map(tab => {
          const active = activeDetailTab === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveDetailTab(tab.value)}
              className={active
                ? 'rounded-full bg-[var(--color-text-primary)] px-3 py-1.5 text-left text-white shadow-sm'
                : 'rounded-full border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-left text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }
            >
              <span className="text-xs font-semibold">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {activeDetailTab === 'ipfly' && (
        <>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <div className="text-sm font-semibold">{tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.a7ae3d4")}</div>
        <div className="mt-2 text-xs leading-5">{tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.b3762e6")}</div>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        <GuideCard title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.dadb13c")} text={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.60be964")} />
        <GuideCard title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.dfc6fb9")} text={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.4c9234d")} />
        <GuideCard title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.6763209")} text={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.ef9615e")} />
        <GuideCard title={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.title.90799df")} text={tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.607e9c3")} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] p-4 text-xs leading-6 text-[var(--color-text-secondary)]">
          <div className="font-semibold text-[var(--color-text-primary)]">{tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.f8282e3")}</div>
          <div className="mt-2 font-mono">{tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.95c5693")}</div>
          <div className="font-mono">{tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.e18bce4")}</div>
          <div className="mt-2">{tr("browser.pages.proxyPool.ProxyPoolUsageGuideModal.text.fa9184b")}</div>
        </div>
        <CodeBlock value={ipflyJSON()} />
      </div>
        </>
      )}
    </div>
  )
}

function GuideCard({ title, text }: { title: string; text: string }) {
  useLocale()

  return (
    <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] p-4">
      <div className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</div>
      <div className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">{text}</div>
    </div>
  )
}

function InfoPanel({ title, items }: { title: string; items: string[] }) {
  useLocale()

  return (
    <div className="rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] p-4">
      <div className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</div>
      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--color-text-secondary)]">
        {items.map(item => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-text-muted)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CodeBlock({ value }: { value: string }) {
  useLocale()

  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--color-bg-muted)] p-4 text-xs leading-5 text-[var(--color-text-secondary)]">
      {value}
    </pre>
  )
}
