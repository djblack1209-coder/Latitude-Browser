import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale, localized } from '../../../shared/i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, HelpCircle, RefreshCw } from 'lucide-react'
import { Button, ConfirmModal, FormItem, Input, Modal, Select, Switch, Textarea } from '../../../shared/components'
import {
  type FingerprintConfig,
  FINGERPRINT_PRESETS,
  PRESET_RESOLUTIONS,
  buildAcceptLanguage,
  buildFingerprintConfigFromPersona,
  deserialize,
  getSystemTimezone,
  randomFingerprintSeed,
  serialize,
  validateFingerprintArgs,
} from '../utils/fingerprintSerializer'
import { FINGERPRINT_CAPABILITIES, FINGERPRINT_PERSONAS, capabilityModeLabel } from '../utils/fingerprintCapabilities'

interface FingerprintPanelProps {
  value: string[]
  onChange: (args: string[]) => void
}

const BRAND_OPTIONS = localized(() => ([
  { value: '', label: tr("browser.components.FingerprintPanel.label.c36948a") },
  { value: 'Chrome', label: tr("ui.modules.browser.components.FingerprintPanel.label.218e75c") },
  { value: 'Edge', label: tr("ui.modules.browser.components.FingerprintPanel.label.8440b9e") },
  { value: 'Opera', label: tr("ui.modules.browser.components.FingerprintPanel.label.19c9c9e") },
  { value: 'Vivaldi', label: tr("ui.modules.browser.components.FingerprintPanel.label.a096261") },
]))

const PLATFORM_OPTIONS = localized(() => ([
  { value: '', label: tr("browser.components.FingerprintPanel.label.c36948a") },
  { value: 'windows', label: tr("ui.modules.browser.components.FingerprintPanel.label.26d9c28") },
  { value: 'macos', label: tr("ui.modules.browser.components.FingerprintPanel.label.cd6fdcb") },
  { value: 'linux', label: tr("ui.modules.browser.components.FingerprintPanel.label.83ad851") },
]))

const LANG_OPTIONS = localized(() => ([
  { value: '', label: tr("browser.components.FingerprintPanel.label.c36948a") },
  { value: 'zh-CN', label: tr("browser.components.FingerprintPanel.label.145d3b3") },
  { value: 'zh-HK', label: tr("browser.components.FingerprintPanel.label.cd3eb78") },
  { value: 'zh-TW', label: tr("browser.components.FingerprintPanel.label.a811fb5") },
  { value: 'en-US', label: tr("ui.modules.browser.components.FingerprintPanel.label.0101f93") },
  { value: 'en-GB', label: tr("ui.modules.browser.components.FingerprintPanel.label.5378a7d") },
  { value: 'en-CA', label: tr("ui.modules.browser.components.FingerprintPanel.label.f6cde7b") },
  { value: 'en-AU', label: tr("ui.modules.browser.components.FingerprintPanel.label.fbf9de6") },
  { value: 'en-SG', label: tr("ui.modules.browser.components.FingerprintPanel.label.45e4003") },
  { value: 'en-IN', label: tr("ui.modules.browser.components.FingerprintPanel.label.38d1df8") },
  { value: 'ja-JP', label: tr("browser.components.FingerprintPanel.label.afc8f9d") },
  { value: 'ko-KR', label: '한국어 (ko-KR)' },
  { value: 'fr-FR', label: tr("ui.modules.browser.components.FingerprintPanel.label.22cd70c") },
  { value: 'de-DE', label: tr("ui.modules.browser.components.FingerprintPanel.label.b1578b1") },
  { value: 'nl-NL', label: tr("ui.modules.browser.components.FingerprintPanel.label.9caadfd") },
  { value: 'ru-RU', label: 'Русский (ru-RU)' },
  { value: 'pt-BR', label: tr("ui.modules.browser.components.FingerprintPanel.label.2f924a8") },
]))

const BRAND_VERSION_OPTIONS = [
  { value: '144.0.7559.132', label: '144.0.7559.132' },
  { value: '143.0.7499.10', label: '143.0.7499.10' },
  { value: '148.0.7778.215', label: '148.0.7778.215' },
]

