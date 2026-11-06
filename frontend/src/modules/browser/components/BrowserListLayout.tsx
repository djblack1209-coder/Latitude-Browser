import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
import { Link } from 'react-router-dom'
import { LatitudeField } from '../../../shared/layout/LatitudeField'
import { CheckCircle, Edit2, Plus, RefreshCw, Sliders, Star, Trash2, Upload, XCircle, LayoutGrid, List, Archive } from 'lucide-react'

import { Button, Card, FormItem, Input, Modal, Switch, Table, Textarea } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'

import type { BrowserCore, BrowserCoreInput, BrowserGroupWithCount, BrowserProxy, BrowserSettings } from '../types'
import { InstanceFilterBar } from './InstanceFilterBar'
import type { InstanceFilters } from './InstanceFilterBar'
import type { BrowserWorkspaceMode } from '../pages/browserList/workspaceMode'

export type BrowserViewMode = 'card' | 'table'

interface BrowserListHeaderProps {
  workspaceMode: BrowserWorkspaceMode
  profileCount: number
  filteredProfileCount: number
  hasActiveFilters: boolean
  runningCount: number
  attentionCount: number
  fingerprintSourceCount: number
  recentRecordedCount: number
  headerCollapsed: boolean
  viewMode: BrowserViewMode
  proxies: BrowserProxy[]
  cores: BrowserCore[]
  groups: BrowserGroupWithCount[]
  allTags: string[]
  filters: InstanceFilters
  onFiltersChange: (next: InstanceFilters) => void
  onToggleHeaderCollapsed: () => void
  onRefresh: () => void
  onOpenSettings: () => void
  onOpenTrash: () => void
  onImportProfiles: () => void
  onOpenBackup: () => void
  importingProfiles?: boolean
  onViewModeChange: (next: BrowserViewMode) => void
}

export function BrowserListHeader({ profileCount, filteredProfileCount, runningCount, attentionCount, viewMode, onViewModeChange, onOpenBackup, filters, onFiltersChange, proxies, cores, groups, allTags, headerCollapsed, onToggleHeaderCollapsed, onRefresh, onOpenSettings, onOpenTrash, onImportProfiles, importingProfiles = false }: BrowserListHeaderProps) {
  useLocale()

  return <>
    <section className="latitude-overview" aria-labelledby="instances-heading">
      <div className="latitude-overview-copy">
        <h1 id="instances-heading">{tr('nav.instances')}</h1>
        <p>{tr('shell.instancesHint')}</p>
        <dl className="latitude-overview-stats">
          <div><dd>{profileCount}</dd><dt>{tr('shell.total')}</dt></div>
          <div className="is-running"><dd>{runningCount}</dd><dt>{tr('shell.active')}</dt></div>
          <div className={attentionCount ? 'needs-attention' : ''}><dd>{attentionCount}</dd><dt>{tr('shell.attention')}</dt></div>
        </dl>
      </div>
      <LatitudeField />
    </section>
    <section className="latitude-instance-workspace" aria-label={tr('shell.allInstances')}>
      <div className="latitude-instance-heading">
        <h2>{tr('shell.allInstances')}<span className="latitude-count">{filteredProfileCount}</span></h2>
        <div className="latitude-view-toggle" role="group" aria-label={tr('nav.instances')}>
          <button type="button" onClick={() => onViewModeChange('table')} aria-pressed={viewMode === 'table'} aria-label={tr('shell.viewTable')} title={tr('shell.viewTable')}><List size={14} /></button>
          <button type="button" onClick={() => onViewModeChange('card')} aria-pressed={viewMode === 'card'} aria-label={tr('shell.viewCards')} title={tr('shell.viewCards')}><LayoutGrid size={14} /></button>
        </div>
      </div>
      <div className="terminal-instance-tools">
    <Input aria-label={tr("browser.components.BrowserListLayout.aria_label.9bf64db")} placeholder={tr("browser.components.BrowserListLayout.placeholder.3934546")} value={filters.keyword || filters.kwSearch} onChange={event => onFiltersChange({ ...filters, keyword: event.target.value, kwSearch: '' })} className="max-w-sm" />
    <div className="relative">
      <Button variant="secondary" size="sm" onClick={onToggleHeaderCollapsed} aria-expanded={!headerCollapsed}><Sliders size={14} />{tr("browser.components.BrowserListLayout.text.dcce9a1")}</Button>
      {!headerCollapsed && <div className="terminal-filter-popover"><InstanceFilterBar hideSearch filters={filters} onChange={onFiltersChange} proxies={proxies} cores={cores} groups={groups} allTags={allTags} /><div className="flex gap-3 mt-3"><Link to="/browser/list?sort=recent">{tr("config.navigation.config.name.8764fbc")}</Link><Link to="/browser/list?status=attention">{tr("config.navigation.config.name.59a9eb4")}</Link><Link to="/browser/list?view=templates">{tr("browser.components.BrowserListLayout.text.7526121")}</Link></div></div>}
    </div>
    <Button variant="ghost" size="sm" onClick={onRefresh} aria-label={tr("browser.components.BrowserListLayout.aria_label.78eaf8d")} title={tr("browser.components.AutomationRuntimeSnapshot.text.38108ea")}><RefreshCw size={14} /></Button>
    <div className="flex-1" />
    <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-label={tr("browser.components.BrowserListLayout.aria_label.5095009")} title={tr("browser.components.BrowserListLayout.aria_label.5095009")}><Sliders size={14} /></Button>
    <Button variant="ghost" size="sm" onClick={onOpenBackup} aria-label={tr('ui.layout.Topbar.getPageLabel.ac9b001')} title={tr('ui.layout.Topbar.getPageLabel.ac9b001')}><Archive size={14} /></Button>
    <Button variant="ghost" size="sm" onClick={onOpenTrash} aria-label={tr("browser.components.BrowserListLayout.aria_label.64ea875")} title={tr("browser.components.BrowserListLayout.aria_label.64ea875")}><Trash2 size={14} /></Button>
    <Button variant="secondary" size="sm" onClick={onImportProfiles} loading={importingProfiles}><Upload size={14} />{tr("browser.components.BrowserListLayout.text.60e2bca")}</Button>
    <Link to="/browser/auto-config"><Button size="sm"><Plus size={14} />{tr("browser.components.BrowserListLayout.text.9c614ae")}</Button></Link>
      </div>
    </section>
  </>
}

