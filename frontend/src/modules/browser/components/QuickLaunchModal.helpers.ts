import { getLocale } from '../../../shared/i18n'
import { tr } from '../../../shared/i18n'
﻿import type { BrowserProfile } from '../types'

export interface ProfileTagSection {
  tag: string
  items: BrowserProfile[]
}

export interface GroupFilterOption {
  id: string
  name: string
  count: number
}

export const UNTAGGED_LABEL = () => tr("browser.components.QuickLaunchModal.helpers.message.2e3d4ee")
export const UNTAGGED_ID = '__untagged__'
export const GROUP_ALL = '__all__'
export const GROUP_UNGROUPED = '__ungrouped__'

export function normalizeText(v?: string): string {
  return (v || '').trim().toLowerCase()
}

export function normalizeCode(v?: string): string {
  return normalizeText(v).toUpperCase()
}

export function buildSearchText(profile: BrowserProfile): string {
  return [
    profile.profileName,
    profile.launchCode || '',
    ...(profile.tags || []),
    ...(profile.keywords || []),
  ]
    .join(' ')
    .toLowerCase()
}

export function sortProfiles(a: BrowserProfile, b: BrowserProfile): number {
  if (a.running !== b.running) {
    return a.running ? -1 : 1
  }
  return a.profileName.localeCompare(b.profileName, getLocale())
}

export function pickPrimaryTag(profile: BrowserProfile): string {
  const tags = (profile.tags || []).map(t => t.trim()).filter(Boolean)
  return tags.length > 0 ? tags[0] : UNTAGGED_ID
}