const PLATFORM_VERSION_OPTIONS = [
  { value: '10.0.0', label: tr("ui.modules.browser.components.FingerprintPanel.label.89bd871") },
  { value: '15.2.0', label: tr("ui.modules.browser.components.FingerprintPanel.label.3e438ad") },
]

const ACCEPT_LANG_OPTIONS = LANG_OPTIONS
  .filter(option => option.value)
  .map(option => ({ value: buildAcceptLanguage(option.value), label: buildAcceptLanguage(option.value) }))

const TIMEZONE_OPTIONS = localized(() => ([
  { value: '', label: tr("browser.components.FingerprintPanel.label.c36948a") },
  { value: 'system', label: tr("browser.components.FingerprintPanel.label.d8a40d2") },
  { value: 'Asia/Shanghai', label: tr("ui.modules.browser.components.FingerprintPanel.label.f4b5502") },
  { value: 'Asia/Tokyo', label: tr("ui.modules.browser.components.FingerprintPanel.label.fdc201a") },
  { value: 'Asia/Seoul', label: tr("ui.modules.browser.components.FingerprintPanel.label.cbd81d5") },
  { value: 'Asia/Singapore', label: tr("ui.modules.browser.components.FingerprintPanel.label.a63d37e") },
  { value: 'Asia/Hong_Kong', label: tr("ui.modules.browser.components.FingerprintPanel.label.fef67b2") },
  { value: 'Asia/Taipei', label: tr("ui.modules.browser.components.FingerprintPanel.label.2b8b197") },
  { value: 'Asia/Dubai', label: tr("ui.modules.browser.components.FingerprintPanel.label.cc3db9f") },
  { value: 'Asia/Kolkata', label: tr("ui.modules.browser.components.FingerprintPanel.label.703e399") },
  { value: 'America/New_York', label: tr("ui.modules.browser.components.FingerprintPanel.label.07f1934") },
  { value: 'America/Los_Angeles', label: tr("ui.modules.browser.components.FingerprintPanel.label.2f053ee") },
  { value: 'America/Chicago', label: tr("ui.modules.browser.components.FingerprintPanel.label.3d3d701") },
  { value: 'America/Denver', label: tr("ui.modules.browser.components.FingerprintPanel.label.a341282") },
  { value: 'America/Toronto', label: tr("ui.modules.browser.components.FingerprintPanel.label.b5260c8") },
  { value: 'America/Vancouver', label: tr("ui.modules.browser.components.FingerprintPanel.label.5c848cd") },
  { value: 'America/Phoenix', label: tr("ui.modules.browser.components.FingerprintPanel.label.ddb1ea2") },
  { value: 'America/Sao_Paulo', label: tr("ui.modules.browser.components.FingerprintPanel.label.63c48cf") },
  { value: 'Europe/London', label: tr("ui.modules.browser.components.FingerprintPanel.label.d2ecb83") },
  { value: 'Europe/Paris', label: tr("ui.modules.browser.components.FingerprintPanel.label.16eb6bc") },
  { value: 'Europe/Berlin', label: tr("ui.modules.browser.components.FingerprintPanel.label.098eff9") },
  { value: 'Europe/Moscow', label: tr("ui.modules.browser.components.FingerprintPanel.label.399058d") },
  { value: 'Australia/Sydney', label: tr("ui.modules.browser.components.FingerprintPanel.label.018e60e") },
  { value: 'Australia/Melbourne', label: tr("ui.modules.browser.components.FingerprintPanel.label.a4f58ee") },
  { value: 'Australia/Perth', label: tr("ui.modules.browser.components.FingerprintPanel.label.884d2b9") },
  { value: 'Pacific/Auckland', label: tr("ui.modules.browser.components.FingerprintPanel.label.2091bbb") },
]))

const RESOLUTION_OPTIONS = localized(() => ([
  { value: '', label: tr("browser.components.FingerprintPanel.label.c36948a") },
  ...PRESET_RESOLUTIONS.map(r => ({ value: r, label: r })),
  { value: 'custom', label: tr("browser.components.FingerprintPanel.label.d725f4e") },
]))