interface BrowserListSettingsModalProps {
  open: boolean
  settings: BrowserSettings
  fingerprintText: string
  launchText: string
  startUrlsText: string
  savingSettings: boolean
  cores: BrowserCore[]
  onClose: () => void
  onSave: () => void
  onSettingsChange: (patch: Partial<BrowserSettings>) => void
  onFingerprintTextChange: (next: string) => void
  onLaunchTextChange: (next: string) => void
  onStartUrlsTextChange: (next: string) => void
  onAddCore: () => void
  onEditCore: (core: BrowserCore) => void
  onDeleteCore: (coreId: string) => void
  onSetDefaultCore: (coreId: string) => void
}

export function BrowserListSettingsModal({
  open,
  settings,
  fingerprintText,
  launchText,
  startUrlsText,
  savingSettings,
  cores,
  onClose,
  onSave,
  onSettingsChange,
  onFingerprintTextChange,
  onLaunchTextChange,
  onStartUrlsTextChange,
  onAddCore,
  onEditCore,
  onDeleteCore,
  onSetDefaultCore,
}: BrowserListSettingsModalProps) {
  useLocale()

  const coreColumns: TableColumn<BrowserCore>[] = [
    { key: 'coreName', title: tr("browser.components.BrowserListLayout.title.1be7ae4") },
    { key: 'corePath', title: tr("browser.components.BrowserListLayout.title.9132e08") },
    {
      key: 'isDefault',
      title: tr("browser.api.runtime.message.c8d09cf"),
      render: (value) => (value ? <Star className="h-4 w-4 fill-[var(--color-warning)] text-[var(--color-warning)]" /> : null),
    },
    {
      key: 'actions',
      title: tr("browser.components.AutomationScriptHistoryModal.text.f3ea6d3"),
      align: 'right',
      render: (_, record) => (
        <div className="flex justify-end gap-1">
          {!record.isDefault && (
            <Button size="sm" variant="ghost" onClick={() => onSetDefaultCore(record.coreId)} aria-label={tr("browser.components.BrowserListLayout.BrowserListSettingsModal.03a3d64", [record.coreName])} title={tr("browser.components.BrowserListLayout.title.536a009")}>
              <Star className="w-4 h-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onEditCore(record)} aria-label={tr("browser.components.BrowserListLayout.BrowserListSettingsModal.623926f", [record.coreName])} title={tr("browser.components.BrowserListLayout.title.a7f814c")}>
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDeleteCore(record.coreId)} aria-label={tr("browser.components.BrowserListLayout.BrowserListSettingsModal.45e8cd6", [record.coreName])} title={tr("browser.components.BrowserListLayout.title.3755f56")}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("browser.components.BrowserListLayout.aria_label.5095009")}
      width="700px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          <Button onClick={onSave} loading={savingSettings}>{tr("browser.components.BrowserListLayout.text.fadf24d")}</Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.components.BrowserListLayout.text.6de3e8f")}</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={onAddCore}>
                <Plus className="w-4 h-4" />{tr("browser.components.BrowserListLayout.text.c5ae8df")}</Button>
            </div>
          </div>
          <Card padding="none">
            <Table columns={coreColumns} data={cores} rowKey="coreId" />
          </Card>
        </div>

        <FormItem label={tr("browser.components.BrowserListLayout.label.5b23d25")}>
          <Input
            value={settings.userDataRoot}
            onChange={(event) => onSettingsChange({ userDataRoot: event.target.value })}
            placeholder={tr("ui.modules.browser.components.BrowserListLayout.label.a17c9aa")}
          />
        </FormItem>
        <FormItem label={tr("browser.components.BrowserListLayout.label.51c2e53")}>
          <Textarea
            value={fingerprintText}
            onChange={(event) => onFingerprintTextChange(event.target.value)}
            rows={3}
            placeholder="--fingerprint-brand=Chrome"
          />
        </FormItem>
        <FormItem label={tr("browser.components.BrowserListLayout.label.0b1e606")}>
          <Textarea
            value={launchText}
            onChange={(event) => onLaunchTextChange(event.target.value)}
            rows={3}
            placeholder="--disable-sync"
          />
        </FormItem>
        <FormItem label={tr("browser.components.BrowserListLayout.label.d97e30a")} consequence={tr("browser.components.BrowserListLayout.hint.3f773d0")}>
          <Textarea
            value={startUrlsText}
            onChange={(event) => onStartUrlsTextChange(event.target.value)}
            rows={4}
            placeholder={tr("browser.components.BrowserListLayout.placeholder.64515b5")}
          />
        </FormItem>
        <FormItem label={tr("browser.components.BrowserListLayout.label.e6ab791")}>
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border-default)] px-3 py-2">
            <span className="text-sm text-[var(--color-text-primary)]">{tr("browser.components.BrowserListLayout.text.2d1a8ea")}</span>
            <Switch
              checked={settings.lightStartEnabled}
              onChange={(checked) => onSettingsChange({ lightStartEnabled: checked })}
            />
          </div>
        </FormItem>
        <FormItem label={tr("browser.components.BrowserListLayout.label.48e49d9")}>
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border-default)] px-3 py-2">
            <div>
              <p className="text-sm text-[var(--color-text-primary)]">{tr("browser.components.BrowserListLayout.text.1fe4dd2")}</p>
            </div>
            <Switch
              checked={settings.restoreLastSession}
              onChange={(checked) => onSettingsChange({ restoreLastSession: checked })}
            />
          </div>
        </FormItem>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <FormItem label={tr("browser.components.BrowserListLayout.label.1d9b89e")}>
            <Input
              type="number"
              min={1000}
              step={500}
              value={settings.startReadyTimeoutMs}
              onChange={(event) =>
                onSettingsChange({
                  startReadyTimeoutMs: Math.max(1000, Number(event.target.value) || 3000),
                })
              }
              placeholder="3000"
            />
          </FormItem>
          <FormItem label={tr("browser.components.BrowserListLayout.label.adb3f5b")}>
            <Input
              type="number"
              min={0}
              step={100}
              value={settings.startStableWindowMs}
              onChange={(event) =>
                onSettingsChange({
                  startStableWindowMs: Math.max(0, Number(event.target.value) || 1200),
                })
              }
              placeholder="1200"
            />
          </FormItem>
        </div>
      </div>
    </Modal>
  )
}

