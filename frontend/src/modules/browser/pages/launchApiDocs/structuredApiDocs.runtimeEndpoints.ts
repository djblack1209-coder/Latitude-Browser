import { tr, localized } from '../../../../shared/i18n'
﻿import type { StructuredApiEndpointDoc } from './structuredApiDocs.types'

export const RUNTIME_API_ENDPOINT_DOCS: StructuredApiEndpointDoc[] = localized(() => ([
  {
    id: 'api-runtime-active-detail',
    parentId: 'api-runtime',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.label.024e7ba"),
    method: 'GET',
    path: '/api/runtime/active',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.purpose.e89117a"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.19d0687"),
    fields: [],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl ${launchBaseUrl}/api/runtime/active \\
  -H "${authHeader}: <your-api-key>"`,
    },
    responseExample: {
      language: 'json',
      code: () => `{
  "ok": true,
  "active": true,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "profileName": "buyer-001",
  "launchCode": "BUYER_001",
  "running": true,
  "debugReady": true,
  "cdpUrl": "http://127.0.0.1:19876",
  "directDebugUrl": "http://127.0.0.1:9333"
}`,
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.557e842") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.message.98d4ef4"),
    ],
  },
  {
    id: 'api-runtime-session-detail',
    parentId: 'api-runtime',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.label.815b05e"),
    method: 'POST',
    path: '/api/runtime/session',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.purpose.f5c0789"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.de46c2a"),
    fields: [
      { name: 'selector', type: 'object', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.d915f31") },
      { name: 'code', type: 'string', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.cf45598") },
      { name: 'profileId', type: 'string', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.403750d") },
      { name: 'profileName', type: 'string', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.104d221") },
      { name: 'keyword / keywords', type: 'string / string[]', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.04b223b") },
      { name: 'tag / tags', type: 'string / string[]', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.7295acf") },
      { name: 'groupId', type: 'string', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.42af52b") },
      { name: 'matchMode', type: 'unique | first', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.d1241ce") },
      { name: 'timeoutMs', type: 'integer', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.17d5780") },
      { name: 'startUrls', type: 'string[]', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.46ec74b") },
      { name: 'skipDefaultStartUrls', type: 'boolean', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.c89985b") },
      { name: 'launchArgs', type: 'string[]', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.2a94939") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl -X POST ${launchBaseUrl}/api/runtime/session \\
  -H "Content-Type: application/json" \\
  -H "${authHeader}: <your-api-key>" \\
  -d '{
    "selector": { "code": "BUYER_001" },
    "timeoutMs": 45000,
    "skipDefaultStartUrls": true
  }'`,
    },
    responseExample: {
      language: 'json',
      code: () => `{
  "ok": true,
  "ready": true,
  "waitTimedOut": false,
  "retryable": false,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "launchCode": "BUYER_001",
  "running": true,
  "debugReady": true,
  "active": true,
  "cdpUrl": "http://127.0.0.1:19876",
  "directDebugUrl": "http://127.0.0.1:9333",
  "timeoutMs": 45000
}`,
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.892e2a4") },
      { code: '202', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.234c390") },
      { code: '400', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.9750c41") },
      { code: '404', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.1e282c9") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.5cfe05e"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.message.4470966"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.message.30efe0c"),
    ],
  },
  {
    id: 'api-runtime-status-detail',
    parentId: 'api-runtime',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.label.bbfe1f0"),
    method: 'POST',
    path: '/api/runtime/status',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.purpose.5b3f22d"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.7ff6eca"),
    fields: [
      { name: 'selector', type: 'object', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.d915f31") },
      { name: 'code / profileId / profileName', type: 'string', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.b94ed03") },
      { name: 'keyword / keywords', type: 'string / string[]', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.b94ed03") },
      { name: 'tag / tags / groupId', type: 'string / string[]', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.b94ed03") },
      { name: 'matchMode', type: 'unique | first', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.258ad15") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl -X POST ${launchBaseUrl}/api/runtime/status \\
  -H "Content-Type: application/json" \\
  -H "${authHeader}: <your-api-key>" \\
  -d '{
    "selector": { "keyword": "checkout", "matchMode": "first" }
  }'`,
    },
    responseExample: {
      language: 'json',
      code: () => `{
  "ok": true,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "launchCode": "BUYER_001",
  "running": true,
  "debugReady": false,
  "active": false,
  "cdpUrl": ""
}`,
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.5afc9a4") },
      { code: '400', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.9750c41") },
      { code: '404', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.1e282c9") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.message.6e38015"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.5cfe05e"),
    ],
  },
  {
    id: 'api-runtime-stop-detail',
    parentId: 'api-runtime',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.label.94e9c09"),
    method: 'POST',
    path: '/api/runtime/stop',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.purpose.e231b0b"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.a3a5843"),
    fields: [
      { name: 'selector', type: 'object', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.d915f31") },
      { name: 'code / profileId / profileName', type: 'string', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.b94ed03") },
      { name: 'keyword / keywords', type: 'string / string[]', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.b94ed03") },
      { name: 'tag / tags / groupId', type: 'string / string[]', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.b94ed03") },
      { name: 'matchMode', type: 'unique | first', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.258ad15") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl -X POST ${launchBaseUrl}/api/runtime/stop \\
  -H "Content-Type: application/json" \\
  -H "${authHeader}: <your-api-key>" \\
  -d '{
    "selector": { "code": "BUYER_001" }
  }'`,
    },
    responseExample: {
      language: 'json',
      code: () => `{
  "ok": true,
  "stopped": true,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "launchCode": "BUYER_001",
  "running": false,
  "debugReady": false,
  "active": false
}`,
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.1fc18f5") },
      { code: '400', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.9750c41") },
      { code: '404', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.1e282c9") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.5cfe05e"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.message.438c5a3"),
    ],
  },
  {
    id: 'api-cdp-version-detail',
    parentId: 'api-runtime',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.label.4d8eaab"),
    method: 'GET',
    path: '/json/version',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.purpose.543bf92"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.06dbbb1"),
    fields: [],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl ${launchBaseUrl}/json/version \\
  -H "${authHeader}: <your-api-key>"`,
    },
    responseExample: {
      language: 'json',
      code: () => `{
  "Browser": "Chrome/<version>",
  "Protocol-Version": "1.3",
  "User-Agent": "Mozilla/5.0",
  "webSocketDebuggerUrl": "ws://127.0.0.1:19876/devtools/browser/active"
}`,
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.e473cd5") },
      { code: '503', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.1ea691c") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.message.bc2a6ee"),
    ],
  },
  {
    id: 'api-cdp-list-detail',
    parentId: 'api-runtime',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.label.37e7b07"),
    method: 'GET',
    path: '/json/list',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.purpose.ffba70e"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.4574aca"),
    fields: [],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl ${launchBaseUrl}/json/list \\
  -H "${authHeader}: <your-api-key>"`,
    },
    responseExample: {
      language: 'json',
      code: () => `[
  {
    "id": "page-1",
    "type": "page",
    "title": "Checkout",
    "url": "https://example.com/checkout",
    "webSocketDebuggerUrl": "ws://127.0.0.1:19876/devtools/page/page-1"
  }
]`,
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.dff7260") },
      { code: '503', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.1ea691c") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.message.bc2a6ee"),
    ],
  },
  {
    id: 'api-cdp-ws-detail',
    parentId: 'api-runtime',
    label: tr("ui.modules.browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.label.e3f987d"),
    method: 'WS',
    path: '/devtools/...',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.purpose.fb490df"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.226e218"),
    fields: [],
    requestExample: {
      language: 'javascript',
      code: ({ launchBaseUrl }) => {
        const wsBase = launchBaseUrl.replace(/^http/i, 'ws')
        return tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.message.ba0c174", [wsBase])
      },
    },
    responseExample: {
      language: 'text',
      code: () => tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.message.cdbcca8"),
    },
    responseCodes: [
      { code: '101', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.1d62380") },
      { code: '503', description: tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.description.1ea691c") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.runtimeEndpoints.message.a8330ee"),
    ],
  },
]))
