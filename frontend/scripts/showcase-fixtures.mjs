// Fictional, in-memory data for README screenshots. Never use a desktop bridge.
export async function seedShowcase() {
  if (!import.meta.env?.DEV || globalThis.go?.main?.App) {
    throw new Error('Showcase data is available only in the Vite browser preview.')
  }
  const { getMockProfiles, setMockProfiles } = await import('../src/modules/browser/api/runtime.ts')
  const base = getMockProfiles()[0]
  if (!base) throw new Error('Expected the default browser-preview profile.')
  const entries = [
    ['Web regression', '界面回归', 'desktop'],
    ['Checkout QA', '结算流程', 'qa'],
    ['Documentation review', '文档检查', 'review'],
    ['Client preview', '客户演示', 'demo'],
  ]
  setMockProfiles(entries.map(([name, tag, key]) => ({
    ...base,
    profileId: `showcase-${key}`,
    profileName: name,
    userDataDir: `demo-only/${key}`,
    tags: [tag, 'DEMO'],
    keywords: [key],
    proxyId: '',
    proxyConfig: '',
    running: false,
    debugPort: 0,
    debugReady: false,
    pid: 0,
    runtimeWarning: '',
    lastError: '',
    createdAt: '2026-09-14T00:00:00Z',
    updatedAt: '2026-09-14T00:00:00Z',
  })))
  return { profiles: entries.length, kind: 'fictional-ui-preview' }
}
