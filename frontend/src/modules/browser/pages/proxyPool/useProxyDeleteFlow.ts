import { tr } from '../../../../shared/i18n'
﻿import { useState } from 'react'
import { toast } from '../../../../shared/components'
import type { BrowserProxy } from '../../types'

interface UseProxyDeleteFlowOptions {
  proxies: BrowserProxy[]
  saveProxies: (list: BrowserProxy[]) => Promise<void>
  removeSelectedId: (proxyId: string) => void
}

export function useProxyDeleteFlow({ proxies, saveProxies, removeSelectedId }: UseProxyDeleteFlowOptions) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDeleteClick = (proxyId: string) => {
    setDeletingId(proxyId)
    setDeleteConfirmOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingId) return
    try {
      const newProxies = proxies.filter(p => p.proxyId !== deletingId)
      await saveProxies(newProxies)
      removeSelectedId(deletingId)
      toast.success(tr("browser.components.ProxyPickerModal.ProxyPickerModal.fafd8a6"))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.ProxyPickerModal.ProxyPickerModal.72250c5"))
    }
    setDeletingId(null)
  }

  return {
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    handleDeleteClick,
    handleDeleteConfirm,
  }
}
