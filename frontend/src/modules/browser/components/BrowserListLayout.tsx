import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, CheckCircle, ChevronRight, ChevronUp, Edit2, LayoutGrid, List, MoreHorizontal, Plus, RefreshCw, Sliders, Star, Trash2, Upload, XCircle } from 'lucide-react'

import { Button, Card, FormItem, Input, Modal, Switch, Table, Textarea } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'

import type { BrowserCore, BrowserCoreInput, BrowserGroupWithCount, BrowserProxy, BrowserSettings } from '../types'
import { InstanceFilterBar } from './InstanceFilterBar'
import type { InstanceFilters } from './InstanceFilterBar'

export type BrowserViewMode = 'card' | 'table'

interface BrowserListHeaderProps {
  profileCount: number
  filteredProfileCount: number
  runningCount: number
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

function HeaderUtilityMenu({
  onOpenSettings,
  onOpenTrash,
  onImportProfiles,
  onOpenBackup,
  importingProfiles,
}: {
  onOpenSettings: () => void
  onOpenTrash: () => void
  onImportProfiles: () => void
  onOpenBackup: () => void
  importingProfiles: boolean
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const runAndClose = (handler: () => void) => {
    handler()
    setOpen(false)
  }

  const itemClass = 'flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-[background-color,color] duration-150 hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="管理实例"
        title="管理"
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-[var(--color-text-secondary)] transition-[background-color,color] duration-150 hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">管理</span>
      </button>
      {open && (
        <div role="menu" aria-label="实例管理" className="absolute right-0 top-full z-30 mt-2 w-40 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-1 shadow-[var(--shadow-sm)]">
          <button type="button" role="menuitem" className={itemClass} onClick={() => runAndClose(onOpenSettings)}>
            <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
            基础配置
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => runAndClose(onOpenTrash)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            回收站
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => runAndClose(onImportProfiles)} disabled={importingProfiles}>
            {importingProfiles ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
            {importingProfiles ? '导入中' : '导入实例'}
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => runAndClose(onOpenBackup)}>
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            备份与恢复
          </button>
        </div>
      )}
    </div>
  )
}

