import { tr, localized } from '../../../../shared/i18n'
﻿import type { StructuredApiEndpointDoc } from './structuredApiDocs.types'

export const AUTOMATION_API_ENDPOINT_DOCS: StructuredApiEndpointDoc[] = localized(() => ([
  {
    id: 'api-automation-list-detail',
    parentId: 'api-automation',
    label: tr("browser.pages.AutomationCardsSection.title.da72dc3"),
    method: 'GET',
    path: '/api/automation/scripts',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.purpose.74f173d"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.44b522c"),
    fields: [],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl ${launchBaseUrl}/api/automation/scripts \\
  -H "${authHeader}: <your-api-key>"`,
    },
    responseExample: {
      language: 'json',
      code: () => tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.message.a26e75f"),
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.b97e2f5") },
      { code: '503', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.16a5814") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.message.f165734"),
    ],
  },
  {
    id: 'api-automation-script-detail',
    parentId: 'api-automation',
    label: tr("browser.components.AutomationScriptRunModalView.text.d54da6e"),
    method: 'GET',
    path: '/api/automation/scripts/{scriptId}',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.purpose.02d73b0"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.3446e5e"),
    fields: [
      { name: 'scriptId', type: 'string', required: true, location: 'Path', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.9bd094a") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl ${launchBaseUrl}/api/automation/scripts/news-query-txt \\
  -H "${authHeader}: <your-api-key>"`,
    },
    responseExample: {
      language: 'json',
      code: () => tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.message.197f129"),
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.57355e2") },
      { code: '404', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.4fba921") },
      { code: '503', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.16a5814") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.message.f165734"),
    ],
  },
  {
    id: 'api-automation-run-detail',
    parentId: 'api-automation',
    label: tr("browser.components.AutomationScriptRunModalView.title.0ee58c6"),
    method: 'POST',
    path: '/api/automation/scripts/run',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.purpose.b2e093a"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.3841529"),
    fields: [
      { name: 'scriptId', type: 'string', required: true, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.d60c858") },
      { name: 'selector', type: 'object', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.1408cd4") },
      { name: 'params', type: 'object', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.2bb5311") },
      { name: 'useScriptSelector', type: 'boolean', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.693b2b4") },
      { name: 'useScriptParams', type: 'boolean', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.7a1ae61") },
      { name: 'timeoutMs', type: 'integer', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.2fd712b") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl -X POST ${launchBaseUrl}/api/automation/scripts/run \\
  -H "Content-Type: application/json" \\
  -H "${authHeader}: <your-api-key>" \\
  -d '{
    "scriptId": "news-query-txt",
    "selector": { "code": "BUYER_001" },
    "params": { "keyword": "OpenAI", "limit": 10 }
  }'`,
    },
    responseExample: {
      language: 'json',
      code: () => tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.message.fe8790d"),
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.0068101") },
      { code: '400', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.f3abb01") },
      { code: '500', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.6da4a0f") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.message.fc5ef6f"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.message.40a1484"),
    ],
  },
  {
    id: 'api-automation-runs-detail',
    parentId: 'api-automation',
    label: tr("config.navigation.config.name.24fb424"),
    method: 'GET',
    path: '/api/automation/scripts/runs?limit=20',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.purpose.0f7cac3"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.7360f82"),
    fields: [
      { name: 'limit', type: 'integer', required: false, location: 'Query', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.0eb6da8") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl "${launchBaseUrl}/api/automation/scripts/runs?limit=20" \\
  -H "${authHeader}: <your-api-key>"`,
    },
    responseExample: {
      language: 'json',
      code: () => tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.message.3849eff"),
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.14bfdaf") },
      { code: '503', description: tr("browser.pages.launchApiDocs.structuredApiDocs.automationEndpoints.description.16a5814") },
    ],
    notes: [],
  },
]))
