import { tr, localized } from '../../../../shared/i18n'
﻿import type { StructuredApiSectionDoc } from './structuredApiDocs.types'

export const STRUCTURED_API_SECTION_DOCS: StructuredApiSectionDoc[] = localized(() => ([
  {
    id: 'api-profiles-launch',
    title: tr("browser.pages.launchApiDocs.catalog.label.e8a0724"),
    intro: tr("browser.pages.launchApiDocs.structuredApiDocs.sections.intro.0f1c64b"),
    highlights: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.sections.message.ad6b4c3"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.sections.message.80c0dd0"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.sections.message.7d84c50"),
    ],
  },
  {
    id: 'api-runtime',
    title: tr("browser.pages.launchApiDocs.catalog.label.659adb1"),
    intro: tr("browser.pages.launchApiDocs.structuredApiDocs.sections.intro.f454b29"),
    highlights: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.sections.message.88ca460"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.sections.message.8b273c0"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.sections.message.72a1ea2"),
    ],
  },
  {
    id: 'api-automation',
    title: tr("browser.pages.launchApiDocs.catalog.label.16c9a4e"),
    intro: tr("browser.pages.launchApiDocs.structuredApiDocs.sections.intro.ddf0703"),
    highlights: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.sections.message.3c92e48"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.sections.message.2309824"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.sections.message.e72b654"),
    ],
  },
]))
