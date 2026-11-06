import { tr } from '../../../../shared/i18n'
﻿import { useState } from 'react'
import { toast } from '../../../../shared/components'
import { createDefaultProxyCheckSettings, fetchProxyCheckSettings, saveProxyCheckSettings } from '../../api'
import type { ProxyCheckSettings } from '../../types'

export function useProxyCheckSettingsModal() {
  const [checkSettingsOpen, setCheckSettingsOpen] = useState(false)
  const [checkSettings, setCheckSettings] = useState<ProxyCheckSettings>(() => createDefaultProxyCheckSettings())
  const [checkTargetsText, setCheckTargetsText] = useState('')
  const [savingCheckSettings, setSavingCheckSettings] = useState(false)

  const openCheckSettings = async () => {
    const settings = await fetchProxyCheckSettings()
    setCheckSettings(settings)
    setCheckTargetsText(JSON.stringify(settings.targets || [], null, 2))
    setCheckSettingsOpen(true)
  }

  const saveCheckSettings = async () => {
    setSavingCheckSettings(true)
    try {
      const targets = JSON.parse(checkTargetsText || '[]')
      await saveProxyCheckSettings({ ...checkSettings, targets })
      toast.success(tr("browser.pages.proxyPool.useProxyCheckSettingsModal.useProxyCheckSettingsModal.72d887e"))
      setCheckSettingsOpen(false)
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.proxyPool.useProxyCheckSettingsModal.useProxyCheckSettingsModal.e135faf"))
    } finally {
      setSavingCheckSettings(false)
    }
  }

  return {
    checkSettingsOpen,
    setCheckSettingsOpen,
    checkSettings,
    setCheckSettings,
    checkTargetsText,
    setCheckTargetsText,
    savingCheckSettings,
    openCheckSettings,
    saveCheckSettings,
  }
}
