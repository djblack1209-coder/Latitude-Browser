import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { build as buildProduction } from 'vite'

const directory = fileURLToPath(new URL('../', import.meta.url))
async function api(env = { DEV: false, VITE_ENABLE_DEV_MOCK: 'true' }, brokenBindings = false) {
  const plugins = brokenBindings ? [{name:'broken-module-fixture', setup(plugin) { plugin.onLoad({filter:/wailsjs\/go\/main\/App\.js$/}, () => ({contents:'throw new Error("module unavailable"); export const BrowserSnapshotRestore = () => {};'})) }}] : []
  const result = await build({ stdin: { contents: `export * from './src/modules/browser/api/snapshots'; export {getBindings,getGoApp} from './src/modules/browser/api/runtime'; export {createBrowserProfile} from './src/modules/browser/api/profiles'; export {deleteGroup} from './src/modules/browser/api/groups';`, resolveDir: directory }, bundle: true, platform: 'node', format: 'esm', write: false, plugins, define: { 'import.meta.env': JSON.stringify(env) } })
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text + `\n// ${Math.random()}`).toString('base64'))
}
function bridge(app) {
  globalThis.window = globalThis
  if (app === null) delete globalThis.go
  else globalThis.go = { main: { App: app } }
}

async function productionApi() {
  const entry = '\0production-bridge-regression'
  const result = await buildProduction({
    configFile: false,
    logLevel: 'error',
    plugins: [{ name: 'production-bridge-entry', resolveId(id) { if (id === entry) return entry }, load(id) {
      if (id === entry) return `export {getBindings,getGoApp} from ${JSON.stringify(directory + 'src/modules/browser/api/runtime')}; export * from ${JSON.stringify(directory + 'src/modules/browser/api/snapshots')};`
    } }],
    build: { write: false, minify: true, rollupOptions: { input: entry, preserveEntrySignatures: 'strict', output: { format: 'es', inlineDynamicImports: true } } },
  })
  const chunk = result.output.find(item => item.type === 'chunk' && item.isEntry)
  // Vite/Rollup freezes this namespace, unlike the esbuild-only fixtures above.
  assert.match(chunk.code, /Object\.freeze\(/)
  return import('data:text/javascript;base64,' + Buffer.from(chunk.code + `\n// ${Math.random()}`).toString('base64'))
}

test('Vite production bindings support successful calls, backend errors and bridge revocation', async () => {
  const calls = []
  bridge({ BrowserSnapshotRestore: async (...args) => { calls.push(args) }, BrowserSnapshotDelete: async () => { throw new Error('backend refused') } })
  const module = await productionApi()
  assert.equal(await module.restoreSnapshot('p', 's'), true)
  assert.deepEqual(calls, [['p', 's']])
  await assert.rejects(() => module.deleteSnapshot('p', 's'), /backend refused/)
  const restore = (await module.getBindings()).BrowserSnapshotRestore
  bridge({})
  assert.throws(() => restore('p', 's'), error => error.code === 'DESKTOP_METHOD_UNAVAILABLE')
  await assert.rejects(() => module.restoreSnapshot('p', 's'), error => error.code === 'DESKTOP_METHOD_UNAVAILABLE')
  bridge(null)
  assert.throws(() => restore('p', 's'), error => error.code === 'DESKTOP_BRIDGE_UNAVAILABLE')
  await assert.rejects(() => module.restoreSnapshot('p', 's'), error => error.code === 'DESKTOP_BRIDGE_UNAVAILABLE')
})

test('frozen native bridge preserves its receiver and validates calls after lookup', async () => {
  const native = Object.freeze({ BrowserSnapshotRestore(...args) { assert.equal(this, native); return args } })
  bridge(native)
  const module = await api()
  const restore = module.getGoApp().BrowserSnapshotRestore
  assert.deepEqual(restore('p', 's'), ['p', 's'])
  bridge(null)
  assert.throws(() => restore('p', 's'), error => error.code === 'DESKTOP_BRIDGE_UNAVAILABLE')
})

test('production without desktop bridge rejects reads and writes; flag alone cannot enable mock', async () => {
  bridge(null)
  const module = await api()
  for (const run of [() => module.listSnapshots('p'), () => module.createSnapshot('p','s'), () => module.restoreSnapshot('p','s'), () => module.deleteSnapshot('p','s'), () => module.createBrowserProfile({}), () => module.deleteGroup('g')]) {
    await assert.rejects(run, error => error.code === 'DESKTOP_BRIDGE_UNAVAILABLE')
  }
  assert.throws(() => module.getGoApp(), error => error.code === 'DESKTOP_BRIDGE_UNAVAILABLE')
})

test('missing desktop method cannot fall through to a successful simulation', async () => {
  bridge({})
  const module = await api()
  await assert.rejects(() => module.restoreSnapshot('p','s'), error => error.code === 'DESKTOP_METHOD_UNAVAILABLE')
})

test('normal desktop call forwards parameters and propagates backend rejection', async () => {
  const calls = []
  bridge({ BrowserSnapshotRestore: async (...args) => { calls.push(args) }, BrowserSnapshotDelete: async () => { throw new Error('backend refused') } })
  const module = await api()
  assert.equal(await module.restoreSnapshot('p','s'), true)
  assert.deepEqual(calls, [['p','s']])
  await assert.rejects(() => module.deleteSnapshot('p','s'), /backend refused/)
})

test('binding module import failure is explicit and revocation after lookup rejects', async () => {
  bridge({BrowserSnapshotRestore: async () => {}})
  const broken = await api({DEV:false}, true)
  await assert.rejects(() => broken.restoreSnapshot('p','s'), error => error.code === 'DESKTOP_BINDINGS_LOAD_FAILED')
  const module = await api()
  const bindings = await module.getBindings()
  const restore = bindings.BrowserSnapshotRestore
  bridge(null)
  assert.throws(() => restore('p','s'), error => error.code === 'DESKTOP_BRIDGE_UNAVAILABLE')
})

test('mock requires explicit opt-in in development and never hides a broken desktop method', async () => {
  bridge(null)
  const disabled = await api({DEV:true})
  await assert.rejects(() => disabled.restoreSnapshot('p','s'), error => error.code === 'DESKTOP_BRIDGE_UNAVAILABLE')
  const enabled = await api({DEV:true,VITE_ENABLE_DEV_MOCK:'true'})
  assert.equal(await enabled.restoreSnapshot('p','s'), true)
  bridge({})
  await assert.rejects(() => enabled.restoreSnapshot('p','s'), error => error.code === 'DESKTOP_METHOD_UNAVAILABLE')
})

test('page boundary hides business controls when unavailable and labels development simulation', async () => {
  const load = async (env) => {
    const result = await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {DesktopServiceBoundary} from './src/shared/components/DesktopServiceBoundary'; export function render(){ return renderToStaticMarkup(React.createElement(DesktopServiceBoundary,{},React.createElement('button',{},'dangerous business action'))); }`, resolveDir: directory }, bundle:true, platform:'node', format:'cjs', write:false, define:{'import.meta.env':JSON.stringify(env)}})
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    const mod = {exports:{}}
    new Function('require','module','exports',result.outputFiles[0].text)(require,mod,mod.exports)
    return mod.exports.render()
  }
  bridge(null)
  const production = await load({DEV:false})
  assert.match(production, /桌面服务尚未就绪/)
  assert.doesNotMatch(production, /dangerous business action/)
  const mock = await load({DEV:true,VITE_ENABLE_DEV_MOCK:'true'})
  assert.match(mock, /开发模拟模式/)
  assert.match(mock, /dangerous business action/)
  bridge({})
  const desktop = await load({DEV:false})
  assert.match(desktop, /dangerous business action/)
})
