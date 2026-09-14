/** Offline guard tests: never launch the installed app/Chrome or contact a public host. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { assertDebugURL, canonicalNavigationURL, chromeLauncherSource, ensurePrivateDirectory, isWithin, matchesMainFrameResponse, ownedProfileResponse, ownedRuntimeMatches, parseQASpeedCompletion, readLauncherRecords, registerOwnedBrowsers, requestJSON, safeError, waitForBridgeIdle } from './verify-native-proxy.mjs'
import { NATIVE_EXECUTABLE, assertMihomoListeners, assertNewMihomoGeneration, assertRuntimeExecutablePaths, assertSelectedKernelOnly, connectorStack, managedBridgeCommand, managedChromeProxyPort, mihomoGenerationExited, mihomoPortsReleased, nativeProxyOptions, parseInternetSockets, parseMihomoBridgePorts, parseNativeProxyCLI, readMihomoBridgePorts, registerOwnedBridges, waitForMihomoRelease } from './verify-native-proxy.mjs'

const exec = promisify(execFile)
const runner = fileURLToPath(new URL('./verify-native-proxy.mjs', import.meta.url))
async function privateRoot(t) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'latitude-proxy-guard-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
async function launcherFixture(t) {
  const root = await privateRoot(t)
  const userDataDir = join(root, "private profile's directory")
  const osHome = join(root, "OS home's $(not-a-command)")
  const identityDir = join(root, "launch identity's $(not-an-identity-command)")
  await mkdir(userDataDir)
  await mkdir(osHome)
  await mkdir(identityDir, { mode: 0o700 })
  const chromeExecutable = join(root, "fake chrome's executable")
  // Fake executable reports arguments only; no native application is invoked.
  await writeFile(chromeExecutable, '#!/bin/sh\nprintf "%s\\n" "$HOME" "$@"\n', { mode: 0o700 })
  const launcher = join(root, 'chrome')
  await writeFile(launcher, chromeLauncherSource({ userDataDir, osHome, identityDir, chromeExecutable }), { mode: 0o700 })
  return { root, userDataDir, osHome, identityDir, launcher }
}
async function localJSONServer(t, handler) {
  const server = createServer(handler)
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  t.after(() => new Promise((done) => { server.close(done); server.closeAllConnections() }))
  return `http://127.0.0.1:${server.address().port}`
}

test('lexical containment rejects siblings and traversal, not just a matching prefix', () => {
  assert.equal(isWithin('/qa/root', '/qa/root/profile'), true)
  assert.equal(isWithin('/qa/root', '/qa/root'), true)
  assert.equal(isWithin('/qa/root', '/qa/root-other'), false)
  assert.equal(isWithin('/qa/root', '/qa/root/../../production'), false)
})

test('private writable path creation stays canonical and owner-only', async (t) => {
  const root = await privateRoot(t)
  const path = join(root, 'state', 'data', 'profile')
  assert.equal(await ensurePrivateDirectory(root, path), path)
  assert.equal(await realpath(path), path)
  assert.equal((await lstat(path)).mode & 0o077, 0)
  assert.equal(await ensurePrivateDirectory(root, path), path)
  await assert.rejects(ensurePrivateDirectory(root, `${root}-sibling`), /canonical root/)
})

test('writable path rejects intermediate symlinks, symlink roots, and ordinary files', async (t) => {
  const root = await privateRoot(t)
  const outside = await privateRoot(t)
  await symlink(outside, join(root, 'linked'))
  await assert.rejects(ensurePrivateDirectory(root, join(root, 'linked', 'data')), /symlink/)
  await assert.rejects(ensurePrivateDirectory(join(root, 'linked'), join(root, 'linked', 'data')), /canonical root/)
  await writeFile(join(root, 'ordinary-file'), 'keep')
  await assert.rejects(ensurePrivateDirectory(root, join(root, 'ordinary-file', 'data')), /non-directory/)
  assert.equal(await readFile(join(root, 'ordinary-file'), 'utf8'), 'keep')
})

test('QA launcher preserves exact arguments and only restores OS HOME after UDD guard', async (t) => {
  const { userDataDir, osHome, launcher } = await launcherFixture(t)
  const args = [`--user-data-dir=${userDataDir}`, '--no-first-run', 'about:blank']
  const { stdout } = await exec(launcher, args, { env: { HOME: '/deliberately-not-the-os-home' } })
  assert.deepEqual(stdout.trimEnd().split('\n'), [osHome, ...args])
})

test('QA launcher permits only the standalone version probe without a UDD', async (t) => {
  const { osHome, identityDir, launcher } = await launcherFixture(t)
  assert.equal((await exec(launcher, ['--version'])).stdout, `${osHome}\n--version\n`)
  assert.deepEqual(await readdir(identityDir), [], 'The standalone version probe must not create a process identity')
  await assert.rejects(exec(launcher, ['--version', 'about:blank']), { code: 64 })
  assert.deepEqual(await readdir(identityDir), [])
})

test('QA launcher refuses missing, duplicated, separated, foreign, or redirected browser directories', async (t) => {
  const { userDataDir, launcher } = await launcherFixture(t)
  const approved = `--user-data-dir=${userDataDir}`
  for (const args of [[], ['about:blank'], ['--user-data-dir', userDataDir], [approved, approved], [`${approved}-different`], [approved, '--profile-directory=Default'], [approved, '--disk-cache-dir=/tmp/elsewhere']]) {
    await assert.rejects(exec(launcher, args), { code: 64 })
  }
})

test('QA launcher refuses a profile directory replaced by a symlink', async (t) => {
  const { root, userDataDir, launcher } = await launcherFixture(t)
  const target = join(root, 'elsewhere')
  await mkdir(target)
  await rm(userDataDir, { recursive: true })
  await symlink(target, userDataDir)
  await assert.rejects(exec(launcher, [`--user-data-dir=${userDataDir}`]), { code: 64 })
})

test('launcher generator rejects relative configuration paths', () => {
  const valid = { userDataDir: '/qa/profile', osHome: '/qa/os-home', identityDir: '/qa/identities', chromeExecutable: '/qa/fake' }
  for (const key of ['userDataDir', 'osHome', 'identityDir', 'chromeExecutable']) {
    assert.throws(() => chromeLauncherSource({ ...valid, [key]: './relative' }), /absolute/)
  }
  assert.throws(() => chromeLauncherSource({ ...valid, identityDir: undefined }), /absolute/)
  assert.throws(() => chromeLauncherSource({ ...valid, identityDir: '' }), /absolute/)
})

test('CDP URLs must match owned loopback port and supported endpoint paths', () => {
  assert.equal(assertDebugURL('http://127.0.0.1:9222', 9222).port, '9222')
  assert.equal(assertDebugURL('ws://127.0.0.1:9222/devtools/page/abcd-123', 9222, true).protocol, 'ws:')
  for (const url of ['https://127.0.0.1:9222', 'http://localhost:9222', 'http://example.com:9222', 'http://127.0.0.1:9223', 'http://user:pass@127.0.0.1:9222', 'http://127.0.0.1:9222/?secret=yes', 'http://127.0.0.1:9222/anything']) assert.throws(() => assertDebugURL(url, 9222))
  assert.throws(() => assertDebugURL('ws://127.0.0.1:9222/other', 9222, true))
})

test('status lookup never turns errors, missing fields, wrong identity or 202 into stopped', () => {
  const good = { status: 200, ok: true, data: { ok: true, profile: { profileId: 'owned', running: false } } }
  assert.equal(ownedProfileResponse(good, 'owned').running, false)
  for (const result of [
    { ...good, status: 202 }, { ...good, status: 500, ok: false }, { ...good, data: {} },
    { ...good, data: { ok: true, profile: { profileId: 'owned' } } },
    { ...good, data: { ok: true, profile: { profileId: 'other', running: false } } },
    { ...good, data: { ok: false, profile: good.data.profile } },
    { ...good, data: { ok: true, profile: { profileId: 'owned', running: 'false' } } },
  ]) assert.throws(() => ownedProfileResponse(result, 'owned'))
})

test('runtime fallback requires complete identity, not PID or command substring alone', () => {
  const row = { pid: 101, uid: 501, started: 'Mon Sep 7 01:00:00 2026', command: '/owned/runtime --user-data-dir=/qa/profile' }
  assert.equal(ownedRuntimeMatches(row, { ...row }), true)
  for (const key of ['pid', 'uid', 'started', 'command']) assert.equal(ownedRuntimeMatches(row, { ...row, [key]: 'changed' }), false)
  assert.equal(ownedRuntimeMatches(row, undefined), false)
})

test('diagnostics redact credentials, keys and IP addresses and remain bounded', () => {
  const input = new Error('failure socks5://qa-user:qa-password@127.0.0.1:1234 api-key-123 public 203.0.113.12 IPv6 [2001:db8::20]')
  const result = safeError(input, ['api-key-123'])
  for (const secret of ['qa-user', 'qa-password', 'api-key-123', '127.0.0.1', '203.0.113.12', '2001:db8::20']) assert.equal(result.includes(secret), false)
  assert.match(result, /redacted/)
  assert.equal(safeError('a'.repeat(5000)).length, 700)
})

test('JSON API helper accepts local structured results and rejects HTML or empty bodies', async (t) => {
  const url = await localJSONServer(t, (req, res) => { res.end(req.url === '/ok' ? '{"ok":true}' : req.url === '/html' ? '<html>wrong service</html>' : '') })
  assert.deepEqual(await requestJSON(`${url}/ok`), { status: 200, ok: true, data: { ok: true } })
  await assert.rejects(requestJSON(`${url}/html`), /non-JSON/)
  await assert.rejects(requestJSON(`${url}/empty`), /non-JSON/)
})

test('JSON API helper refuses redirects instead of forwarding an authorization header', async (t) => {
  let redirectedRequests = 0
  const url = await localJSONServer(t, (req, res) => {
    if (req.url === '/start') { res.writeHead(302, { Location: '/destination' }); res.end() }
    else { redirectedRequests += 1; res.end('{"ok":true}') }
  })
  await assert.rejects(requestJSON(`${url}/start`, { headers: { 'X-QA-Test': 'test-only' } }))
  assert.equal(redirectedRequests, 0)
})

test('JSON API helper bounds the response stream and respects cancellation', async (t) => {
  const url = await localJSONServer(t, (_req, res) => { res.end('a'.repeat(2 * 1024 * 1024 + 1)) })
  await assert.rejects(requestJSON(url), /QA bound/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(requestJSON(url, {}, 1000, controller.signal))
})

test('default/help/unknown-argument CLI paths never require native setup or opt into execution', async (t) => {
  const home = await privateRoot(t)
  for (const args of [[], ['--help'], ['-h']]) {
    const result = await exec(process.execPath, [runner, ...args], { env: { HOME: home } })
    assert.match(result.stdout, /Default\/help does not start apps or contact the network/)
    assert.doesNotMatch(result.stdout, /PASS /)
  }
  for (const args of [['--unknown'], ['--run', '--unknown'], ['--background-overlap']]) {
    await assert.rejects(exec(process.execPath, [runner, ...args], { env: { HOME: home } }), { code: 2 })
  }
  await assert.rejects(lstat(resolve(home, 'Library')), { code: 'ENOENT' })
})

const IDENTITY_MARKER = 'latitude-native-launch-v1'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const HELPER = '/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/test/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)'
const STARTED = 'Mon Sep 7 01:00:00 2026'

function identityText({ pid, uid, started = STARTED, parentPID }) {
  return `${pid}\n${uid}\n${started}\n${parentPID}\n${IDENTITY_MARKER}\n`
}
async function identityFixture(t, { pid = 65101, parentPID = 65100, started = STARTED } = {}) {
  const root = await privateRoot(t)
  const identityDir = join(root, "private launcher's records")
  await mkdir(identityDir, { mode: 0o700 })
  const record = { pid, uid: process.getuid(), started, parentPID }
  const path = join(identityDir, String(pid))
  await writeFile(path, identityText(record), { mode: 0o600 })
  return { root, identityDir, record, path }
}
function browserTree({ pid = 65101, appPID = 65100, userDataDir = "/qa/private profile's directory", uid = process.getuid(), parentPID = appPID } = {}) {
  const browser = { pid, parentPID, uid, started: STARTED, command: `${CHROME} --user-data-dir=${userDataDir} --no-first-run about:blank` }
  const helper = { pid: pid + 1, parentPID: pid, uid, started: STARTED, command: `${HELPER} --type=renderer` }
  const grandchild = { pid: pid + 2, parentPID: pid + 1, uid, started: STARTED, command: `${HELPER} --type=utility` }
  const record = { pid, uid, started: STARTED, parentPID: appPID }
  return { browser, helper, grandchild, record, context: { appPID, userDataDir, uid } }
}

test('QA launcher writes one private complete five-line identity before exec, preserving quoted identity paths', async (t) => {
  const { userDataDir, identityDir, launcher } = await launcherFixture(t)
  const launch = exec(launcher, [`--user-data-dir=${userDataDir}`, 'about:blank'], { timeout: 5000 })
  const launchedPID = launch.child.pid
  await launch
  const names = await readdir(identityDir)
  assert.deepEqual(names, [String(launchedPID)])
  const path = join(identityDir, names[0])
  const info = await lstat(path)
  assert.equal(info.isFile(), true)
  assert.equal(info.uid, process.getuid())
  assert.equal(info.mode & 0o777, 0o600)
  const text = await readFile(path, 'utf8')
  assert.equal(text.endsWith('\n'), true)
  const lines = text.trimEnd().split('\n')
  assert.equal(lines.length, 5)
  assert.equal(Number(lines[0]), launchedPID)
  assert.equal(Number(lines[1]), process.getuid())
  assert.match(lines[2].trim(), /^\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4}$/)
  assert.equal(Number(lines[3]), process.pid)
  assert.equal(lines[4], IDENTITY_MARKER)
  assert.deepEqual(await readLauncherRecords(identityDir), [{
    pid: launchedPID, uid: process.getuid(), started: lines[2].trim().replace(/\s+/g, ' '), parentPID: process.pid,
  }])
})

test('QA launcher refuses an identity directory replaced by a symlink without writing outside its owned location', async (t) => {
  const { root, userDataDir, identityDir, launcher } = await launcherFixture(t)
  const target = join(root, 'unapproved-record-location')
  await mkdir(target, { mode: 0o700 })
  await rm(identityDir, { recursive: true })
  await symlink(target, identityDir)
  await assert.rejects(exec(launcher, [`--user-data-dir=${userDataDir}`, 'about:blank']), { code: 64 })
  assert.deepEqual(await readdir(target), [])
})

test('launcher reader treats incomplete writes as pending until the fixed fifth-line marker is complete', async (t) => {
  const { identityDir, record, path } = await identityFixture(t)
  const complete = identityText(record)
  for (const partial of ['', `${record.pid}\n`, complete.split('\n').slice(0, 4).join('\n'), complete.replace(IDENTITY_MARKER, 'latitude-native-launch-')]) {
    await writeFile(path, partial)
    assert.deepEqual(await readLauncherRecords(identityDir), [])
  }
  await writeFile(path, `${record.pid}\n ${record.uid} \nMon  Sep   7 01:00:00 2026\n  ${record.parentPID}\n${IDENTITY_MARKER}\n`)
  assert.deepEqual(await readLauncherRecords(identityDir), [record])
})

test('launcher reader rejects a symlink record even when its target is private and valid', async (t) => {
  const { root, identityDir, record, path } = await identityFixture(t)
  const target = join(root, 'valid-but-not-the-record')
  await writeFile(target, identityText(record), { mode: 0o600 })
  await rm(path)
  await symlink(target, path)
  await assert.rejects(readLauncherRecords(identityDir), /not private or bounded/)
  assert.equal(await readFile(target, 'utf8'), identityText(record))
})

test('launcher reader rejects oversized records, directory entries and non-private modes', async (t) => {
  const { identityDir, record, path } = await identityFixture(t)
  await writeFile(path, 'x'.repeat(513))
  await assert.rejects(readLauncherRecords(identityDir), /not private or bounded/)
  await writeFile(path, identityText(record))
  for (const mode of [0o644, 0o620, 0o604]) {
    await chmod(path, mode)
    await assert.rejects(readLauncherRecords(identityDir), /not private or bounded/)
  }
  await chmod(path, 0o600)
  assert.deepEqual(await readLauncherRecords(identityDir), [record])
  await rm(path)
  await mkdir(path, { mode: 0o700 })
  await assert.rejects(readLauncherRecords(identityDir), /not private or bounded/)
})

test('launcher reader rejects a complete marker paired with inconsistent PID, UID, start time or original parent', async (t) => {
  const { identityDir, record, path } = await identityFixture(t)
  for (const changes of [{ pid: record.pid + 1 }, { uid: 'not-a-uid' }, { parentPID: 'not-a-parent' }, { started: 'short' }]) {
    await writeFile(path, identityText({ ...record, ...changes }))
    await assert.rejects(readLauncherRecords(identityDir), /Invalid QA launcher identity record/)
  }
})

test('launcher reader bounds record count and rejects non-PID filenames', async (t) => {
  const { identityDir, path } = await identityFixture(t)
  await writeFile(join(identityDir, 'unexpected.txt'), '', { mode: 0o600 })
  await assert.rejects(readLauncherRecords(identityDir), /identity filename/)
  await rm(join(identityDir, 'unexpected.txt'))
  await rm(path)
  for (let i = 1; i <= 33; i += 1) await writeFile(join(identityDir, String(i)), '', { mode: 0o600 })
  await assert.rejects(readLauncherRecords(identityDir), /number of QA launcher identity records/)
})

test('browser ledger cannot infer ownership from a bare API PID, matching command or current app parent', () => {
  const { browser, helper, grandchild, context } = browserTree()
  const ledger = new Map()
  // A LaunchServer response PID can point at this row, but no guarded launcher
  // record exists: neither it nor any of its descendants may enter the ledger.
  registerOwnedBrowsers([browser, helper, grandchild], ledger, [], context)
  assert.equal(ledger.size, 0)
})

test('browser ledger rejects wrong UDD, original parent, UID, start or executable without absorbing helpers', () => {
  const tree = browserTree()
  const invalid = [
    { row: { command: `${CHROME} --user-data-dir=${tree.context.userDataDir}-sibling about:blank` } },
    { row: { command: `${CHROME} --user-data-dir=/production/profile about:blank` } },
    { row: { command: `${CHROME} --user-data-dir ${tree.context.userDataDir} about:blank` } },
    { row: { command: `${CHROME}-unrelated --user-data-dir=${tree.context.userDataDir}` } },
    { record: { parentPID: tree.context.appPID + 10 } },
    { row: { uid: tree.context.uid + 1 } },
    { record: { uid: tree.context.uid + 1 } },
    { row: { started: 'Mon Sep 7 02:00:00 2026' } },
    { record: { started: 'Mon Sep 7 02:00:00 2026' } },
    { record: { pid: tree.browser.pid + 20 } },
  ]
  for (const entry of invalid) {
    const ledger = new Map()
    registerOwnedBrowsers([{ ...tree.browser, ...entry.row }, tree.helper, tree.grandchild], ledger, [{ ...tree.record, ...entry.record }], tree.context)
    assert.equal(ledger.size, 0)
  }
})

test('an already-recorded root PID is never overwritten on reuse and cannot authorize new helpers', () => {
  const { browser, helper, grandchild, record, context } = browserTree()
  const original = { ...browser }
  const ledger = new Map([[browser.pid, original]])
  const replacement = { ...browser, started: 'Mon Sep 7 03:00:00 2026' }
  const newRecord = { ...record, started: replacement.started }
  registerOwnedBrowsers([replacement, helper, grandchild], ledger, [newRecord], context)
  assert.equal(ledger.size, 1)
  assert.strictEqual(ledger.get(browser.pid), original)
  assert.deepEqual(ledger.get(browser.pid), browser)
  assert.equal(ownedRuntimeMatches(replacement, ledger.get(browser.pid)), false)
})

test('a reused helper PID cannot authorize grandchildren even if its own browser is still verified', () => {
  const { browser, helper, grandchild, record, context } = browserTree()
  const originalHelper = { ...helper }
  const ledger = new Map([[browser.pid, { ...browser }], [helper.pid, originalHelper]])
  const replacement = { ...helper, started: 'Mon Sep 7 03:00:00 2026' }
  registerOwnedBrowsers([grandchild, replacement, browser], ledger, [record], context)
  assert.equal(ledger.size, 2)
  assert.strictEqual(ledger.get(helper.pid), originalHelper)
  assert.equal(ledger.has(grandchild.pid), false)
})

test('private launcher records recover a reparented Chrome and its descendants after the original app has died', async (t) => {
  const { identityDir, record } = await identityFixture(t)
  const { browser, helper, grandchild, context } = browserTree({ pid: record.pid, appPID: record.parentPID, uid: record.uid, parentPID: 1 })
  const unrelated = { ...helper, pid: helper.pid + 20, parentPID: 1 }
  const wrongUID = { ...helper, pid: helper.pid + 21, uid: record.uid + 1 }
  const notChrome = { ...helper, pid: helper.pid + 22, command: '/bin/sh -c test-only' }
  const ledger = new Map()
  // Deliberately unordered and no app row: discovery may not rely on a live
  // app parent or on process-list ordering to recover the proven descendants.
  registerOwnedBrowsers([grandchild, unrelated, wrongUID, notChrome, helper, browser], ledger, await readLauncherRecords(identityDir), context)
  assert.deepEqual([...ledger.keys()].sort((a, b) => a - b), [browser.pid, helper.pid, grandchild.pid])
  assert.deepEqual(ledger.get(browser.pid), browser)
  assert.notStrictEqual(ledger.get(browser.pid), browser, 'The ledger must retain a snapshot rather than a mutable input row')
  assert.equal(ledger.get(browser.pid).parentPID, 1)
})

test('navigation canonicalization adds the missing root slash without losing query or nonce', () => {
  assert.equal(canonicalNavigationURL('https://api.ipify.org'), 'https://api.ipify.org/')
  assert.equal(canonicalNavigationURL('https://api.ipify.org?format=json&nonce=first'), 'https://api.ipify.org/?format=json&nonce=first')
  assert.equal(canonicalNavigationURL('http://latitude-native-proxy.invalid:23456?nonce=one%2Ftwo'), 'http://latitude-native-proxy.invalid:23456/?nonce=one%2Ftwo')
  assert.equal(canonicalNavigationURL('https://API.IPIFY.ORG:443/?format=json&nonce=second'), 'https://api.ipify.org/?format=json&nonce=second')
  assert.throws(() => canonicalNavigationURL('/relative?nonce=no-origin'))
})

test('main-frame response matching requires the exact frame, loader, Document type and complete nonce URL', () => {
  const requested = 'https://api.ipify.org?format=json&nonce=current'
  const navigation = { frameId: 'main-frame', loaderId: 'current-loader' }
  const event = { method: 'Network.responseReceived', params: { frameId: navigation.frameId, loaderId: navigation.loaderId, type: 'Document', response: { url: canonicalNavigationURL(requested), status: 200 } } }
  assert.equal(matchesMainFrameResponse(event, navigation, requested), true)
  for (const update of [
    { frameId: 'iframe' }, { frameId: undefined }, { loaderId: 'previous-loader' }, { loaderId: undefined },
    { type: 'Fetch' }, { type: 'XHR' }, { type: undefined },
    { response: { url: 'https://api.ipify.org/?format=json&nonce=previous' } },
    { response: { url: 'https://api.ipify.org/?format=json' } },
    { response: { url: 'https://api.ipify.org/?format=json&nonce=current-extra' } },
    { response: { url: 'https://api.ipify.org/?format=json&nonce=current&extra=1' } },
    { response: { url: 'https://api.ipify.org/?nonce=current&format=json' } },
    { response: { url: 'https://api.ipify.org/other?format=json&nonce=current' } },
    { response: { url: 'http://api.ipify.org/?format=json&nonce=current' } },
    { response: { url: 'https://other.invalid/?format=json&nonce=current' } },
    { response: {} }, { response: undefined },
  ]) assert.equal(matchesMainFrameResponse({ ...event, params: { ...event.params, ...update } }, navigation, requested), false)
  assert.equal(matchesMainFrameResponse({ ...event, method: 'Network.requestWillBeSent' }, navigation, requested), false)
  assert.equal(matchesMainFrameResponse({ method: event.method }, navigation, requested), false)
  assert.equal(matchesMainFrameResponse(event, { ...navigation, frameId: 'other-navigation-frame' }, requested), false)
  assert.equal(matchesMainFrameResponse(event, { ...navigation, loaderId: 'other-navigation-loader' }, requested), false)
  for (const frameId of [undefined, '', 123]) for (const loaderId of [undefined, '', 456]) {
    assert.equal(matchesMainFrameResponse({ ...event, params: { ...event.params, frameId, loaderId } }, { frameId, loaderId }, requested), false)
  }
})

// Injected monotonic clock: these 55–150 second scenarios perform no real waits,
// read no database, and inspect no application processes or public endpoints.
const FIRST_SPEED_COMPLETION = '2026-09-07T01:00:00Z'
const NEXT_SPEED_COMPLETION = '2026-09-07T01:02:00+00:00'
function idleObservation(changes = {}) {
  return { released: false, witnessForwarded: 0, bridgeGenerationCount: 1, speedCompletedAt: '', ...changes }
}
function idleClock(inspect, overrides = {}) {
  let time = 0
  let calls = 0
  const clock = {
    get time() { return time },
    get calls() { return calls },
    advance(ms) { time += ms },
    set(ms) { time = ms },
  }
  const options = {
    inspect: async () => { calls += 1; return inspect(clock) },
    now: () => time,
    pause: async (ms) => {
      assert.ok(Number.isFinite(ms) && ms > 0, 'The helper must request a finite positive polling delay')
      time += ms
      assert.ok(calls < 2000, 'A deterministic idle test must not loop indefinitely')
    },
    ...overrides,
  }
  return { clock, options }
}
function assertIdleReport(report, elapsedMs, { hardTimeoutMs = 150000, windowMs = 70000 } = {}) {
  assert.equal(report.elapsedMs, elapsedMs)
  assert.equal(report.hardTimeoutMs, hardTimeoutMs)
  assert.ok(Number.isFinite(report.allowedWindowMs) && report.allowedWindowMs >= windowMs && report.allowedWindowMs <= hardTimeoutMs)
  assert.equal(typeof report.backgroundSpeedCompletionObserved, 'boolean')
  assert.ok(Array.isArray(report.activityObservations))
  for (const activity of report.activityObservations) {
    assert.ok(Number.isFinite(activity.elapsedMs) && activity.elapsedMs >= 0 && activity.elapsedMs <= elapsedMs)
    assert.ok(Array.isArray(activity.reasons) && activity.reasons.length > 0)
    assert.equal(new Set(activity.reasons).size, activity.reasons.length)
    for (const reason of activity.reasons) assert.ok(['witness_traffic', 'new_bridge_identity', 'background_speed_completed'].includes(reason))
  }
}

test('idle wait succeeds at 55 seconds without background activity only after real release is observed', async () => {
  const { clock, options } = idleClock(({ time }) => idleObservation({ released: time >= 55000 }))
  const report = await waitForBridgeIdle(options)
  assertIdleReport(report, 55000)
  assert.equal(clock.time, 55000)
  assert.equal(report.allowedWindowMs, 70000)
  assert.deepEqual(report.activityObservations, [])
  assert.equal(report.backgroundSpeedCompletionObserved, false)
})

test('idle wait extends the soft window for a 30-second witness touch and observes release at 90 seconds', async () => {
  const { options } = idleClock(({ time }) => idleObservation({
    released: time >= 90000, witnessForwarded: time >= 30000 ? 1 : 0, speedCompletedAt: FIRST_SPEED_COMPLETION,
  }))
  const report = await waitForBridgeIdle(options)
  assertIdleReport(report, 90000)
  assert.deepEqual(report.activityObservations, [{ elapsedMs: 30000, reasons: ['witness_traffic'] }])
})

test('idle wait extends for a newly proven bridge identity without requiring fixture HTTP traffic', async () => {
  const { options } = idleClock(({ time }) => idleObservation({
    released: time >= 90000, bridgeGenerationCount: time >= 30000 ? 2 : 1, speedCompletedAt: FIRST_SPEED_COMPLETION,
  }))
  const report = await waitForBridgeIdle(options)
  assertIdleReport(report, 90000)
  assert.deepEqual(report.activityObservations, [{ elapsedMs: 30000, reasons: ['new_bridge_identity'] }])
})

test('idle wait uses a DB-only failed-speed completion at 35 seconds as activity, not as a successful release', async () => {
  const { options } = idleClock(({ time }) => idleObservation({
    // A failed automatic speed test still updates last_tested_at. Its completion
    // is evidence of bridge use, never evidence that the PID/port was released.
    released: time >= 90000, speedCompletedAt: time >= 35000 ? NEXT_SPEED_COMPLETION : '',
  }))
  const report = await waitForBridgeIdle(options)
  assertIdleReport(report, 90000)
  assert.deepEqual(report.activityObservations, [{ elapsedMs: 35000, reasons: ['background_speed_completed'] }])
  assert.equal(report.backgroundSpeedCompletionObserved, true)
})

test('idle wait does not expire at 70 seconds while the first DB completion is pending until 72 seconds; release at 125 seconds passes', async () => {
  const { clock, options } = idleClock(({ time }) => idleObservation({
    released: time >= 125000, speedCompletedAt: time >= 72000 ? NEXT_SPEED_COMPLETION : '',
  }))
  const report = await waitForBridgeIdle(options)
  assertIdleReport(report, 125000)
  assert.equal(clock.time, 125000)
  assert.deepEqual(report.activityObservations, [{ elapsedMs: 72000, reasons: ['background_speed_completed'] }])
  assert.equal(report.backgroundSpeedCompletionObserved, true)
})

test('idle wait honors observable activity at 69 seconds rather than expiring the original 70-second window', async () => {
  const { options } = idleClock(({ time }) => idleObservation({
    released: time >= 125000, witnessForwarded: time >= 69000 ? 1 : 0, speedCompletedAt: FIRST_SPEED_COMPLETION,
  }))
  const report = await waitForBridgeIdle(options)
  assertIdleReport(report, 125000)
  assert.deepEqual(report.activityObservations, [{ elapsedMs: 69000, reasons: ['witness_traffic'] }])
})

test('idle wait records concurrent evidence once, with each actual reason, and does not repeatedly extend unchanged snapshots', async () => {
  const { options } = idleClock(({ time }) => idleObservation({
    released: time >= 90000,
    witnessForwarded: time >= 30000 ? 2 : 0,
    bridgeGenerationCount: time >= 30000 ? 2 : 1,
    speedCompletedAt: time >= 30000 ? NEXT_SPEED_COMPLETION : '',
  }))
  const report = await waitForBridgeIdle(options)
  assertIdleReport(report, 90000)
  assert.equal(report.activityObservations.length, 1)
  assert.equal(report.activityObservations[0].elapsedMs, 30000)
  assert.deepEqual([...report.activityObservations[0].reasons].sort(), ['background_speed_completed', 'new_bridge_identity', 'witness_traffic'])
})

test('idle wait treats a changed completion timestamp only as an opaque token, not as its deadline clock', async () => {
  const earlierWallClock = '2025-01-01T00:00:00+08:00'
  const { options } = idleClock(({ time }) => idleObservation({
    released: time >= 90000, speedCompletedAt: time >= 30000 ? earlierWallClock : FIRST_SPEED_COMPLETION,
  }))
  const report = await waitForBridgeIdle(options)
  assertIdleReport(report, 90000)
  assert.deepEqual(report.activityObservations, [{ elapsedMs: 30000, reasons: ['background_speed_completed'] }])
  assert.equal(report.backgroundSpeedCompletionObserved, true)
})

test('idle wait fails after 70 seconds without new activity when a completion marker already exists', async () => {
  const { clock, options } = idleClock(() => idleObservation({ speedCompletedAt: FIRST_SPEED_COMPLETION }))
  await assert.rejects(waitForBridgeIdle(options), /timed out/)
  assert.equal(clock.time, 70000)
})

test('idle wait fails one full soft window after the first delayed completion if the bridge is still alive', async () => {
  const { clock, options } = idleClock(({ time }) => idleObservation({ speedCompletedAt: time >= 72000 ? NEXT_SPEED_COMPLETION : '' }))
  await assert.rejects(waitForBridgeIdle(options), /timed out/)
  assert.equal(clock.time, 142000)
})

test('idle wait without a first completion may pass the soft deadline but cannot pass its 150-second hard limit', async () => {
  const { clock, options } = idleClock(() => idleObservation())
  await assert.rejects(waitForBridgeIdle(options), /timed out/)
  assert.equal(clock.time, 150000)
})

test('idle wait fails at 150 seconds despite continuous activity that keeps extending its soft deadline', async () => {
  const { clock, options } = idleClock(({ time }) => idleObservation({
    witnessForwarded: Math.floor(time / 1000), bridgeGenerationCount: 1 + Math.floor(time / 10000), speedCompletedAt: FIRST_SPEED_COMPLETION,
  }))
  await assert.rejects(waitForBridgeIdle(options), /timed out/)
  assert.equal(clock.time, 150000)
})

test('idle wait cannot turn release observed exactly at the 150-second hard boundary into PASS', async () => {
  const { clock, options } = idleClock(({ time }) => idleObservation({ released: time >= 150000, witnessForwarded: Math.floor(time / 1000) }))
  await assert.rejects(waitForBridgeIdle(options), /timed out/)
  assert.equal(clock.time, 150000)
})

test('idle wait rechecks elapsed time after slow inspect and rejects an apparent release that crossed the hard limit', async () => {
  const { clock, options } = idleClock((fake) => {
    fake.advance(150001)
    return idleObservation({ released: true })
  })
  await assert.rejects(waitForBridgeIdle(options), /timed out/)
  assert.equal(clock.calls, 1)
})

test('idle wait cancellation before inspection fails without inspecting or declaring release', async () => {
  const controller = new AbortController(); controller.abort()
  const { clock, options } = idleClock(() => idleObservation({ released: true }), { signal: controller.signal })
  await assert.rejects(waitForBridgeIdle(options), /interrupted/)
  assert.equal(clock.calls, 0)
})

test('idle wait cancellation during inspect cannot be overridden by a simultaneously returned released=true', async () => {
  const controller = new AbortController()
  const { clock, options } = idleClock(() => {
    controller.abort()
    return idleObservation({ released: true })
  }, { signal: controller.signal })
  await assert.rejects(waitForBridgeIdle(options), /interrupted/)
  assert.equal(clock.calls, 1)
})

test('idle wait cancellation during pause prevents another inspection and never becomes PASS', async () => {
  const controller = new AbortController()
  const { clock, options } = idleClock(() => idleObservation(), { signal: controller.signal })
  options.pause = async (ms) => { clock.advance(ms); controller.abort() }
  await assert.rejects(waitForBridgeIdle(options), /interrupted/)
  assert.equal(clock.calls, 1)
})

test('idle wait propagates inspection errors rather than treating an unknown process/port state as released', async () => {
  const expected = new Error('Owned bridge inspection failed')
  const { clock, options } = idleClock(() => { throw expected })
  await assert.rejects(waitForBridgeIdle(options), (error) => error === expected)
  assert.equal(clock.calls, 1)
})

test('idle wait rejects missing/illegal snapshot fields even when the snapshot claims released=true', async () => {
  const invalid = [undefined, null, [], true, '', {},
    idleObservation({ released: undefined }), idleObservation({ released: 'true' }), idleObservation({ released: 1 }),
    idleObservation({ released: true, witnessForwarded: undefined }), idleObservation({ released: true, bridgeGenerationCount: undefined }),
    idleObservation({ released: true, speedCompletedAt: undefined }), idleObservation({ released: true, speedCompletedAt: null }),
    idleObservation({ released: true, speedCompletedAt: 123 }),
  ]
  for (const key of ['witnessForwarded', 'bridgeGenerationCount']) {
    for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1']) invalid.push(idleObservation({ released: true, [key]: value }))
  }
  for (const value of invalid) {
    const { options } = idleClock(() => value)
    await assert.rejects(waitForBridgeIdle(options), /Invalid idle bridge observation/)
  }
})

test('idle wait rejects count regressions and clearing an already observed completion, even on a release snapshot', async () => {
  const original = idleObservation({ witnessForwarded: 10, bridgeGenerationCount: 3, speedCompletedAt: FIRST_SPEED_COMPLETION })
  for (const changes of [{ witnessForwarded: 9 }, { bridgeGenerationCount: 2 }, { speedCompletedAt: '' }]) {
    const { options } = idleClock(({ calls }) => calls === 1 ? original : { ...original, ...changes, released: true })
    await assert.rejects(waitForBridgeIdle(options), /moved backwards/)
  }
})

test('idle wait rejects non-finite monotonic clocks and backwards time rather than granting more time', async () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const { options } = idleClock(() => idleObservation({ released: true }), { now: () => value })
    await assert.rejects(waitForBridgeIdle(options), /monotonic/)
  }
  const { clock, options } = idleClock((fake) => {
    fake.set(999)
    return idleObservation({ released: true })
  })
  clock.set(1000)
  await assert.rejects(waitForBridgeIdle(options), /monotonic/)
})

test('idle wait does not pass while either process or listener remains and honors injected small timing parameters', async () => {
  for (const held of ['pid', 'port']) {
    const { clock, options } = idleClock(() => {
      const pidExited = held !== 'pid'
      const portReleased = held !== 'port'
      return idleObservation({ released: pidExited && portReleased, speedCompletedAt: FIRST_SPEED_COMPLETION })
    }, { windowMs: 70, hardTimeoutMs: 150, pollMs: 10 })
    await assert.rejects(waitForBridgeIdle(options), /timed out/)
    assert.equal(clock.time, 70)
  }
  const { options } = idleClock(({ time }) => idleObservation({ released: time >= 50 }), { windowMs: 70, hardTimeoutMs: 150, pollMs: 10 })
  assertIdleReport(await waitForBridgeIdle(options), 50, { windowMs: 70, hardTimeoutMs: 150 })
})

test('SQLite completion parser accepts exactly one row with an empty or valid RFC3339 completion token and preserves it', () => {
  const values = ['',
    '2026-09-07T01:23:45Z', '2026-09-07T09:23:45+08:00', '2026-09-06T21:23:45-04:00',
    '2026-09-07T01:23:45.1Z', '2026-09-07T01:23:45.123456789+00:00', '2024-02-29T23:59:59.999Z',
  ]
  for (const value of values) assert.equal(parseQASpeedCompletion(`${JSON.stringify([{ lastTestedAt: value }])}\n`), value)
})

test('SQLite completion parser rejects empty, missing, multi-row, non-object and non-string results', () => {
  for (const text of ['', '  \n\t', '[]', '{}', 'null', 'false', '42', '"text"', '[null]', '[42]', '[[]]', '[{}]',
    '[{"last_tested_at":""}]', '[{"lastTestedAt":null}]', '[{"lastTestedAt":1}]', '[{"lastTestedAt":false}]',
    '[{"lastTestedAt":[]}]', '[{"lastTestedAt":{}}]', '[{"lastTestedAt":""},{"lastTestedAt":""}]',
    '[{"lastTestedAt":""}]\n[{"lastTestedAt":""}]', '[{', 'not-json',
  ]) assert.throws(() => parseQASpeedCompletion(text), /background speed completion/)
})

test('SQLite completion parser rejects invalid RFC3339 values, including calendar overflow and absent time zones', () => {
  for (const value of [' ', 'not-a-date', '2026-09-07', '2026-09-07T01:23:45', '2026-09-07 01:23:45Z',
    'Mon, 07 Sep 2026 01:23:45 GMT', '2026-09-07T01:23:45Z trailing', ' 2026-09-07T01:23:45Z',
    '2026-02-29T00:00:00Z', '2026-02-30T00:00:00Z', '2026-04-31T00:00:00Z',
    '2026-13-01T00:00:00Z', '2026-00-01T00:00:00Z', '2026-09-00T00:00:00Z',
    '2026-09-07T24:00:00Z', '2026-09-07T25:00:00Z', '2026-09-07T00:60:00Z', '2026-09-07T00:00:61Z',
    '2026-09-07T01:23:45+24:00', '2026-09-07T01:23:45+08:60',
  ]) assert.throws(() => parseQASpeedCompletion(JSON.stringify([{ lastTestedAt: value }])), /background speed completion/, `must reject ${value}`)
})

// Independent Mihomo coverage. Only literal process/socket snapshots, fake clocks
// and new private test directories are used; no real kernel or app is started.
const QA_STATE = '/private/tmp/latitude-native-qa-proxy-fixture/Library/Application Support/latitude-browser'
const BRIDGE_KEY = 'a1'.repeat(32)
const MIHOMO = '/Applications/Latitude Browser.app/Contents/MacOS/bin/mihomo'
const XRAY = '/Applications/Latitude Browser.app/Contents/MacOS/bin/xray'
const SING_BOX = '/Applications/Latitude Browser.app/Contents/MacOS/bin/sing-box'
function bridgeCommand(connector, stateRoot = QA_STATE, key = BRIDGE_KEY) {
  const workdir = join(stateRoot, 'data', connector === 'mihomo' ? '_mihomo' : '_xray', key)
  return connector === 'mihomo' ? `${MIHOMO} -f ${workdir}/mihomo-config.yaml -d ${workdir}` : `${XRAY} run -c ${workdir}/xray-config.json`
}
function bridgeTree(connector = 'mihomo') {
  const app = { pid: 65150, parentPID: 65000, uid: process.getuid(), started: STARTED, command: NATIVE_EXECUTABLE }
  const bridge = { pid: 65151, parentPID: app.pid, uid: app.uid, started: STARTED, command: bridgeCommand(connector) }
  const context = { connector, stateRoot: QA_STATE, appPID: app.pid, appStarted: app.started, uid: app.uid }
  return { app, bridge, context }
}
const MIHOMO_YAML = 'allow-lan: false\nexternal-controller: 127.0.0.1:43102\nmixed-port: 43101\nmode: rule\n'
async function mihomoConfigFixture(t) {
  const qaHome = await privateRoot(t)
  const stateRoot = join(qaHome, 'Library/Application Support/latitude-browser')
  const command = bridgeCommand('mihomo', stateRoot)
  const { workdir, configPath } = managedBridgeCommand(command, 'mihomo', stateRoot)
  await ensurePrivateDirectory(qaHome, workdir)
  await writeFile(configPath, MIHOMO_YAML, { mode: 0o644 })
  return { qaHome, stateRoot, command, workdir, configPath }
}
function socketSnapshot({ pid = 65151, protocol = 'TCP', host = '127.0.0.1', port = 43101, state = 'LISTEN' } = {}) {
  return { pid, protocol, host, port, state: protocol === 'TCP' ? state : null }
}
function releaseObservation(changes = {}) { return { appAlive: true, generationExited: false, portsReleased: false, ...changes } }

 test('connector descriptors are closed, frozen and keep Xray plus sing-box as the default requirement', () => {
  assert.equal(connectorStack().connector, 'xray')
  assert.equal(connectorStack().executable, XRAY)
  assert.deepEqual(connectorStack().requiredExecutables, [XRAY, SING_BOX])
  assert.deepEqual(connectorStack('mihomo'), { connector: 'mihomo', executable: MIHOMO, directory: '_mihomo', configName: 'mihomo-config.yaml', chromeScheme: 'http', release: 'idle', requiredExecutables: [MIHOMO] })
  assert.equal(connectorStack('xray').chromeScheme, 'socks5')
  assert.equal(connectorStack('xray').release, 'idle')
  for (const name of ['xray', 'mihomo']) {
    assert.ok(Object.isFrozen(connectorStack(name)))
    assert.ok(Object.isFrozen(connectorStack(name).requiredExecutables))
    assert.throws(() => { connectorStack(name).executable = '/tmp/arbitrary-core' }, TypeError)
    assert.throws(() => { connectorStack(name).requiredExecutables.push('/tmp/arbitrary-core') }, TypeError)
  }
  for (const name of ['sing-box', 'Mihomo', 'mihomo ', '', 'constructor', '__proto__', '/tmp/mihomo', null, {}, 1]) assert.throws(() => connectorStack(name), /exactly xray or mihomo/)
})

test('CLI accepts only explicit run and a closed connector, preserving Xray background overlap', () => {
  assert.deepEqual(parseNativeProxyCLI([]), { mode: 'help' })
  assert.deepEqual(parseNativeProxyCLI(['--run']), { mode: 'run', connector: 'xray', backgroundOverlap: false })
  assert.deepEqual(parseNativeProxyCLI(['--run', '--connector', 'mihomo']), { mode: 'run', connector: 'mihomo', backgroundOverlap: false })
  for (const args of [['--run', '--background-overlap'], ['--run', '--connector', 'xray', '--background-overlap'], ['--run', '--background-overlap', '--connector', 'xray']]) assert.deepEqual(parseNativeProxyCLI(args), { mode: 'run', connector: 'xray', backgroundOverlap: true })
  assert.deepEqual(nativeProxyOptions(), { connector: 'xray', backgroundOverlap: false })
  assert.throws(() => nativeProxyOptions({ connector: 'mihomo', backgroundOverlap: true }), /Xray-only/)
  assert.throws(() => nativeProxyOptions({ backgroundOverlap: 'false' }), /Invalid background/)
})

test('CLI rejects Mihomo overlap, ambiguous flags and binary/path/hash overrides before any native setup', async (t) => {
  const argsList = [
    ['--run', '--connector', 'mihomo', '--background-overlap'], ['--run', '--background-overlap', '--connector', 'mihomo'],
    ['--connector', 'mihomo', '--run'], ['--run', '--connector'], ['--run', '--connector', ''], ['--run', '--connector', 'Mihomo'],
    ['--run', '--connector=mihomo'], ['--run', '--connector', 'mihomo', '--connector', 'xray'], ['--run', '--background-overlap', '--background-overlap'],
    ['--run', '--connector', 'mihomo', '--binary', '/tmp/mihomo'], ['--run', '--connector', 'mihomo', '--path', '/tmp/mihomo'],
    ['--run', '--connector', 'mihomo', '--expectedHash', 'a'.repeat(64)], ['--run', '--run'], ['--help', '--run'],
  ]
  for (const args of argsList) assert.throws(() => parseNativeProxyCLI(args))
  const home = await privateRoot(t)
  // Execute only two invalid forms. No valid --run is executed by this suite.
  for (const args of [argsList[0], argsList[9]]) {
    await assert.rejects(exec(process.execPath, [runner, ...args], { env: { HOME: home } }), (error) => {
      assert.equal(error.code, 2)
      assert.doesNotMatch(error.stdout, /PASS /)
      return true
    })
  }
  assert.deepEqual(await readdir(home), [])
})

test('managed core commands require the exact bundled binary, hash directory and complete argument list', () => {
  for (const name of ['xray', 'mihomo']) {
    const command = bridgeCommand(name)
    const parsed = managedBridgeCommand(command, name, QA_STATE)
    assert.equal(parsed.key, BRIDGE_KEY)
    assert.equal(parsed.configPath, join(parsed.workdir, connectorStack(name).configName))
    const wrong = [command + ' --extra', command + ' ', ' ' + command,
      command.replace(connectorStack(name).executable, '/usr/local/bin/mihomo'),
      command.replaceAll(BRIDGE_KEY, 'a'.repeat(63)), command.replaceAll(BRIDGE_KEY, BRIDGE_KEY.toUpperCase()),
      command.replaceAll(QA_STATE, `${QA_STATE}-other`), command.replaceAll('/data/', '/data/../data/'),
      command.replace(connectorStack(name).configName, 'other-config.yaml'), command.replace(connectorStack(name).executable, connectorStack(name).executable + '-other'),
    ]
    if (name === 'mihomo') wrong.push(command.replace(/ -d .+$/, ''), command.replace(/ -d .+$/, ' -d /tmp/other'), command + ' -d /tmp/other')
    for (const value of wrong) assert.equal(managedBridgeCommand(value, name, QA_STATE), null, value)
    assert.equal(managedBridgeCommand(command, name === 'mihomo' ? 'xray' : 'mihomo', QA_STATE), null)
  }
  for (const root of ['relative', QA_STATE + '/../latitude-browser', QA_STATE + '\n', QA_STATE + '\0']) assert.throws(() => managedBridgeCommand('', 'mihomo', root), /canonical QA/)
})

test('bridge ledger needs the live authenticated app generation and exact child UID/PPID/start/command', () => {
  for (const connector of ['mihomo', 'xray']) {
    const { app, bridge, context } = bridgeTree(connector)
    const ledger = new Map()
    registerOwnedBridges([app, bridge], ledger, context)
    assert.deepEqual(ledger.get(bridge.pid), bridge)
    assert.ok(Object.isFrozen(ledger.get(bridge.pid)))
    const captured = ledger.get(bridge.pid)
    bridge.command += ' --mutated-input'
    assert.notEqual(captured.command, bridge.command, 'Input mutation cannot rewrite a recorded command')
  }
  const { app, bridge, context } = bridgeTree()
  for (const changed of [{ uid: app.uid + 1 }, { pid: app.pid + 10 }, { started: STARTED + ' reused' }, { command: '/tmp/latitude-browser' }, { command: NATIVE_EXECUTABLE + ' --other-home' }]) {
    const ledger = new Map(); registerOwnedBridges([{ ...app, ...changed }, bridge], ledger, context)
    assert.equal(ledger.size, 0)
  }
  for (const changed of [{ parentPID: 1 }, { parentPID: app.pid + 10 }, { uid: bridge.uid + 1 }, { started: '' }, { started: null }, { started: 'not a ps start time' }, { pid: 0 }, { pid: 1.5 }, { command: bridge.command + ' --other' }]) {
    const ledger = new Map(); registerOwnedBridges([app, { ...bridge, ...changed }], ledger, context)
    assert.equal(ledger.size, 0)
  }
  for (const rows of [[bridge], []]) {
    const ledger = new Map(); registerOwnedBridges(rows, ledger, context)
    assert.equal(ledger.size, 0, 'An orphan/bare API PID cannot establish new kernel kill authority')
  }
})

test('a reused app or bridge PID never overwrites the immutable bridge ledger or gains new authority', () => {
  const { app, bridge, context } = bridgeTree()
  const ledger = new Map(); registerOwnedBridges([app, bridge], ledger, context)
  const original = ledger.get(bridge.pid)
  const recycled = { ...bridge, started: 'Mon Sep 7 01:01:00 2026' }
  registerOwnedBridges([app, recycled], ledger, context)
  assert.equal(ledger.get(bridge.pid), original)
  assert.equal(ownedRuntimeMatches(recycled, original), false)
  registerOwnedBridges([{ ...app, started: recycled.started }, { ...bridge, pid: bridge.pid + 1 }], ledger, context)
  assert.equal(ledger.size, 1)
  registerOwnedBridges([app, { ...bridge, pid: bridge.pid + 2, command: bridgeCommand('xray') }], ledger, context)
  assert.equal(ledger.size, 1, 'A Mihomo ledger must not learn an Xray process')
})

test('executable re-verification permits only the selected bundled core or a matching canonical Chrome binary', () => {
  for (const connector of ['xray', 'mihomo']) {
    const { bridge } = bridgeTree(connector)
    assert.doesNotThrow(() => assertRuntimeExecutablePaths(bridge, [connectorStack(connector).executable], connector))
    for (const paths of [[], ['/usr/local/bin/mihomo'], [MIHOMO + '-other'], ['/tmp/mihomo'], [CHROME], [connectorStack(connector === 'mihomo' ? 'xray' : 'mihomo').executable]]) assert.throws(() => assertRuntimeExecutablePaths(bridge, paths, connector), /refusing to signal/)
    assert.throws(() => assertRuntimeExecutablePaths({ ...bridge, command: bridge.command.replace(connectorStack(connector).executable, '/tmp/mihomo') }, [connectorStack(connector).executable], connector), /refusing to signal/)
    for (const path of [CHROME, HELPER]) assert.doesNotThrow(() => assertRuntimeExecutablePaths({ command: `${path} --owned` }, [path], connector))
  }
})

test('kernel selection rejects another bundled kernel child without confusing a foreign parent process', () => {
  const { app, bridge } = bridgeTree()
  assert.doesNotThrow(() => assertSelectedKernelOnly([app, bridge], 'mihomo', app.pid))
  for (const path of [XRAY, SING_BOX]) {
    assert.throws(() => assertSelectedKernelOnly([{ ...bridge, command: `${path} run` }], 'mihomo', app.pid), /another kernel/)
    assert.doesNotThrow(() => assertSelectedKernelOnly([{ ...bridge, parentPID: app.pid + 1, command: `${path} run` }], 'mihomo', app.pid))
  }
  assert.throws(() => assertSelectedKernelOnly([bridge], 'xray', app.pid), /another kernel/)
})

test('Chrome proxy scheme is stack-specific and cannot be the raw authenticated fixture port', () => {
  for (const [connector, scheme] of [['xray', 'socks5'], ['mihomo', 'http']]) {
    const correct = `--proxy-server=${scheme}://127.0.0.1:43101`
    assert.equal(managedChromeProxyPort(['--no-first-run', correct, 'about:blank'], connector, 43000), 43101)
    assert.equal(managedChromeProxyPort(`${CHROME} ${correct} --user-data-dir=/private/QA/profile`.split(/\s+/), connector, 43000), 43101)
    assert.throws(() => managedChromeProxyPort([correct], connector, 43101), /bypassed/)
    for (const args of [[], [correct, correct], ['--proxy-server', `${scheme}://127.0.0.1:43101`], [`--proxy-server=${scheme === 'http' ? 'socks5' : 'http'}://127.0.0.1:43101`],
      [correct, '--no-proxy-server'], [correct, '--proxy-pac-url=http://example.invalid'], [correct, '--proxy-auto-detect'], [correct, '--ignore-certificate-errors'], [correct, '--no-sandbox'],
      [`--proxy-server=${scheme}://user:pass@127.0.0.1:43101`], [`--proxy-server=${scheme}://localhost:43101`], [`--proxy-server=${scheme}://0.0.0.0:43101`],
      [`${correct}/`], [`${correct}?extra=1`], [`${correct};direct://`], [correct.replace('43101', '0')], [correct.replace('43101', '65536')], [correct.replace('43101', '043101')],
    ]) assert.throws(() => managedChromeProxyPort(args, connector, 43000))
  }
})

test('Mihomo restart requires a fresh generation and a command/UID change is not an exited PID', () => {
  const { bridge } = bridgeTree()
  const next = { ...bridge, pid: bridge.pid + 1 }
  assert.doesNotThrow(() => assertNewMihomoGeneration(bridge, next))
  for (const value of [bridge, { ...bridge, started: 'Mon Sep 7 01:01:00 2026' }, { ...next, started: '' }, { ...next, pid: 0 }, { ...next, pid: '65199' }, null]) assert.throws(() => assertNewMihomoGeneration(bridge, value), /fresh owned generation/)
  assert.equal(mihomoGenerationExited([], bridge), true)
  assert.equal(mihomoGenerationExited([next], bridge), true)
  for (const row of [bridge, { ...bridge, command: '/tmp/other' }, { ...bridge, uid: bridge.uid + 1 }, { ...bridge, started: 'Mon Sep 7 01:01:00 2026' }]) assert.equal(mihomoGenerationExited([row], bridge), false)
})

test('Mihomo YAML parsing yields only the two distinct local ports, never fixture credentials', () => {
  for (const controller of ['127.0.0.1:43102', "'127.0.0.1:43102'", '"127.0.0.1:43102"']) {
    const text = MIHOMO_YAML.replace('127.0.0.1:43102', controller) + 'proxies:\n  - name: node\n    password: offline-only-fake-password\n    port: 43000\n'
    const result = parseMihomoBridgePorts(text)
    assert.deepEqual(result, { mixedPort: 43101, controllerPort: 43102 })
    assert.ok(Object.isFrozen(result))
    assert.doesNotMatch(JSON.stringify(result), /password|node|43000/)
  }
})

test('Mihomo YAML parsing rejects ambiguity, extra documents, LAN bindings and malformed ports', () => {
  const invalid = ['', MIHOMO_YAML.replace('allow-lan: false\n', ''), MIHOMO_YAML.replace('allow-lan: false', 'allow-lan: true'),
    MIHOMO_YAML.replace('127.0.0.1:43102', '0.0.0.0:43102'), MIHOMO_YAML.replace('127.0.0.1:43102', 'localhost:43102'),
    MIHOMO_YAML.replace('127.0.0.1:43102', "'127.0.0.1:43102\""), MIHOMO_YAML.replace('43102', '43101'),
    MIHOMO_YAML + 'mixed-port: 43103\n', MIHOMO_YAML + 'mixed-port : 43103\n', MIHOMO_YAML + 'external-controller: 127.0.0.1:43103\n', MIHOMO_YAML + 'allow-lan: true\n',
    MIHOMO_YAML + '"mixed-port": 43103\n', MIHOMO_YAML + "'external-controller': 0.0.0.0:43103\n", MIHOMO_YAML + '<<: *other\n',
    '---\n' + MIHOMO_YAML, MIHOMO_YAML + '---\n' + MIHOMO_YAML, MIHOMO_YAML + '...\n', MIHOMO_YAML + '\0', MIHOMO_YAML + '#'.repeat(65536),
  ]
  for (const port of ['0', '-1', '65536', '1.5', 'true', '"43101"', '043101', '*port', '43101 # comment', '1'.repeat(100)]) invalid.push(MIHOMO_YAML.replace('mixed-port: 43101', `mixed-port: ${port}`))
  for (const text of invalid) assert.throws(() => parseMihomoBridgePorts(text), /Mihomo QA/)
})

test('Mihomo config reads only its fixed owned canonical QA file, with a bounded private-root read', async (t) => {
  const { qaHome, command, configPath } = await mihomoConfigFixture(t)
  assert.deepEqual(await readMihomoBridgePorts(qaHome, command), { mixedPort: 43101, controllerPort: 43102 })
  await writeFile(configPath, MIHOMO_YAML + '#'.repeat(65536))
  await assert.rejects(readMihomoBridgePorts(qaHome, command), /bounded regular file/)
})

test('Mihomo config reader refuses foreign path commands and symlink leaf, intermediate and QA roots', async (t) => {
  const fixture = await mihomoConfigFixture(t)
  const other = await mihomoConfigFixture(t)
  await assert.rejects(readMihomoBridgePorts(fixture.qaHome, other.command), /private owned QA HOME/)
  await assert.rejects(readMihomoBridgePorts(fixture.qaHome, fixture.command + ' --other'), /private owned QA HOME/)
  await rm(fixture.configPath)
  await symlink(other.configPath, fixture.configPath)
  await assert.rejects(readMihomoBridgePorts(fixture.qaHome, fixture.command), /symlink/)
  await rm(fixture.workdir, { recursive: true })
  await symlink(other.workdir, fixture.workdir)
  await assert.rejects(readMihomoBridgePorts(fixture.qaHome, fixture.command), /symlink/)
  const root = await privateRoot(t), linkedHome = join(root, 'home')
  await symlink(other.qaHome, linkedHome)
  await assert.rejects(readMihomoBridgePorts(linkedHome, bridgeCommand('mihomo', join(linkedHome, 'Library/Application Support/latitude-browser'))), /private owned QA HOME/)
  assert.equal(await readFile(other.configPath, 'utf8'), MIHOMO_YAML, 'No symlink target was modified')
})

test('Mihomo config reader rejects group-writable files, directories, public HOME and non-files', async (t) => {
  const { qaHome, command, workdir, configPath } = await mihomoConfigFixture(t)
  await chmod(configPath, 0o666)
  await assert.rejects(readMihomoBridgePorts(qaHome, command), /writable redirection/)
  await chmod(configPath, 0o600)
  await chmod(workdir, 0o777)
  await assert.rejects(readMihomoBridgePorts(qaHome, command), /writable redirection/)
  await chmod(workdir, 0o700)
  await chmod(qaHome, 0o755)
  await assert.rejects(readMihomoBridgePorts(qaHome, command), /private owned QA HOME/)
  await chmod(qaHome, 0o700)
  await rm(configPath)
  await mkdir(configPath)
  await assert.rejects(readMihomoBridgePorts(qaHome, command), /bounded regular file/)
})

test('socket parser reads numeric TCP and UDP field records and keeps local rather than remote ports', () => {
  const text = 'p65151\nf8\nPTCP\nn127.0.0.1:43101\nTST=LISTEN\nf9u\nPTCP\nn[::1]:43102\nTST=LISTEN\nf10\nPUDP\nn127.0.0.1:43101\nf11\nPTCP\nn127.0.0.1:45000->127.0.0.1:43101\nTST=ESTABLISHED\np65152\nf12\nPUDP\nn*:45100\n'
  const sockets = parseInternetSockets(text)
  assert.deepEqual(sockets, [socketSnapshot(), socketSnapshot({ host: '::1', port: 43102 }), socketSnapshot({ protocol: 'UDP' }), socketSnapshot({ port: 45000, state: 'ESTABLISHED' }), socketSnapshot({ pid: 65152, protocol: 'UDP', host: '*', port: 45100 })])
  assert.equal(mihomoPortsReleased(sockets.slice(3), [43101, 43102]), true)
  assert.equal(mihomoPortsReleased(sockets, [43101, 43102]), false)
  assert.deepEqual(parseInternetSockets(''), [])
})

test('socket parser never turns truncated, missing-owner, missing-protocol or malformed inspection into an empty release', () => {
  const valid = 'p65151\nf8\nPTCP\nn127.0.0.1:43101\nTST=LISTEN\n'
  for (const text of ['p65151\n', 'p65151\np65152\n', valid + 'p65152\n', valid.trimEnd(), valid + 'f9\n',
    valid.replace('p65151\n', ''), valid.replace('p65151', 'p0'), valid.replace('p65151', 'p999999999999999999'), valid.replace('f8', 'fnot-a-fd'),
    valid.replace('PTCP\n', ''), valid.replace('PTCP', 'POTHER'), valid.replace('PTCP', 'PTCP\nPUDP'), valid.replace('TST=LISTEN\n', ''),
    valid.replace('TST=LISTEN', 'TST='), valid.replace('TST=LISTEN', 'TST=LISTEN\nTST=LISTEN'), valid.replace('n127.0.0.1:43101', 'nlocalhost:43101'),
    valid.replace('n127.0.0.1:43101', 'n127.0.0.1:65536'), valid.replace('n127.0.0.1:43101', 'nbad:43101'), valid + 'unexpected\n', 'x'.repeat(131073),
  ]) assert.throws(() => parseInternetSockets(text))
})

test('Mihomo start requires both TCP loopback listeners, their common PID and no foreign or wildcard sockets', () => {
  const ports = { mixedPort: 43101, controllerPort: 43102 }, identity = { pid: 65151 }
  const listeners = [socketSnapshot(), socketSnapshot({ port: 43102 })]
  assert.doesNotThrow(() => assertMihomoListeners([...listeners, socketSnapshot({ protocol: 'UDP' })], identity, ports))
  for (const sockets of [[], listeners.slice(0, 1), listeners.slice(1), [listeners[0], { ...listeners[1], pid: 65152 }],
    [listeners[0], { ...listeners[1], host: '*' }], [listeners[0], { ...listeners[1], host: '0.0.0.0' }],
    [listeners[0], { ...listeners[1], state: 'ESTABLISHED' }], [listeners[0], { ...listeners[1], protocol: 'UDP', state: null }],
    [...listeners, socketSnapshot({ protocol: 'UDP', pid: 65152 })], [...listeners, socketSnapshot({ protocol: 'UDP', host: '*' })],
  ]) assert.throws(() => assertMihomoListeners(sockets, identity, ports))
  assert.throws(() => assertMihomoListeners(listeners, identity, { ...ports, controllerPort: ports.mixedPort }))
})

test('Mihomo release fails on UDP-only, accepted TCP or controller-only residue, even without TCP LISTEN', () => {
  for (const socket of [socketSnapshot({ protocol: 'UDP' }), socketSnapshot({ protocol: 'UDP', port: 43102 }), socketSnapshot({ state: 'CLOSE_WAIT' }), socketSnapshot({ port: 43102, state: 'ESTABLISHED' }), socketSnapshot({ pid: 9999 })]) assert.equal(mihomoPortsReleased([socket], [43101, 43102]), false)
  assert.equal(mihomoPortsReleased([], [43101, 43102]), true)
  assert.equal(mihomoPortsReleased([socketSnapshot({ port: 45000 })], [43101, 43102]), true)
  assert.equal(mihomoPortsReleased([socketSnapshot({ protocol: 'UDP', port: 45000 })], [43101, 43102, 45000]), false, 'Observed kernel UDP ports remain part of the release proof')
  for (const ports of [[], [0], [-1], [65536], ['43101'], new Set([43101]), Array(129).fill(43101)]) assert.throws(() => mihomoPortsReleased([], ports), /Invalid observed/)
  for (const sockets of [null, {}, [socketSnapshot({ pid: 0 })], [socketSnapshot({ port: NaN })], [socketSnapshot({ protocol: 'unknown' })], [socketSnapshot({ state: '' })]]) assert.throws(() => mihomoPortsReleased(sockets, [43101]), /Invalid socket/)
})

test('Mihomo release waits for both process and all sockets while the app remains alive, without an idle extension', async () => {
  const { options, clock } = idleClock(({ time }) => releaseObservation({ generationExited: time >= 200, portsReleased: time >= 400 }))
  const result = await waitForMihomoRelease(options)
  assert.deepEqual(result, { elapsedMs: 400, timeoutMs: 150000, appAliveDuringRelease: true, bridgePIDExited: true, TCPAndUDPPortsReleased: true, harnessSignalUsed: false })
  assert.equal(clock.time, 400)
  for (const held of ['generationExited', 'portsReleased']) {
    const fixture = idleClock(() => releaseObservation({ generationExited: true, portsReleased: true, [held]: false }), { timeoutMs: 500, pollMs: 100 })
    await assert.rejects(waitForMihomoRelease(fixture.options), /timed out/)
    assert.equal(fixture.clock.time, 500)
  }
})

test('Mihomo app shutdown, missing strict booleans and inspection failures can never count as product release', async () => {
  const allReleased = releaseObservation({ generationExited: true, portsReleased: true })
  await assert.rejects(waitForMihomoRelease(idleClock(() => ({ ...allReleased, appAlive: false })).options), /shutdown is not/)
  const invalid = [null, {}, [], true]
  for (const key of ['appAlive', 'generationExited', 'portsReleased']) for (const value of [undefined, null, 'true', 1]) invalid.push({ ...allReleased, [key]: value })
  for (const state of invalid) await assert.rejects(waitForMihomoRelease(idleClock(() => state).options), /Invalid Mihomo release observation/)
  const error = new Error('Unknown lsof ownership')
  await assert.rejects(waitForMihomoRelease(idleClock(() => { throw error }).options), (result) => result === error)
})

test('Mihomo release honors its hard monotonic bound before and after inspection', async () => {
  const atBoundary = idleClock(({ time }) => releaseObservation({ generationExited: time >= 500, portsReleased: true }), { timeoutMs: 500, pollMs: 100 })
  await assert.rejects(waitForMihomoRelease(atBoundary.options), /timed out/)
  assert.equal(atBoundary.clock.time, 500)
  const slow = idleClock((clock) => { clock.advance(150001); return releaseObservation({ generationExited: true, portsReleased: true }) })
  await assert.rejects(waitForMihomoRelease(slow.options), /timed out/)
  for (const value of [NaN, Infinity, -Infinity]) await assert.rejects(waitForMihomoRelease(idleClock(() => releaseObservation(), { now: () => value }).options), /monotonic/)
  const backwards = idleClock((clock) => { clock.set(999); return releaseObservation({ generationExited: true, portsReleased: true }) })
  backwards.clock.set(1000)
  await assert.rejects(waitForMihomoRelease(backwards.options), /monotonic/)
  for (const timing of [{ timeoutMs: 0 }, { pollMs: 0 }, { timeoutMs: Infinity }, { pollMs: -1 }]) await assert.rejects(waitForMihomoRelease(idleClock(() => releaseObservation(), timing).options), /Invalid Mihomo release observer/)
})

test('Mihomo release cancellation before/during inspection or pause remains failure even alongside an apparent release', async () => {
  const complete = releaseObservation({ generationExited: true, portsReleased: true })
  const before = new AbortController(); before.abort()
  const first = idleClock(() => complete, { signal: before.signal })
  await assert.rejects(waitForMihomoRelease(first.options), /interrupted/)
  assert.equal(first.clock.calls, 0)
  const during = new AbortController()
  const second = idleClock(() => { during.abort(); return complete }, { signal: during.signal })
  await assert.rejects(waitForMihomoRelease(second.options), /interrupted/)
  assert.equal(second.clock.calls, 1)
  const paused = new AbortController()
  const third = idleClock(() => releaseObservation(), { signal: paused.signal })
  third.options.pause = async (ms) => { third.clock.advance(ms); paused.abort() }
  await assert.rejects(waitForMihomoRelease(third.options), /interrupted/)
  assert.equal(third.clock.calls, 1)
})
