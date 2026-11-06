import { tr } from '../../../../shared/i18n'
﻿import type { Dispatch, SetStateAction } from 'react'
import { toast } from '../../../../shared/components'
import {
  deleteBrowserProfile,
  restartBrowserInstance,
  startBrowserInstance,
  startBrowserInstanceDirect,
  stopBrowserInstance,
  validateProxyConfig,
} from '../../api'
import type { BrowserProfile } from '../../types'
import { resolveActionErrorMessage, resolveActionFeedback } from '../../utils/actionErrors'
import { warmupProfileProxyBeforeStart } from '../../utils/proxyWarmup'

interface UseBrowserProfileActionsOptions {
  profiles: BrowserProfile[]
  setProxyErrorModal: (open: boolean) => void
  setProxyErrorMsg: (message: string) => void
  setPendingStartId: (profileId: string | null) => void
  setOpError: (message: string) => void
  setStartingIds: Dispatch<SetStateAction<Set<string>>>
  setStoppingIds: Dispatch<SetStateAction<Set<string>>>
  updatePendingIds: (
    setter: Dispatch<SetStateAction<Set<string>>>,
    profileId: string,
    active: boolean,
  ) => void
  mergeProfileState: (profile: BrowserProfile | null | undefined) => void
  loadProfiles: (options?: { silent?: boolean; syncRuntimeState?: boolean }) => Promise<BrowserProfile[] | void>
}

export function useBrowserProfileActions({
  profiles,
  setProxyErrorModal,
  setProxyErrorMsg,
  setPendingStartId,
  setOpError,
  setStartingIds,
  setStoppingIds,
  updatePendingIds,
  mergeProfileState,
  loadProfiles,
}: UseBrowserProfileActionsOptions) {
  const handleStart = async (profileId: string) => {
    const profile = profiles.find(p => p.profileId === profileId)
    updatePendingIds(setStartingIds, profileId, true)
    try {
      if (profile) {
        const result = await validateProxyConfig(profile.proxyConfig || '', profile.proxyId || '')
        if (!result.supported) {
          setProxyErrorMsg(result.errorMsg)
          setPendingStartId(profileId)
          setProxyErrorModal(true)
          return
        }
      }

      await warmupProfileProxyBeforeStart(profile)
      const startedProfile = await startBrowserInstance(profileId)
      mergeProfileState(startedProfile)
      if (startedProfile?.runtimeWarning) {
        toast.warning(startedProfile.runtimeWarning)
      } else {
        toast.success(tr("browser.pages.AutoConfigPage.AutoConfigPage.8b5a5ce", [startedProfile?.profileName ? `：${startedProfile.profileName}` : '']))
      }
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      const feedback = resolveActionFeedback(error, tr("browser.pages.AutoConfigPage.AutoConfigPage.176529e"))
      if (feedback.tone === 'warning') {
        toast.warning(feedback.message)
      } else {
        toast.error(feedback.message)
      }
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } finally {
      updatePendingIds(setStartingIds, profileId, false)
    }
  }

  const handleStartDirect = async (profileId: string) => {
    updatePendingIds(setStartingIds, profileId, true)
    try {
      const startedProfile = await startBrowserInstanceDirect(profileId)
      mergeProfileState(startedProfile)
      setProxyErrorModal(false)
      setPendingStartId(null)
      if (startedProfile?.runtimeWarning) {
        toast.warning(startedProfile.runtimeWarning)
      } else {
        toast.success(tr("browser.pages.browserList.useBrowserProfileActions.useBrowserProfileActions.5192a97", [startedProfile?.profileName ? `：${startedProfile.profileName}` : '']))
      }
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      setProxyErrorModal(false)
      setPendingStartId(null)
      const feedback = resolveActionFeedback(error, tr("browser.pages.browserList.useBrowserProfileActions.useBrowserProfileActions.52d7cf4"))
      if (feedback.tone === 'warning') {
        toast.warning(feedback.message)
      } else {
        toast.error(feedback.message)
      }
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } finally {
      updatePendingIds(setStartingIds, profileId, false)
    }
  }

  const handleStop = async (profileId: string) => {
    updatePendingIds(setStoppingIds, profileId, true)
    try {
      const stoppedProfile = await stopBrowserInstance(profileId)
      mergeProfileState(stoppedProfile)
      toast.success(tr("browser.pages.BrowserDetailPage.BrowserDetailPage.361960e"))
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      toast.error(resolveActionErrorMessage(error, tr("browser.pages.BrowserDetailPage.BrowserDetailPage.531cbdd")))
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } finally {
      updatePendingIds(setStoppingIds, profileId, false)
    }
  }

  const handleRestart = async (profileId: string) => {
    const profile = profiles.find(p => p.profileId === profileId)
    updatePendingIds(setStoppingIds, profileId, true)
    try {
      await warmupProfileProxyBeforeStart(profile)
      const restartedProfile = await restartBrowserInstance(profileId)
      mergeProfileState(restartedProfile)
      toast.success(tr("browser.pages.browserList.useBrowserProfileActions.useBrowserProfileActions.fa62706", [restartedProfile?.profileName ? `：${restartedProfile.profileName}` : '']))
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } catch (error: any) {
      const feedback = resolveActionFeedback(error, tr("browser.pages.BrowserDetailPage.BrowserDetailPage.201d96f"))
      if (feedback.tone === 'warning') {
        toast.warning(feedback.message)
      } else {
        setOpError(feedback.message)
      }
      await loadProfiles({ silent: true, syncRuntimeState: true })
    } finally {
      updatePendingIds(setStoppingIds, profileId, false)
    }
  }

  const handleDelete = async (profileId: string) => {
    await deleteBrowserProfile(profileId)
    toast.success(tr("browser.pages.BrowserListPage.BrowserListPage.f9c34f0"))
    void loadProfiles()
  }

  return {
    handleStart,
    handleStartDirect,
    handleStop,
    handleRestart,
    handleDelete,
  }
}
