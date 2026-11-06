import { tr, useLocale } from '../../../shared/i18n'
import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Input, Modal, toast } from '../../../shared/components'
import { setProfileKeywords } from '../api'

interface Props {
  profileId: string
  profileName: string
  initialKeywords: string[]
  open: boolean
  onClose: () => void
  onSaved: (keywords: string[]) => void
}

export function KeywordsModal({ profileId, profileName, initialKeywords, open, onClose, onSaved }: Props) {
  useLocale()

  const [items, setItems] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const init = (initialKeywords || []).filter(Boolean)
    setItems(init.length > 0 ? [...init] : [''])
  }, [open, initialKeywords])

  const setItem = (i: number, val: string) =>
    setItems(prev => prev.map((v, idx) => idx === i ? val : v))

  const addItem = () => setItems(prev => [...prev, ''])

  const removeItem = (i: number) =>
    setItems(prev => prev.length === 1 ? [''] : prev.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    const keywords = items.map(s => s.trim()).filter(Boolean)
    setSaving(true)
    try {
      await setProfileKeywords(profileId, keywords)
      toast.success(tr("browser.components.KeywordsModal.KeywordsModal.d7311a7"))
      onSaved(keywords)
      onClose()
    } catch {
      toast.error(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.40525a7"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("browser.components.KeywordsModal.KeywordsModal.cc4d3c3", [profileName])}
      width="420px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          <Button onClick={handleSave} loading={saving}>{tr("browser.components.BrowserListLayout.text.fadf24d")}</Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-xs text-[var(--color-text-muted)] mb-3">{tr("browser.components.KeywordsModal.text.ab264f3")}</p>

        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={e => setItem(i, e.target.value)}
              placeholder={tr("browser.components.KeywordsModal.placeholder.ded605f")}
              className="flex-1"
            />
            <button
              onClick={() => removeItem(i)}
              className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-bg-muted)] rounded transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        <Button variant="ghost" size="sm" onClick={addItem} className="mt-1">
          <Plus className="w-4 h-4" />{tr("browser.components.KeywordsModal.text.37008d7")}</Button>
      </div>
    </Modal>
  )
}
