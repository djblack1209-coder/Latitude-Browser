import { tr, localized } from '../../../../shared/i18n'
import type { AutomationDemoActionKey } from '../../demoSession'
import { DEFAULT_API_AUTH, DEFAULT_LAUNCH_BASE_URL } from '../../launchContext'
import {
  DOC_API_OVERVIEW,
  DOC_CORE_INTRO,
  DOC_EXTENSION_INTRO,
  DOC_OPERATION_FLOW,
  DOC_PROXY_INTRO,
  DOC_SKILL_USAGE,
  DOC_TUTORIAL,
} from './contentIntro'
import { DOC_CHANGELOG } from './contentChangelog'
import {
  DOC_API_AUTOMATION,
  DOC_API_PROFILES_LAUNCH,
  DOC_API_RUNTIME,
} from './contentApi'
import { DOC_API_SUPPORT } from './contentReference'
import { getStructuredApiHiddenDocItems } from './structuredApiDocs'

export interface LaunchDocDemoConfig {
  title: string
  subtitle: string
  primaryDocLabel: string
  actionKeys: AutomationDemoActionKey[]
}

export interface LaunchDocItem {
  id: string
  label: string
  summary: string
  content: string
  demo?: LaunchDocDemoConfig
}

export interface LaunchDocGroup {
  id: string
  label: string
  items: LaunchDocItem[]
}

export const DOC_GROUPS: LaunchDocGroup[] = localized(() => ([
  {
    id: 'tutorial',
    label: tr("browser.pages.launchApiDocs.LaunchDocsHeader.label.e63e0a7"),
    items: [
      {
        id: 'tutorial-basic',
        label: tr("browser.pages.launchApiDocs.catalog.label.480eb10"),
        summary: tr("browser.pages.launchApiDocs.catalog.summary.bb6d69d"),
        content: DOC_TUTORIAL(),
      },
      {
        id: 'tutorial-skill',
        label: tr("browser.pages.launchApiDocs.catalog.label.4d4eca1"),
        summary: tr("browser.pages.launchApiDocs.catalog.summary.09ffadb"),
        content: DOC_SKILL_USAGE(),
      },
      {
        id: 'tutorial-flow',
        label: tr("browser.pages.launchApiDocs.catalog.label.1c23cec"),
        summary: tr("browser.pages.launchApiDocs.catalog.summary.4592a9e"),
        content: DOC_OPERATION_FLOW(),
      },
    ],
  },
  {
    id: 'changelog',
    label: tr("browser.pages.launchApiDocs.catalog.label.1853684"),
    items: [
      {
        id: 'changelog-versions',
        label: tr("browser.pages.launchApiDocs.catalog.label.ca95761"),
        summary: tr("browser.pages.launchApiDocs.catalog.summary.3e1fbc2"),
        content: DOC_CHANGELOG(),
      },
    ],
  },
  {
    id: 'core',
    label: tr("browser.pages.launchApiDocs.LaunchDocsHeader.label.aa4fbf4"),
    items: [
      {
        id: 'core-management',
        label: tr("browser.pages.launchApiDocs.catalog.label.dd49422"),
        summary: tr("browser.pages.launchApiDocs.catalog.summary.e0bfff8"),
        content: DOC_CORE_INTRO(),
      },
    ],
  },
  {
    id: 'proxy',
    label: tr("browser.pages.launchApiDocs.LaunchDocsHeader.label.58933ad"),
    items: [
      {
        id: 'proxy-usage',
        label: tr("browser.pages.launchApiDocs.catalog.label.6978de0"),
        summary: tr("browser.pages.launchApiDocs.catalog.summary.ad01a16"),
        content: DOC_PROXY_INTRO(),
      },
    ],
  },
  {
    id: 'extension',
    label: tr("browser.pages.launchApiDocs.catalog.label.baf18c7"),
    items: [
      {
        id: 'extension-usage',
        label: tr("browser.pages.launchApiDocs.catalog.label.a7bd3c1"),
        summary: tr("browser.pages.launchApiDocs.catalog.summary.ea69b52"),
        content: DOC_EXTENSION_INTRO(),
      },
    ],
  },
  {
    id: 'api',
    label: tr("browser.pages.launchApiDocs.catalog.label.8ed9318"),
    items: [
      {
        id: 'api-overview',
        label: tr("browser.pages.launchApiDocs.LaunchDocsHeader.label.9421c6f"),
        summary: tr("browser.pages.launchApiDocs.catalog.summary.b039fed"),
        content: DOC_API_OVERVIEW(),
      },
      {
        id: 'api-profiles-launch',
        label: tr("browser.pages.launchApiDocs.catalog.label.e8a0724"),
        summary: tr("browser.pages.launchApiDocs.catalog.summary.42a9d6d"),
        content: DOC_API_PROFILES_LAUNCH(),
      },
      {
        id: 'api-runtime',
        label: tr("browser.pages.launchApiDocs.catalog.label.659adb1"),
        summary: tr("browser.pages.launchApiDocs.catalog.summary.c33d9ac"),
        content: DOC_API_RUNTIME(),
      },
      {
        id: 'api-automation',
        label: tr("browser.pages.launchApiDocs.catalog.label.16c9a4e"),
        summary: tr("browser.pages.launchApiDocs.catalog.summary.e4a2cf9"),
        content: DOC_API_AUTOMATION(),
      },
      {
        id: 'api-support',
        label: tr("browser.pages.launchApiDocs.catalog.label.c8a2369"),
        summary: tr("browser.pages.launchApiDocs.catalog.summary.0687040"),
        content: DOC_API_SUPPORT(),
      },
    ],
  },
]))

const DOC_ITEMS = localized(() => DOC_GROUPS.flatMap((group) => group.items))
const HIDDEN_DOC_ITEMS: LaunchDocItem[] = localized(() => getStructuredApiHiddenDocItems())

export function getDefaultDoc(): LaunchDocItem {
  return DOC_GROUPS[0].items[0]
}

export function findDocById(targetId: string): LaunchDocItem | null {
  return DOC_ITEMS.find((item) => item.id === targetId)
    || HIDDEN_DOC_ITEMS.find((item) => item.id === targetId)
    || null
}

export function findGroupByDocId(targetId: string): LaunchDocGroup | null {
  return DOC_GROUPS.find((group) => group.items.some((item) => item.id === targetId)) || null
}

export function getAdjacentDocs(targetId: string): {
  previous: LaunchDocItem | null
  next: LaunchDocItem | null
} {
  const index = DOC_ITEMS.findIndex((item) => item.id === targetId)
  if (index < 0) {
    return { previous: null, next: null }
  }

  return {
    previous: index > 0 ? DOC_ITEMS[index - 1] : null,
    next: index < DOC_ITEMS.length - 1 ? DOC_ITEMS[index + 1] : null,
  }
}

export function renderDocWithLaunchContext(raw: string, baseUrl: string, authHeader: string): string {
  if (!raw) return raw
  const safeBase = baseUrl.trim() || DEFAULT_LAUNCH_BASE_URL
  const safeAuthHeader = authHeader.trim() || DEFAULT_API_AUTH.header
  const hostPort = safeBase.replace(/^https?:\/\//, '')
  return raw
    .split('http://127.0.0.1:19876').join(safeBase)
    .split('127.0.0.1:19876').join(hostPort)
    .split('X-Ant-Api-Key').join(safeAuthHeader)
}
