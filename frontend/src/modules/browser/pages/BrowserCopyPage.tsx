import { tr, useLocale } from '../../../shared/i18n'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, FormItem, Select, toast } from '../../../shared/components'
import { WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
import { BrowserProfileCopyForm } from '../components/BrowserProfileCopyForm'
import { createBrowserProfileCopyOptions, isBrowserProfileCopyOptionsValid } from '../copyOptions'
import { buildBrowserProfileCopyName } from '../copyName'
import type { BrowserProfile, BrowserProfileCopyOptions } from '../types'
import { copyBrowserProfile, fetchBrowserProfiles } from '../api'

export function BrowserCopyPage() {
  useLocale()

  const { id } = useParams()
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [sourceId, setSourceId] = useState(id || '')
  const [targetName, setTargetName] = useState('')
  const [copyOptions, setCopyOptions] = useState<BrowserProfileCopyOptions>(() => createBrowserProfileCopyOptions())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadProfiles = async () => {
      const list = await fetchBrowserProfiles()
      setProfiles(list)
      if (!sourceId && list.length > 0) {
        setSourceId(list[0].profileId)
      }
    }
    loadProfiles()
  }, [])

  const sourceProfile = profiles.find(item => item.profileId === sourceId)

  useEffect(() => {
    if (!sourceProfile) {
      return
    }
    setTargetName(buildBrowserProfileCopyName(sourceProfile.profileName))
  }, [sourceProfile?.profileId, sourceProfile?.profileName])

  const handleCopy = async () => {
    if (!sourceProfile || !targetName.trim()) {
      toast.error(tr("browser.pages.BrowserCopyPage.BrowserCopyPage.b3d11f0"))
      return
    }
    if (!isBrowserProfileCopyOptionsValid(copyOptions)) {
      toast.error(tr("browser.pages.BrowserCopyPage.BrowserCopyPage.dfb7c0d"))
      return
    }
    setSaving(true)
    try {
      await copyBrowserProfile(sourceProfile.profileId, targetName.trim(), copyOptions)
      toast.success(tr("browser.pages.BrowserCopyPage.BrowserCopyPage.41b53ee"))
      navigate('/browser/list')
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.AutomationScriptPublicApiModal.helpers.copyText.f2c6b51"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <WorkspaceHeader

        title={tr("browser.pages.BrowserCopyPage.title.7d46ab5")}

        actions={(
          <>
            <Button variant="secondary" size="sm" onClick={() => navigate('/browser/list')}>{tr("browser.pages.AutomationScriptDetailPage.text.53505b1")}</Button>
            <Button size="sm" onClick={handleCopy} loading={saving} disabled={!targetName.trim() || !isBrowserProfileCopyOptionsValid(copyOptions)}>{tr("browser.pages.BrowserCopyPage.text.d53ed18")}</Button>
          </>
        )}
      />

      <Card title={tr("browser.pages.BrowserCopyPage.title.6e9a10c")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormItem label={tr("browser.pages.BrowserCopyPage.label.ef4d1d5")}>
            <Select
              value={sourceId}
              onChange={e => setSourceId(e.target.value)}
              options={profiles.map(item => ({ value: item.profileId, label: item.profileName }))}
            />
          </FormItem>
        </div>
        <div className="mt-4">
          <BrowserProfileCopyForm
            copyName={targetName}
            copyOptions={copyOptions}
            onCopyNameChange={setTargetName}
            onCopyOptionsChange={setCopyOptions}
          />
        </div>
      </Card>
    </div>
  )
}