interface BrowserCoreEditorModalProps {
  open: boolean
  coreForm: BrowserCoreInput
  coreValidation: { valid: boolean; message: string } | null
  savingCore: boolean
  onClose: () => void
  onSave: () => void
  onValidate: () => void
  onCoreFormChange: (patch: Partial<BrowserCoreInput>) => void
}

export function BrowserCoreEditorModal({
  open,
  coreForm,
  coreValidation,
  savingCore,
  onClose,
  onSave,
  onValidate,
  onCoreFormChange,
}: BrowserCoreEditorModalProps) {
  useLocale()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={coreForm.coreId ? tr("browser.components.BrowserListLayout.BrowserCoreEditorModal.7863964") : tr("browser.components.BrowserListLayout.text.c5ae8df")}
      width="500px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          <Button onClick={onSave} loading={savingCore}>{tr("browser.components.BrowserListLayout.text.fadf24d")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormItem label={tr("browser.components.BrowserListLayout.label.01e4c4a")} required>
          <Input
            value={coreForm.coreName}
            onChange={(event) => onCoreFormChange({ coreName: event.target.value })}
            placeholder={tr("ui.modules.browser.components.BrowserListLayout.label.88e29b5")}
          />
        </FormItem>
        <FormItem label={tr("browser.components.BrowserListLayout.label.a1d450e")} required>
          <div className="flex gap-2">
            <Input
              value={coreForm.corePath}
              onChange={(event) => onCoreFormChange({ corePath: event.target.value })}
              placeholder={tr("browser.components.BrowserListLayout.placeholder.a5c344f")}
              className="flex-1"
            />
            <Button variant="secondary" onClick={onValidate}>{tr("browser.components.BrowserListLayout.text.80144e2")}</Button>
          </div>
          {coreValidation && (
            <div className={`mt-1 flex items-center gap-1 text-sm ${coreValidation.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
              {coreValidation.valid ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {translateMessage(coreValidation.message)}
            </div>
          )}
        </FormItem>
      </div>
    </Modal>
  )
}