const HARDWARE_CONCURRENCY_OPTIONS = localized(() => ([
  { value: '', label: tr("browser.components.FingerprintPanel.label.c36948a") },
  { value: '2', label: tr("browser.components.FingerprintPanel.label.2be9f00") },
  { value: '4', label: tr("browser.components.FingerprintPanel.label.ef6e099") },
  { value: '6', label: tr("browser.components.FingerprintPanel.label.7dac521") },
  { value: '8', label: tr("browser.components.FingerprintPanel.label.7e32334") },
  { value: '10', label: tr("browser.components.FingerprintPanel.label.a429b8a") },
  { value: '12', label: tr("browser.components.FingerprintPanel.label.1fe2fe2") },
  { value: '16', label: tr("browser.components.FingerprintPanel.label.f7f1539") },
]))

const WEBRTC_OPTIONS = localized(() => ([
  { value: '', label: tr("browser.components.FingerprintPanel.label.c36948a") },
  { value: 'disable_non_proxied_udp', label: tr("browser.components.FingerprintPanel.label.f3427fc") },
  { value: 'default_public_interface_only', label: tr("browser.components.FingerprintPanel.label.6ac8fad") },
  { value: 'default_public_and_private_interfaces', label: tr("browser.components.FingerprintPanel.label.35776a9") },
]))

const NOISE_OPTIONS = localized(() => ([
  { value: '', label: tr("browser.components.FingerprintPanel.label.6507239") },
  { value: '0', label: tr("browser.components.FingerprintPanel.label.1de8fa1") },
  { value: '1', label: tr("browser.components.FingerprintPanel.label.b2c5542") },
]))

const SPOOFING_OPTIONS = localized(() => ([
  { value: 'font', label: tr("browser.components.FingerprintPanel.label.b50d4d8") },
  { value: 'audio', label: tr("browser.components.FingerprintPanel.label.461189f") },
  { value: 'canvas', label: tr("ui.modules.browser.components.FingerprintPanel.label.a3f80b8") },
  { value: 'clientrects', label: tr("ui.modules.browser.components.FingerprintPanel.label.4e32b74") },
  { value: 'gpu', label: tr("ui.modules.browser.components.FingerprintPanel.label.a6a6318") },
]))

const PRESET_OPTIONS = localized(() => ([
  { value: '', label: tr("browser.components.FingerprintPanel.label.d926d3b") },
  ...FINGERPRINT_PRESETS.map(p => ({ value: p.id, label: p.name })),
]))

const PERSONA_OPTIONS = localized(() => ([
  { value: '', label: tr("browser.components.FingerprintPanel.label.7e7c498") },
  ...FINGERPRINT_PERSONAS.map(item => ({ value: item.id, label: item.name })),
]))

