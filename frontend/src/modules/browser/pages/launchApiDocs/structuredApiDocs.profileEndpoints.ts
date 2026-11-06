import { tr, localized } from '../../../../shared/i18n'
﻿import type { StructuredApiEndpointDoc } from './structuredApiDocs.types'

export const PROFILE_API_ENDPOINT_DOCS: StructuredApiEndpointDoc[] = localized(() => ([
  {
    id: 'api-profiles-list-detail',
    parentId: 'api-profiles-launch',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.label.326fc29"),
    method: 'GET',
    path: '/api/profiles',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.purpose.0f06a92"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.dccc7c7"),
    fields: [],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl ${launchBaseUrl}/api/profiles \\
  -H "${authHeader}: <your-api-key>"`,
    },
    responseExample: {
      language: 'json',
      code: () => tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.cf362b2"),
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.04e01b0") },
      { code: '503', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.688a75f") },
    ],
    notes: [],
  },
  {
    id: 'api-profiles-create-detail',
    parentId: 'api-profiles-launch',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.label.5d6a704"),
    method: 'POST',
    path: '/api/profiles',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.purpose.f87a158"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.23ea2a6"),
    fields: [
      { name: 'profile', type: 'object', required: true, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.73e27f6") },
      { name: 'launchCode', type: 'string', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.750b971") },
      { name: 'autoLaunch', type: 'boolean', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.febea93") },
      { name: 'start', type: 'object', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.d888722") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.1c99980", [launchBaseUrl, authHeader]),
    },
    responseExample: {
      language: 'json',
      code: () => `{
  "ok": true,
  "created": true,
  "updated": false,
  "launched": false,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "profileName": "buyer-001",
  "launchCode": "BUYER_001",
  "profile": {
    "profileId": "550e8400-e29b-41d4-a716-446655440000",
    "profileName": "buyer-001",
    "keywords": ["buyer-001"],
    "proxyId": "proxy-us"
  }
}`,
    },
    responseCodes: [
      { code: '201', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.b8941a5") },
      { code: '400', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.dbd5e55") },
      { code: '409', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.86331fd") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.3eb3692"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.07fb860"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.9b5b9c8"),
    ],
  },
  {
    id: 'api-profiles-get-detail',
    parentId: 'api-profiles-launch',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.label.5a80709"),
    method: 'GET',
    path: '/api/profiles/{profileId}',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.purpose.38ee54e"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.9a134f4"),
    fields: [
      { name: 'profileId', type: 'string', required: true, location: 'Path', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.5b1ecd5") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl ${launchBaseUrl}/api/profiles/550e8400-e29b-41d4-a716-446655440000 \\
  -H "${authHeader}: <your-api-key>"`,
    },
    responseExample: {
      language: 'json',
      code: () => tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.13bf242"),
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.e608bf0") },
      { code: '404', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.ffd42bf") },
    ],
    notes: [],
  },
  {
    id: 'api-profiles-update-detail',
    parentId: 'api-profiles-launch',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.label.d8460d1"),
    method: 'PUT',
    path: '/api/profiles/{profileId}',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.purpose.2a69ca0"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.fc91a5a"),
    fields: [
      { name: 'profileId', type: 'string', required: true, location: 'Path', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.5b1ecd5") },
      { name: 'profile', type: 'object', required: true, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.6a200f2") },
      { name: 'launchCode', type: 'string', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.66171b5") },
      { name: 'autoLaunch', type: 'boolean', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.d8ac404") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl -X PUT ${launchBaseUrl}/api/profiles/550e8400-e29b-41d4-a716-446655440000 \\
  -H "Content-Type: application/json" \\
  -H "${authHeader}: <your-api-key>" \\
  -d '{
    "profile": {
      "profileName": "buyer-001-updated",
      "proxyId": "proxy-us",
      "keywords": ["buyer-001", "checkout"]
    }
  }'`,
    },
    responseExample: {
      language: 'json',
      code: () => `{
  "ok": true,
  "created": false,
  "updated": true,
  "launched": false,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "profileName": "buyer-001-updated",
  "launchCode": "BUYER_001"
}`,
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.dd682e0") },
      { code: '400', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.38021a5") },
      { code: '404', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.ffd42bf") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.3a1b0c9"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.07fb860"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.9b5b9c8"),
    ],
  },
  {
    id: 'api-profiles-delete-detail',
    parentId: 'api-profiles-launch',
    label: tr("browser.pages.browserList.BrowserListDialogs.title.6e73a5f"),
    method: 'DELETE',
    path: '/api/profiles/{profileId}',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.purpose.a172d0b"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.384fd21"),
    fields: [
      { name: 'profileId', type: 'string', required: true, location: 'Path', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.5b1ecd5") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl -X DELETE ${launchBaseUrl}/api/profiles/550e8400-e29b-41d4-a716-446655440000 \\
  -H "${authHeader}: <your-api-key>"`,
    },
    responseExample: {
      language: 'json',
      code: () => `{
  "ok": true,
  "deleted": true,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "profileName": "buyer-001",
  "launchCode": "BUYER_001"
}`,
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.134b0f8") },
      { code: '404', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.ffd42bf") },
      { code: '409', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.ef4b324") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.2f1687d"),
    ],
  },
  {
    id: 'api-profiles-status-detail',
    parentId: 'api-profiles-launch',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.label.7b98697"),
    method: 'GET',
    path: '/api/profiles/{profileId}/status',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.purpose.cc5b006"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.7cc5690"),
    fields: [
      { name: 'profileId', type: 'string', required: true, location: 'Path', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.5b1ecd5") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl ${launchBaseUrl}/api/profiles/550e8400-e29b-41d4-a716-446655440000/status \\
  -H "${authHeader}: <your-api-key>"`,
    },
    responseExample: {
      language: 'json',
      code: () => `{
  "ok": true,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "profileName": "buyer-001",
  "launchCode": "BUYER_001",
  "running": true,
  "debugPort": 9333,
  "debugReady": true,
  "active": true,
  "cdpUrl": "http://127.0.0.1:19876",
  "directDebugUrl": "http://127.0.0.1:9333"
}`,
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.b912a21") },
      { code: '404', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.ffd42bf") },
    ],
    notes: [],
  },
  {
    id: 'api-profiles-stop-detail',
    parentId: 'api-profiles-launch',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.label.d59d243"),
    method: 'POST',
    path: '/api/profiles/{profileId}/stop',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.purpose.0770809"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.e0c5b40"),
    fields: [
      { name: 'profileId', type: 'string', required: true, location: 'Path', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.5b1ecd5") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl -X POST ${launchBaseUrl}/api/profiles/550e8400-e29b-41d4-a716-446655440000/stop \\
  -H "${authHeader}: <your-api-key>"`,
    },
    responseExample: {
      language: 'json',
      code: () => `{
  "ok": true,
  "stopped": true,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "running": false,
  "debugReady": false,
  "active": false
}`,
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.1fc18f5") },
      { code: '404', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.ffd42bf") },
      { code: '503', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.2635d1d") },
    ],
    notes: [],
  },
  {
    id: 'api-launch-code-detail',
    parentId: 'api-profiles-launch',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.label.aa66730"),
    method: 'GET',
    path: '/api/launch/{code}',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.purpose.75fedbf"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.291138c"),
    fields: [
      { name: 'code', type: 'string', required: true, location: 'Path', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.54abbba") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => `curl ${launchBaseUrl}/api/launch/BUYER_001 \\
  -H "${authHeader}: <your-api-key>"`,
    },
    responseExample: {
      language: 'json',
      code: () => `{
  "ok": true,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "profileName": "buyer-001",
  "launchCode": "BUYER_001",
  "pid": 10240,
  "debugPort": 9333,
  "debugReady": true,
  "cdpPort": 19876,
  "cdpUrl": "http://127.0.0.1:19876"
}`,
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.7a54eb5") },
      { code: '404', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.1233b32") },
    ],
    notes: [],
  },
  {
    id: 'api-launch-body-detail',
    parentId: 'api-profiles-launch',
    label: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.label.9550de3"),
    method: 'POST',
    path: '/api/launch',
    purpose: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.purpose.97eab48"),
    description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.cade6ea"),
    fields: [
      { name: 'selector', type: 'object', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.d915f31") },
      { name: 'code', type: 'string', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.cf45598") },
      { name: 'profileId', type: 'string', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.403750d") },
      { name: 'profileName', type: 'string', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.104d221") },
      { name: 'keyword / keywords', type: 'string / string[]', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.04b223b") },
      { name: 'tag / tags', type: 'string / string[]', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.7295acf") },
      { name: 'groupId', type: 'string', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.42af52b") },
      { name: 'matchMode', type: 'unique | first | all', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.d1241ce") },
      { name: 'launchArgs', type: 'string[]', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.460ca44") },
      { name: 'startUrls', type: 'string[]', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.d3bf0d9") },
      { name: 'skipDefaultStartUrls', type: 'boolean', required: false, location: 'Body', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.c89985b") },
    ],
    requestExample: {
      language: 'bash',
      code: ({ launchBaseUrl, authHeader }) => tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.58e44b8", [launchBaseUrl, authHeader]),
    },
    responseExample: {
      language: 'json',
      code: () => `{
  "ok": true,
  "profileId": "550e8400-e29b-41d4-a716-446655440000",
  "profileName": "buyer-001",
  "launchCode": "BUYER_001",
  "debugReady": true,
  "cdpUrl": "http://127.0.0.1:19876"
}`,
    },
    responseCodes: [
      { code: '200', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.7a54eb5") },
      { code: '400', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.7c30056") },
      { code: '409', description: tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.description.cedfbe1") },
    ],
    notes: [
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.5cfe05e"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.7e3b297"),
      tr("browser.pages.launchApiDocs.structuredApiDocs.profileEndpoints.message.67a99f5"),
    ],
  },
]))