export function BrowserListHeader({
  profileCount,
  filteredProfileCount,
  runningCount,
  headerCollapsed,
  viewMode,
  proxies,
  cores,
  groups,
  allTags,
  filters,
  onFiltersChange,
  onToggleHeaderCollapsed,
  onRefresh,
  onOpenSettings,
  onOpenTrash,
  onImportProfiles,
  onOpenBackup,
  importingProfiles = false,
  onViewModeChange,
}: BrowserListHeaderProps) {
  const filtered = filteredProfileCount !== profileCount

  return (
    <>
      <div className="browser-list-header apple-page-header flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">实例</h1>
          <span className="text-sm tabular-nums text-[var(--color-text-muted)]">
            {filtered ? `${filteredProfileCount} / ${profileCount}` : profileCount}
          </span>
          <span className="hidden h-3.5 w-px bg-[var(--color-border-muted)] sm:block" />
          <span className="hidden text-xs text-[var(--color-text-muted)] sm:inline">
            {runningCount > 0 ? `${runningCount} 个运行中` : '当前没有运行中的实例'}
          </span>
        </div>

        <div className="browser-list-actions flex flex-wrap items-center justify-end gap-1.5">
          <Link to="/browser/edit/new">
            <Button size="sm" className="px-3.5">
              <Plus className="w-4 h-4" />新建实例
            </Button>
          </Link>
          <div className="mx-1 h-5 w-px bg-[var(--color-border-muted)]" aria-hidden="true" />
          <HeaderUtilityMenu
            onOpenSettings={onOpenSettings}
            onOpenTrash={onOpenTrash}
            onImportProfiles={onImportProfiles}
            onOpenBackup={onOpenBackup}
            importingProfiles={importingProfiles}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleHeaderCollapsed}
            aria-label={headerCollapsed ? '显示筛选' : '隐藏筛选'}
            title={headerCollapsed ? '显示筛选' : '隐藏筛选'}
            className="px-2"
          >
            {headerCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            <span className="hidden sm:inline">筛选</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onRefresh} aria-label="刷新实例" title="刷新" className="px-2">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <div className="ml-1 flex items-center rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-muted)]/50 p-0.5" role="group" aria-label="视图模式">
            <button
              type="button"
              aria-label="卡片视图"
              aria-pressed={viewMode === 'card'}
              className={`rounded-sm p-1.5 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] ${viewMode === 'card' ? 'bg-[var(--color-bg-surface)] text-[var(--color-accent)] shadow-[var(--shadow-xs)]' : ''}`}
              onClick={() => onViewModeChange('card')}
              title="卡片视图"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="表格视图"
              aria-pressed={viewMode === 'table'}
              className={`rounded-sm p-1.5 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] ${viewMode === 'table' ? 'bg-[var(--color-bg-surface)] text-[var(--color-accent)] shadow-[var(--shadow-xs)]' : ''}`}
              onClick={() => onViewModeChange('table')}
              title="表格视图"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {!headerCollapsed && (
        <InstanceFilterBar
          filters={filters}
          onChange={onFiltersChange}
          proxies={proxies}
          cores={cores}
          allTags={allTags}
          groups={groups}
        />
      )}
    </>
  )
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
  const coreColumns: TableColumn<BrowserCore>[] = [
    { key: 'coreName', title: '名称' },
    { key: 'corePath', title: '路径' },
    {
      key: 'isDefault',
      title: '默认',
      render: (value) => (value ? <Star className="h-4 w-4 fill-[var(--color-warning)] text-[var(--color-warning)]" /> : null),
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (_, record) => (
        <div className="flex justify-end gap-1">
          {!record.isDefault && (
            <Button size="sm" variant="ghost" onClick={() => onSetDefaultCore(record.coreId)} aria-label={`设为默认内核：${record.coreName}`} title="设为默认">
              <Star className="w-4 h-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onEditCore(record)} aria-label={`编辑内核：${record.coreName}`} title="编辑">
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDeleteCore(record.coreId)} aria-label={`删除内核：${record.coreName}`} title="删除">
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
      title="基础配置"
      width="700px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={onSave} loading={savingSettings}>保存</Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">内核管理</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={onAddCore}>
                <Plus className="w-4 h-4" />新增内核
              </Button>
            </div>
          </div>
          <Card padding="none">
            <Table columns={coreColumns} data={cores} rowKey="coreId" />
          </Card>
        </div>

        <FormItem label="用户数据根目录">
          <Input
            value={settings.userDataRoot}
            onChange={(event) => onSettingsChange({ userDataRoot: event.target.value })}
            placeholder="data"
          />
        </FormItem>
        <FormItem label="默认指纹参数" hint="每行一个参数">
          <Textarea
            value={fingerprintText}
            onChange={(event) => onFingerprintTextChange(event.target.value)}
            rows={3}
            placeholder="--fingerprint-brand=Chrome"
          />
        </FormItem>
        <FormItem label="默认启动参数" hint="每行一个参数">
          <Textarea
            value={launchText}
            onChange={(event) => onLaunchTextChange(event.target.value)}
            rows={3}
            placeholder="--disable-sync"
          />
        </FormItem>
        <FormItem label="默认启动页面" hint="每行一个 URL，留空则启动时不再自动打开页面">
          <Textarea
            value={startUrlsText}
            onChange={(event) => onStartUrlsTextChange(event.target.value)}
            rows={4}
            placeholder="启动 URL"
          />
        </FormItem>
        <FormItem label="轻启动模式" hint="先起空白页，实例就绪后再打开默认页面">
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border-default)] px-3 py-2">
            <span className="text-sm text-[var(--color-text-primary)]">延后打开启动页</span>
            <Switch
              checked={settings.lightStartEnabled}
              onChange={(checked) => onSettingsChange({ lightStartEnabled: checked })}
            />
          </div>
        </FormItem>
        <FormItem label="默认恢复历史标签" hint="实例选择跟随内核时使用；不影响启动页和启动书签。实例未覆盖时，下次启动恢复之前的标签页和窗口。">
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border-default)] px-3 py-2">
            <div>
              <p className="text-sm text-[var(--color-text-primary)]">内核默认</p>
            </div>
            <Switch
              checked={settings.restoreLastSession}
              onChange={(checked) => onSettingsChange({ restoreLastSession: checked })}
            />
          </div>
        </FormItem>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <FormItem label="启动就绪超时（毫秒）">
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
          <FormItem label="启动稳定窗口（毫秒）">
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={coreForm.coreId ? '编辑内核' : '新增内核'}
      width="500px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={onSave} loading={savingCore}>保存</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormItem label="内核名称" required>
          <Input
            value={coreForm.coreName}
            onChange={(event) => onCoreFormChange({ coreName: event.target.value })}
            placeholder="Chrome 142"
          />
        </FormItem>
        <FormItem label="内核路径" required>
          <div className="flex gap-2">
            <Input
              value={coreForm.corePath}
              onChange={(event) => onCoreFormChange({ corePath: event.target.value })}
              placeholder="chrome 或 D:/browsers/chrome-120"
              className="flex-1"
            />
            <Button variant="secondary" onClick={onValidate}>验证</Button>
          </div>
          {coreValidation && (
            <div className={`mt-1 flex items-center gap-1 text-sm ${coreValidation.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
              {coreValidation.valid ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {coreValidation.message}
            </div>
          )}
        </FormItem>
      </div>
    </Modal>
  )
}
