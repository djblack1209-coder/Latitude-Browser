import { getLocale } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
import { useEffect, useState } from 'react'
import { Archive, RotateCcw, Trash2 } from 'lucide-react'
import { Button, Card, Input, Table, toast } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'
import type { SnapshotInfo } from '../types'
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from '../api'

interface Props {
  profileId: string
  running: boolean
}

const defaultName = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return tr("browser.components.SnapshotTab.message.7367246", [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate()), pad(now.getHours()), pad(now.getMinutes())])
}

const formatSize = (mb: number) => (mb < 1 ? `${(mb * 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`)

const formatTime = (value: string) => {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString(getLocale())
}

export function SnapshotTab({ profileId, running }: Props) {
  useLocale()

  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState(defaultName)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setSnapshots(await listSnapshots(profileId))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [profileId])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createSnapshot(profileId, newName.trim())
      toast.success(tr("browser.components.SnapshotTab.SnapshotTab.aa56c14"))
      setNewName(defaultName())
      await load()
    } catch {
      toast.error(tr("browser.components.SnapshotTab.SnapshotTab.9287cf6"))
    } finally {
      setCreating(false)
    }
  }

  const handleRestore = async (snapshotId: string) => {
    setActionLoading(snapshotId)
    try {
      await restoreSnapshot(profileId, snapshotId)
      toast.success(tr("browser.components.SnapshotTab.SnapshotTab.34565bb"))
    } catch {
      toast.error(tr("browser.components.SnapshotTab.SnapshotTab.1cbf757"))
    } finally {
      setActionLoading(null)
      setConfirmRestore(null)
    }
  }

  const handleDelete = async (snapshotId: string) => {
    setActionLoading(snapshotId)
    try {
      await deleteSnapshot(profileId, snapshotId)
      toast.success(tr("browser.components.SnapshotTab.SnapshotTab.8f4d13e"))
      await load()
    } catch {
      toast.error(tr("browser.components.SnapshotTab.SnapshotTab.49c8971"))
    } finally {
      setActionLoading(null)
      setConfirmDelete(null)
    }
  }

  const columns: TableColumn<SnapshotInfo>[] = [
    { key: 'name', title: tr("browser.components.BrowserListLayout.title.1be7ae4") },
    { key: 'sizeMB', title: tr("browser.components.SnapshotTab.title.fd20702"), render: v => formatSize(v as number) },
    { key: 'createdAt', title: tr("browser.components.SnapshotTab.title.84e3802"), render: v => formatTime(v as string) },
    {
      key: 'snapshotId',
      title: tr("browser.components.AutomationScriptHistoryModal.text.f3ea6d3"),
      render: (snapshotId) => {
        const sid = snapshotId as string
        if (confirmRestore === sid) {
          return (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--color-text-muted)]">{tr("browser.components.SnapshotTab.text.cc3b6b1")}</span>
              <Button size="sm" onClick={() => handleRestore(sid)} disabled={actionLoading === sid}>{tr("ui.components.Modal.ConfirmModal.b56d9ac")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(null)}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
            </div>
          )
        }
        if (confirmDelete === sid) {
          return (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--color-text-muted)]">{tr("browser.components.SnapshotTab.text.574e45d")}</span>
              <Button size="sm" onClick={() => handleDelete(sid)} disabled={actionLoading === sid}>{tr("ui.components.Modal.ConfirmModal.b56d9ac")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
            </div>
          )
        }
        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={running}
              title={running ? tr("browser.components.SnapshotTab.SnapshotTab.d5fc1f6") : tr("browser.components.SnapshotTab.SnapshotTab.85750e4")}
              onClick={() => setConfirmRestore(sid)}
            >
              <RotateCcw className="w-3.5 h-3.5" />{tr("browser.components.SnapshotTab.text.79748ca")}</Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(sid)}
            >
              <Trash2 className="w-3.5 h-3.5" />{tr("browser.components.BrowserListLayout.title.3755f56")}</Button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      <Card title={tr("browser.components.SnapshotTab.title.82f545b")} >
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={tr("browser.components.SnapshotTab.placeholder.83ae8f0")}
            disabled={running || creating}
            className="flex-1"
          />
          <Button onClick={handleCreate} disabled={running || creating || !newName.trim()}>
            <Archive className="w-4 h-4" />
            {creating ? tr("browser.components.SnapshotTab.SnapshotTab.8c6348d") : tr("browser.components.SnapshotTab.title.82f545b")}
          </Button>
        </div>
      </Card>

      <Card
        title={tr("browser.components.SnapshotTab.title.122fa4c")}

      >
        {snapshots.length === 0 && !loading ? (
          <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">{tr("browser.components.SnapshotTab.text.c33c8ec")}</p>
        ) : (
          <Table columns={columns} data={snapshots} rowKey="snapshotId" />
        )}
      </Card>
    </div>
  )
}