const ADVANCED_ARG_HELP_ROWS = localized(() => ([
  { arg: '--fingerprint=<seed>', usage: tr("browser.components.FingerprintPanel.usage.f184c35"), example: '--fingerprint=123456' },
  { arg: '--fingerprint-brand=<brand>', usage: tr("browser.components.FingerprintPanel.usage.6d19dfc"), example: '--fingerprint-brand=Chrome' },
  { arg: '--fingerprint-brand-version=<version>', usage: tr("browser.components.FingerprintPanel.usage.9940d08"), example: '--fingerprint-brand-version=144.0.7559.132' },
  { arg: '--fingerprint-platform=<platform>', usage: tr("browser.components.FingerprintPanel.usage.6130a58"), example: '--fingerprint-platform=windows' },
  { arg: '--fingerprint-platform-version=<version>', usage: tr("browser.components.FingerprintPanel.usage.efc0864"), example: '--fingerprint-platform-version=10.0.0' },
  { arg: '--lang=<locale>', usage: tr("browser.components.FingerprintPanel.usage.f5df9d4"), example: '--lang=ja-JP' },
  { arg: '--accept-lang=<list>', usage: tr("browser.components.FingerprintPanel.usage.4e9f6f6"), example: '--accept-lang=ja-JP,ja' },
  { arg: '--timezone=<iana>', usage: tr("browser.components.FingerprintPanel.usage.70ed0db"), example: '--timezone=Asia/Tokyo' },
  { arg: '--window-size=<w,h>', usage: tr("browser.components.FingerprintPanel.usage.3770095"), example: '--window-size=1600,900' },
  { arg: '--fingerprint-hardware-concurrency=<n>', usage: tr("browser.components.FingerprintPanel.usage.5152096"), example: '--fingerprint-hardware-concurrency=8' },
  { arg: '--disable-non-proxied-udp', usage: tr("browser.components.FingerprintPanel.usage.3b03d56"), example: '--disable-non-proxied-udp' },
  { arg: '--webrtc-ip-handling-policy=<policy>', usage: tr("browser.components.FingerprintPanel.usage.1d4ca53"), example: '--webrtc-ip-handling-policy=default_public_interface_only' },
  { arg: '--fingerprinting-canvas-image-data-noise', usage: tr("browser.components.FingerprintPanel.usage.a0ca60d"), example: '--fingerprinting-canvas-image-data-noise' },
  { arg: '--fingerprinting-client-rects-noise', usage: tr("browser.components.FingerprintPanel.usage.9caed54"), example: '--fingerprinting-client-rects-noise' },
  { arg: '--disable-spoofing=<items>', usage: tr("browser.components.FingerprintPanel.usage.9d3f75a"), example: '--disable-spoofing=font,audio' },
]))

interface EditableOptionInputProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}

interface FingerprintSectionProps {
  title: string
  children: ReactNode
}

function FingerprintSection({ title, children }: FingerprintSectionProps) {
  useLocale()

  return (
    <section className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-subtle)] p-4 shadow-[var(--shadow-xs)] space-y-4">
      <h4 className="text-xs font-medium text-[var(--color-text-muted)]  ">{title}</h4>
      {children}
    </section>
  )
}

function EditableOptionInput({ value, onChange, options, placeholder }: EditableOptionInputProps) {
  useLocale()

  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        className="pr-9"
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(current => !current)}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-lg">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function FingerprintPanel({ value, onChange }: FingerprintPanelProps) {
  useLocale()

  const [config, setConfig] = useState<FingerprintConfig>(() => deserialize(value))
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [advancedHelpOpen, setAdvancedHelpOpen] = useState(false)
  const [confirmSeedOpen, setConfirmSeedOpen] = useState(false)
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false)

  useEffect(() => {
    setConfig(deserialize(value))
  }, [value.join('\n')])

  const update = (patch: Partial<FingerprintConfig>) => {
    const next = { ...config, ...patch }
    setConfig(next)
    onChange(serialize(next))
  }

  const handlePresetChange = (presetId: string) => {
    if (!presetId) return
    const preset = FINGERPRINT_PRESETS.find(p => p.id === presetId)
    if (!preset) return
    const next: FingerprintConfig = {
      ...preset.config,
      seed: randomFingerprintSeed(),
      unknownArgs: config.unknownArgs,
    }
    setConfig(next)
    onChange(serialize(next))
  }

  const handleAdvancedChange = (text: string) => {
    const args = text.split('\n').map(s => s.trim()).filter(Boolean)
    const parsed = deserialize(args)
    setConfig(parsed)
    onChange(serialize(parsed))
  }

  const handlePersonaChange = (personaId: string) => {
    if (!personaId) return
    const persona = FINGERPRINT_PERSONAS.find(item => item.id === personaId)
    if (!persona) return
    const next: FingerprintConfig = {
      ...buildFingerprintConfigFromPersona(persona),
      unknownArgs: config.unknownArgs,
    }
    setConfig(next)
    onChange(serialize(next))
  }

  const toggleDisableSpoofing = (key: string, checked: boolean) => {
    const current = config.disableSpoofing ?? []
    const next = checked ? [...current, key] : current.filter(item => item !== key)
    update({ disableSpoofing: next.length ? next : undefined })
  }

  const advancedText = serialize(config).join('\n')
  const validation = validateFingerprintArgs(value)
  const validationTone = validation.issues.some(issue => issue.level === 'error')
    ? 'border-red-200 bg-red-50 text-red-700'
    : validation.issues.some(issue => issue.level === 'warning')
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]'
  const validationTitle = validation.valid
    ? validation.issues.some(issue => issue.level === 'warning') ? tr("browser.components.FingerprintPanel.FingerprintPanel.41c8fb7") : tr("browser.components.FingerprintPanel.FingerprintPanel.bcee643")
    : tr("browser.components.FingerprintPanel.FingerprintPanel.537bae1")

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border px-3 py-2 text-sm ${validationTone}`}>
        <div className="font-medium">{validationTitle}</div>
        {validation.issues.length > 0 && (
          <ul className="mt-1 space-y-1">
            {validation.issues.slice(0, 4).map((issue, index) => (
              <li key={`${issue.level}-${index}`} className="text-xs">{translateMessage(issue.message)}</li>
            ))}
            {validation.issues.length > 4 && <li className="text-xs">{tr("browser.components.FingerprintPanel.text.e2698ec")}{validation.issues.length - 4}{tr("browser.components.FingerprintPanel.text.2024730")}</li>}
          </ul>
        )}
      </div>

      <div className="p-3 rounded-lg bg-[var(--color-bg-hover)] border border-[var(--color-border)] space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-[var(--color-text-muted)]  ">{tr("browser.copyOptions.label.8e9fa06")}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
            onClick={() => setConfirmSeedOpen(true)}
          >
            <RefreshCw className="w-3 h-3" />{tr("browser.components.BrowserListWidgets.title.2e19057")}</button>
        </div>
        <Input value={config.seed ?? ''} onChange={e => update({ seed: e.target.value || undefined })} placeholder={tr("browser.components.FingerprintPanel.placeholder.fad06ef")} />
      </div>

      <ConfirmModal
        open={confirmSeedOpen}
        onClose={() => setConfirmSeedOpen(false)}
        onConfirm={() => update({ seed: randomFingerprintSeed() })}
        title={tr("browser.components.FingerprintPanel.title.65b1d78")}
        content={tr("browser.components.FingerprintPanel.content.d6de92f")}
        confirmText={tr("browser.components.FingerprintPanel.confirmText.769e31b")}
      />

      <Modal
        open={capabilitiesOpen}
        onClose={() => setCapabilitiesOpen(false)}
        title={tr("browser.components.FingerprintPanel.title.bdb5324")}
        width="860px"
        footer={<Button variant="secondary" onClick={() => setCapabilitiesOpen(false)}>{tr("ui.components.Modal.aria_label.6c14bd7")}</Button>}
      >
        <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
          <div className="grid grid-cols-[120px_96px_minmax(0,1fr)] gap-3 px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border)] bg-[var(--color-bg-hover)]">
            <div>{tr("browser.components.FingerprintPanel.text.eb9d53c")}</div>
            <div>{tr("browser.components.FingerprintPanel.text.ed0eea8")}</div>
            <div>{tr("browser.components.FingerprintPanel.text.a260562")}</div>
          </div>
          {FINGERPRINT_CAPABILITIES.map(item => (
            <div key={item.id} className="grid grid-cols-[120px_96px_minmax(0,1fr)] gap-3 px-3 py-2 text-xs border-b last:border-b-0 border-[var(--color-border)]">
              <div className="font-medium text-[var(--color-text-primary)]">{item.name}</div>
              <div className="text-[var(--color-text-secondary)]">{capabilityModeLabel(item.mode)}</div>
              <div className="text-[var(--color-text-muted)]">{item.coverage}</div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={advancedHelpOpen}
        onClose={() => setAdvancedHelpOpen(false)}
        title={tr("browser.components.FingerprintPanel.title.34925a5")}
        width="980px"
        footer={<Button variant="secondary" onClick={() => setAdvancedHelpOpen(false)}>{tr("ui.components.Modal.aria_label.6c14bd7")}</Button>}
      >
        <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
          <div className="grid grid-cols-[220px_minmax(0,1fr)_minmax(220px,0.8fr)] gap-3 px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border)] bg-[var(--color-bg-hover)]">
            <div>{tr("browser.components.FingerprintPanel.text.749d765")}</div>
            <div>{tr("browser.components.FingerprintPanel.text.7c49c8f")}</div>
            <div>{tr("browser.automationScripts.createAutomationScriptDraft.30fd4ed")}</div>
          </div>
          {ADVANCED_ARG_HELP_ROWS.map(row => (
            <div key={row.arg} className="grid grid-cols-[220px_minmax(0,1fr)_minmax(220px,0.8fr)] gap-3 px-3 py-2 text-xs border-b last:border-b-0 border-[var(--color-border)]">
              <code className="break-all text-[var(--color-text-primary)]">{row.arg}</code>
              <div className="text-[var(--color-text-secondary)]">{row.usage}</div>
              <code className="break-all text-[var(--color-text-muted)]">{row.example}</code>
            </div>
          ))}
        </div>
      </Modal>

      <FingerprintSection title={tr("browser.components.FingerprintPanel.title.9e92f72")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormItem label={tr("browser.components.FingerprintPanel.label.427110e")}>
            <Select value="" onChange={e => handlePresetChange(e.target.value)} options={PRESET_OPTIONS} />
          </FormItem>

          <FormItem label={tr("browser.components.FingerprintPanel.label.e05cb00")}>
            <Select value="" onChange={e => handlePersonaChange(e.target.value)} options={PERSONA_OPTIONS} />
          </FormItem>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={() => setCapabilitiesOpen(true)}>{tr("browser.components.FingerprintPanel.text.a2f284e")}</Button>
        </div>
      </FingerprintSection>

      <FingerprintSection title={tr("browser.components.FingerprintPanel.title.6337b85")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormItem label={tr("browser.components.FingerprintPanel.label.363116d")}>
            <Select value={config.brand ?? ''} onChange={e => update({ brand: e.target.value || undefined })} options={BRAND_OPTIONS} />
          </FormItem>
          <FormItem label={tr("browser.components.FingerprintPanel.label.7fc28d3")}>
            <EditableOptionInput value={config.brandVersion ?? ''} onChange={nextValue => update({ brandVersion: nextValue || undefined })} options={BRAND_VERSION_OPTIONS} placeholder={tr("browser.components.FingerprintPanel.placeholder.b79e04d")} />
          </FormItem>
          <FormItem label={tr("browser.components.FingerprintPanel.label.e4b9d69")}>
            <Select value={config.platform ?? ''} onChange={e => update({ platform: e.target.value || undefined })} options={PLATFORM_OPTIONS} />
          </FormItem>
          <FormItem label={tr("browser.components.FingerprintPanel.label.735f889")}>
            <EditableOptionInput value={config.platformVersion ?? ''} onChange={nextValue => update({ platformVersion: nextValue || undefined })} options={PLATFORM_VERSION_OPTIONS} placeholder={tr("browser.components.FingerprintPanel.placeholder.22e009c")} />
          </FormItem>
          <FormItem label={tr("browser.components.FingerprintPanel.label.cd99b22")}>
            <Select value={config.lang ?? ''} onChange={e => update({ lang: e.target.value || undefined, acceptLang: undefined })} options={LANG_OPTIONS} />
          </FormItem>
          <FormItem label={tr("browser.components.FingerprintPanel.label.0778870")}>
            <EditableOptionInput value={config.acceptLang ?? ''} onChange={nextValue => update({ acceptLang: nextValue || undefined })} options={ACCEPT_LANG_OPTIONS} placeholder={config.lang ? tr("browser.components.FingerprintPanel.FingerprintPanel.5ce2332", [config.lang.split(/[-_]/)[0] === config.lang ? config.lang : `${config.lang},${config.lang.split(/[-_]/)[0]}`]) : tr("browser.components.FingerprintPanel.FingerprintPanel.85f6ee2")} />
          </FormItem>
          <FormItem label={tr("browser.components.FingerprintPanel.label.fb2a23d")}>
            <Select
              value={config.timezone ?? ''}
              onChange={e => update({ timezone: e.target.value || undefined })}
              options={TIMEZONE_OPTIONS.map(opt => opt.value === 'system' ? { ...opt, label: tr("browser.components.FingerprintPanel.label.e94392c", [getSystemTimezone()]) } : opt)}
            />
          </FormItem>
        </div>
      </FingerprintSection>

      <FingerprintSection title={tr("browser.components.FingerprintPanel.title.881ed4b")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormItem label={tr("browser.copyOptions.label.a599946")}>
            <Select value={config.resolution ?? ''} onChange={e => update({ resolution: e.target.value || undefined })} options={RESOLUTION_OPTIONS} />
          </FormItem>
          {config.resolution === 'custom' && (
            <FormItem label={tr("browser.components.FingerprintPanel.label.adbacb6")}>
              <Input value={config.customResolution ?? ''} onChange={e => update({ customResolution: e.target.value || undefined })} placeholder="1920,1080" />
            </FormItem>
          )}
          <FormItem label={tr("browser.copyOptions.detail.27bf340")}>
            <Select value={config.hardwareConcurrency ?? ''} onChange={e => update({ hardwareConcurrency: e.target.value || undefined })} options={HARDWARE_CONCURRENCY_OPTIONS} />
          </FormItem>
          <FormItem label={tr("browser.components.FingerprintPanel.label.caac8ad")}>
            <Select value={config.webrtcPolicy ?? ''} onChange={e => update({ webrtcPolicy: e.target.value || undefined })} options={WEBRTC_OPTIONS} />
          </FormItem>
        </div>
      </FingerprintSection>

      <FingerprintSection title={tr("browser.components.FingerprintPanel.title.01233a8")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormItem label={tr("browser.components.FingerprintPanel.label.cc178ca")}>
            <Select value={config.canvasNoise ?? ''} onChange={e => update({ canvasNoise: e.target.value || undefined })} options={NOISE_OPTIONS} />
          </FormItem>
          <FormItem label={tr("browser.components.FingerprintPanel.label.df61775")}>
            <Select value={config.clientRectsNoise ?? ''} onChange={e => update({ clientRectsNoise: e.target.value || undefined })} options={NOISE_OPTIONS} />
          </FormItem>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.components.FingerprintPanel.text.fa33189")}</div>
            <div className="text-xs text-[var(--color-text-muted)]">{tr("browser.components.FingerprintPanel.text.4dcd963")}</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {SPOOFING_OPTIONS.map(option => (
              <label key={option.value} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-subtle)] px-3 py-2 text-sm text-[var(--color-text-primary)]">
                <span>{tr("browser.components.FingerprintPanel.text.adcc1a9")}{option.label}</span>
                <Switch
                  checked={(config.disableSpoofing ?? []).includes(option.value)}
                  onChange={checked => toggleDisableSpoofing(option.value, checked)}
                />
              </label>
            ))}
          </div>
        </div>
      </FingerprintSection>

      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] transition-colors"
          onClick={() => setAdvancedOpen(v => !v)}
        >
          <span className="inline-flex items-center gap-2">
            <span>{tr("browser.components.FingerprintPanel.text.f6d6152")}</span>
            <span
              role="button"
              tabIndex={0}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]"
              onClick={event => {
                event.stopPropagation()
                setAdvancedHelpOpen(true)
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  setAdvancedHelpOpen(true)
                }
              }}
              aria-label={tr("browser.components.FingerprintPanel.aria_label.f1753f8")}
            >
              <HelpCircle className="h-4 w-4" />
            </span>
          </span>
          {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {advancedOpen && (
          <div className="px-4 pb-4 pt-2 border-t border-[var(--color-border)]">
            <p className="text-xs text-[var(--color-text-muted)] mb-2">{tr("browser.components.FingerprintPanel.text.ac4543c")}</p>
            <Textarea
              value={advancedText}
              onChange={e => handleAdvancedChange(e.target.value)}
              rows={6}
              placeholder="--fingerprint-brand=Chrome"
            />
          </div>
        )}
      </div>
    </div>
  )
}
