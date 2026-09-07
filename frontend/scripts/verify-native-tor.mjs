#!/usr/bin/env node

/**
 * Native Tor transport QA for Latitude Browser.
 *
 * This script is intentionally separate from verify-workspace.mjs. It talks to
 * the local LaunchServer started by the QA operator and uses only profiles it
 * creates in the isolated QA state. It is not a production-data test, and it
 * does not claim anonymity or absence of network leaks.
 *
 * The app must be started by the operator, for example:
 *
 *   HOME=/tmp/latitude-native-qa-home \
 *   '/Applications/Latitude Browser.app/Contents/MacOS/latitude-browser'
 *
 * Then run this script with the configured local API key:
 *
 *   HOME=/tmp/latitude-native-qa-home \
 *   LATITUDE_NATIVE_QA_BASE_URL=http://127.0.0.1:19878 \
 *   LATITUDE_NATIVE_QA_API_KEY=latitude-native-qa-only \
 *   node frontend/scripts/verify-native-tor.mjs
 *
 * The script uses Node 22's built-in fetch and WebSocket APIs. It does not
 * require Playwright or any additional package.
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..', '..')

const DEFAULT_BASE_URL = 'http://127.0.0.1:19878'
// Legacy compatibility header retained by the local LaunchServer.
const DEFAULT_API_KEY_HEADER = 'X-Ant-Api-Key'
const DEFAULT_QA_HOME = '/tmp/latitude-native-qa-home'
const DEFAULT_TOR_BINARY = '/tmp/latitude-tor-evaluation/expert/tor/tor'
const DEFAULT_CORE_ID = 'qa-google-chrome'
const CANONICAL_NATIVE_EXECUTABLE = '/Applications/Latitude Browser.app/Contents/MacOS/latitude-browser'
const CHECK_TOR_URL = 'https://check.torproject.org/api/ip'
const PROFILE_TIMEOUT_MS = 120_000
const WAIT_TIMEOUT_MS = 20_000
const API_FETCH_TIMEOUT_MS = 20_000
const RUNTIME_FETCH_TIMEOUT_MS = PROFILE_TIMEOUT_MS + 30_000
const CDP_FETCH_TIMEOUT_MS = 15_000
const TOR_NAVIGATION_TIMEOUT_MS = 60_000

function parseArgs(argv) {
  const options = {
    baseURL: process.env.LATITUDE_NATIVE_QA_BASE_URL || process.env.BASE_URL || DEFAULT_BASE_URL,
    apiKey: process.env.LATITUDE_NATIVE_QA_API_KEY || '',
    apiHeader: process.env.LATITUDE_NATIVE_QA_API_HEADER || DEFAULT_API_KEY_HEADER,
    outputDir: process.env.LATITUDE_NATIVE_QA_OUTPUT || '',
    qaHome: process.env.HOME || DEFAULT_QA_HOME,
    torBinary: process.env.LATITUDE_NATIVE_QA_TOR_BINARY || DEFAULT_TOR_BINARY,
    coreId: process.env.LATITUDE_NATIVE_QA_CORE_ID || DEFAULT_CORE_ID,
    skipTorKill: process.env.LATITUDE_NATIVE_QA_SKIP_TOR_KILL === '1',
    nativePid: Number(process.env.LATITUDE_NATIVE_QA_NATIVE_PID || 0),
  }

  for (const arg of argv) {
    if (arg === '--skip-tor-kill') options.skipTorKill = true
    else if (arg.startsWith('--base-url=')) options.baseURL = arg.slice('--base-url='.length)
    else if (arg.startsWith('--api-key=')) options.apiKey = arg.slice('--api-key='.length)
    else if (arg.startsWith('--api-header=')) options.apiHeader = arg.slice('--api-header='.length)
    else if (arg.startsWith('--output=')) options.outputDir = arg.slice('--output='.length)
    else if (arg.startsWith('--home=')) options.qaHome = arg.slice('--home='.length)
    else if (arg.startsWith('--native-pid=')) options.nativePid = Number(arg.slice('--native-pid='.length))
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function printHelp() {
  console.log([
    'Usage: node frontend/scripts/verify-native-tor.mjs [options]',
    '',
    'Options:',
    `  --base-url=<url>       Local LaunchServer URL (default: ${DEFAULT_BASE_URL})`,
    '  --api-key=<key>        API key (or LATITUDE_NATIVE_QA_API_KEY)',
    `  --api-header=<name>    API auth header (default: ${DEFAULT_API_KEY_HEADER})`,
    '  --home=<dir>           Isolated QA HOME (must be /tmp/latitude-native-qa-*)',
    '  --output=<dir>         Evidence output directory',
    '  --native-pid=<pid>     Expected canonical app listener PID (or LATITUDE_NATIVE_QA_NATIVE_PID)',
    '  --skip-tor-kill        Skip the optional Tor failure-injection check',
  ].join('\n'))
}

function normalizeBaseURL(value) {
  const parsed = new URL(String(value || ''))
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported API URL protocol: ${parsed.protocol}`)
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error('Native QA API must use a loopback host; refusing remote or production data.')
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, '')
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

function normalizePath(value) {
  return resolve(String(value || ''))
}

function isPathInside(parent, child) {
  const parentAbs = normalizePath(parent)
  const childAbs = normalizePath(child)
  const rel = relative(parentAbs, childAbs)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${String.fromCharCode(47)}`) && !isAbsolute(rel))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function safeError(error, apiKey = '') {
  let message = error instanceof Error ? error.message : String(error)
  if (apiKey) message = message.split(apiKey).join('[redacted-api-key]')
  // Never carry an IP body or a full process command into the evidence JSON.
  message = message.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]')
  return message.slice(0, 500)
}

function profileFromResponse(payload) {
  return payload?.profile || payload || {}
}

function shortProfileEvidence(profile) {
  return {
    profileId: profile?.profileId || '',
    profileName: profile?.profileName || '',
    networkMode: profile?.networkMode || '',
    hasProxyId: Boolean(String(profile?.proxyId || '').trim()),
    hasProxyConfig: Boolean(String(profile?.proxyConfig || '').trim()),
    running: Boolean(profile?.running),
    debugReady: Boolean(profile?.debugReady),
    debugPort: Number(profile?.debugPort || 0),
    pidPresent: Number(profile?.pid || 0) > 0,
    lastErrorPresent: Boolean(String(profile?.lastError || '').trim()),
  }
}

async function sleep(milliseconds) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

async function waitFor(label, operation, { timeoutMs = WAIT_TIMEOUT_MS, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const value = await operation()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(intervalMs)
  }
  const suffix = lastError ? `: ${safeError(lastError)}` : ''
  throw new Error(`${label} timed out${suffix}`)
}

async function loadJSONResponse(response) {
  const text = await response.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { _nonJsonResponse: true }
  }
}

function combineAbortSignals(primary, secondary) {
  if (!primary) return secondary
  if (!secondary) return primary
  return AbortSignal.any([primary, secondary])
}

async function fetchWithTimeout(url, init = {}, timeoutMs = API_FETCH_TIMEOUT_MS) {
  const timeoutController = new AbortController()
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: combineAbortSignals(init.signal, timeoutController.signal),
    })
  } catch (error) {
    if (timeoutController.signal.aborted && !init.signal?.aborted) {
      throw new Error(`Fetch timed out after ${timeoutMs}ms.`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function createApiClient(baseURL, apiHeader, apiKey) {
  async function request(path, { method = 'GET', body, signal, timeoutMs = API_FETCH_TIMEOUT_MS } = {}) {
    const headers = { Accept: 'application/json' }
    if (apiKey) headers[apiHeader] = apiKey
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await fetchWithTimeout(`${baseURL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    }, timeoutMs)
    const data = await loadJSONResponse(response)
    return { status: response.status, ok: response.ok, data }
  }
  return { request }
}

function selectedAPIPort(baseURL) {
  const parsed = new URL(baseURL)
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
  assert(Number.isInteger(port) && port > 0 && port <= 65_535, 'Native QA API URL did not contain a valid port.')
  return port
}

async function listeningPIDs(port) {
  try {
    const { stdout } = await execFileAsync('/usr/sbin/lsof', [
      '-nP',
      `-iTCP:${port}`,
      '-sTCP:LISTEN',
      '-t',
    ], { maxBuffer: 256 * 1024 })
    return [...new Set(stdout.split(/\s+/).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0))]
  } catch (error) {
    if (error?.code === 1) return []
    throw new Error('Unable to inspect the selected API listener with lsof.')
  }
}

async function inspectNativeProcessPrivately(pid, qaHome) {
  let executableOutput = ''
  let environmentOutput = ''
  try {
    const executableResult = await execFileAsync('/usr/sbin/lsof', [
      '-nP',
      '-a',
      '-p', String(pid),
      '-d', 'txt',
      '-Fn',
    ], { maxBuffer: 512 * 1024 })
    executableOutput = executableResult.stdout
  } catch {
    // The caller receives only booleans; never return raw process inspection.
  }
  try {
    const environmentResult = await execFileAsync('/bin/ps', [
      'eww',
      '-p', String(pid),
      '-o', 'command=',
    ], { maxBuffer: 2 * 1024 * 1024 })
    environmentOutput = environmentResult.stdout
  } catch {
    // The caller receives only booleans; never return raw process inspection.
  }

  const executablePaths = executableOutput.split('\n')
    .filter((line) => line.startsWith('n'))
    .map((line) => line.slice(1))
  const homeValues = [...environmentOutput.matchAll(/(?:^|\s)HOME=([^\s]+)/g)].map((match) => match[1])
  return {
    executableMatches: executablePaths.includes(CANONICAL_NATIVE_EXECUTABLE),
    qaHomeMatches: homeValues.includes(qaHome),
  }
}

async function preflightNativeService(baseURL, qaHome, suppliedPID = 0) {
  assert(process.platform === 'darwin', 'Native process preflight is supported only on macOS.')
  if (suppliedPID !== 0) {
    assert(Number.isInteger(suppliedPID) && suppliedPID > 0, 'LATITUDE_NATIVE_QA_NATIVE_PID/--native-pid must be a positive integer.')
  }

  const port = selectedAPIPort(baseURL)
  const listenerPIDs = await listeningPIDs(port)
  assert(listenerPIDs.length > 0, `No process is listening on the selected QA API port ${port}.`)

  let pid = suppliedPID
  let facts = null
  if (pid) {
    assert(listenerPIDs.includes(pid), 'The supplied native PID is not listening on the selected QA API port.')
    facts = await inspectNativeProcessPrivately(pid, qaHome)
  } else {
    const matches = []
    for (const listenerPID of listenerPIDs) {
      const candidateFacts = await inspectNativeProcessPrivately(listenerPID, qaHome)
      if (candidateFacts.executableMatches && candidateFacts.qaHomeMatches) {
        matches.push({ pid: listenerPID, facts: candidateFacts })
      }
    }
    assert(matches.length > 0, 'The selected API listener is not the canonical Latitude Browser executable running with the isolated QA HOME.')
    assert(matches.length === 1, 'Multiple canonical QA app listeners matched; rerun with LATITUDE_NATIVE_QA_NATIVE_PID/--native-pid.')
    pid = matches[0].pid
    facts = matches[0].facts
  }

  assert(facts.executableMatches, 'The selected API listener is not the exact canonical Latitude Browser executable.')
  assert(facts.qaHomeMatches, 'The selected API listener HOME does not match the isolated QA HOME.')
  return {
    listenerPort: port,
    listenerPID: pid,
    listenerPIDCount: listenerPIDs.length,
    suppliedPID: Boolean(suppliedPID),
    canonicalExecutable: CANONICAL_NATIVE_EXECUTABLE,
    executableMatches: true,
    qaHomeMatches: true,
    environmentOutputRecorded: false,
  }
}

async function walkTorrcFiles(root) {
  const found = []
  async function walk(current) {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const child = join(current, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) await walk(child)
      else if (entry.isFile() && entry.name === 'torrc') found.push(child)
    }
  }
  await walk(root)
  return found
}

async function readManagedTorrc(stateRoot) {
  const torRoot = join(stateRoot, 'data', 'tor')
  const files = await walkTorrcFiles(torRoot)
  const items = []
  for (const torrcPath of files) {
    let text = ''
    try {
      text = await readFile(torrcPath, 'utf8')
    } catch {
      continue
    }
    const dataDirectoryMatch = text.match(/^DataDirectory\s+"?([^"\n]+)"?/m)
    items.push({
      torrcPath,
      dataDirectory: dataDirectoryMatch?.[1]?.trim() || '',
      stateOwned: isPathInside(stateRoot, torrcPath),
    })
  }
  return items
}

async function listProcessRows() {
  if (process.platform !== 'darwin') return []
  const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,command='], { maxBuffer: 2 * 1024 * 1024 })
  return stdout.split('\n').map((line) => {
    const match = line.trim().match(/^(\d+)\s+(.*)$/)
    return match ? { pid: Number(match[1]), command: match[2] } : null
  }).filter(Boolean)
}

function processArgMatches(rows, argument) {
  const needle = String(argument)
  return rows.filter((row) => row.command.includes(needle))
}

function expectedTorrcPath(stateRoot, profileId) {
  const digest = createHash('sha256').update(String(profileId)).digest('hex').slice(0, 32)
  return join(stateRoot, 'data', 'tor', 'profiles', digest, 'torrc')
}

async function getTorProcessEvidence(stateRoot, expectedTorBinary, profileId = '') {
  let torrcs = await readManagedTorrc(stateRoot)
  const expectedPath = String(profileId).trim() ? expectedTorrcPath(stateRoot, profileId) : ''
  if (expectedPath) torrcs = torrcs.filter((entry) => entry.torrcPath === expectedPath)
  if (!torrcs.length) {
    return {
      supported: false,
      reason: expectedPath ? 'The QA profile torrc was not found under the isolated state.' : 'No QA-owned managed Tor torrc was found.',
      torrcCount: 0,
      expectedTorrcPath: expectedPath,
    }
  }
  const rows = await listProcessRows()
  const candidates = []
  for (const torrc of torrcs) {
    const matches = processArgMatches(rows, torrc.torrcPath).filter((row) => {
      const binaryMatches = !expectedTorBinary || row.command.includes(expectedTorBinary)
      return binaryMatches && (row.command.includes(' -f ') || row.command.includes('-f '))
    })
    if (matches.length) candidates.push({ torrc, matches })
  }
  if (!candidates.length) {
    return {
      supported: false,
      reason: 'QA-owned torrc exists but its managed Tor PID was not visible in ps.',
      torrcCount: torrcs.length,
      torrcStateOwned: torrcs.every((entry) => entry.stateOwned),
    }
  }
  const selected = candidates[0]
  return {
    supported: true,
    pid: selected.matches[0].pid,
    torrcPath: selected.torrc.torrcPath,
    dataDirectory: selected.torrc.dataDirectory,
    torrcStateOwned: selected.torrc.stateOwned,
    binaryMatches: !expectedTorBinary || selected.matches[0].command.includes(expectedTorBinary),
  }
}

async function getBrowserProcessEvidence(profile, stateRoot) {
  const userDataDir = String(profile?.userDataDir || '').trim()
  const userDataDirInsideState = Boolean(userDataDir) && isPathInside(stateRoot, userDataDir)
  if (process.platform !== 'darwin') {
    return { supported: false, reason: 'Process argument inspection is implemented for macOS only.', userDataDirInsideState }
  }
  if (!userDataDir) return { supported: false, reason: 'Profile did not expose userDataDir.', userDataDirInsideState }
  const rows = await listProcessRows()
  const matches = processArgMatches(rows, userDataDir)
  return {
    supported: true,
    userDataDirInsideState,
    matchCount: matches.length,
    pid: matches[0]?.pid || 0,
    pids: matches.map((row) => row.pid),
    commandHasUserDataDir: matches.length > 0,
  }
}

async function terminatePID(pid) {
  assert(Number.isInteger(pid) && pid > 0, 'Refusing to terminate an invalid PID.')
  if (process.platform !== 'darwin') throw new Error('QA Tor termination is supported only on macOS.')
  await execFileAsync('/bin/kill', ['-TERM', String(pid)])
}

function cdpCallFactory(socket) {
  let sequence = 0
  const pending = new Map()
  const events = []
  socket.addEventListener('message', (event) => {
    let message
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (message.id && pending.has(message.id)) {
      const { resolve: resolveCall, reject: rejectCall } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) rejectCall(new Error(`CDP ${message.error.message || 'command failed'}`))
      else resolveCall(message.result || {})
      return
    }
    if (message.method) events.push(message)
  })

  function call(method, params = {}, timeoutMs = 15_000) {
    const id = ++sequence
    return new Promise((resolveCall, rejectCall) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        rejectCall(new Error(`CDP ${method} timed out`))
      }, timeoutMs)
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolveCall(value) },
        reject: (error) => { clearTimeout(timer); rejectCall(error) },
      })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async function waitForEvent(method, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const index = events.findIndex((event) => event.method === method)
      if (index >= 0) return events.splice(index, 1)[0]
      await sleep(100)
    }
    throw new Error(`CDP event ${method} timed out`)
  }

  return { call, waitForEvent }
}

async function cdpTorCheck(directDebugURL) {
  // Browser-level CDP can be ready just before its first page target appears.
  // Wait for the actual QA page, never synthesize a target or skip the network check.
  const target = await waitFor('Direct debug page WebSocket target', async () => {
    const response = await fetchWithTimeout(`${directDebugURL}/json/list`, {}, CDP_FETCH_TIMEOUT_MS)
    assert(response.ok, `Direct debug target list returned HTTP ${response.status}`)
    const targets = await response.json()
    return targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl) || false
  }, { timeoutMs: 15_000, intervalMs: 250 })

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  try {
    await new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => rejectPromise(new Error('CDP WebSocket open timed out')), 15_000)
      socket.addEventListener('open', () => { clearTimeout(timer); resolvePromise() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timer); rejectPromise(new Error('CDP WebSocket failed to open')) }, { once: true })
    })
    const cdp = cdpCallFactory(socket)
    await cdp.call('Page.enable')
    await cdp.call('Runtime.enable')
    const navigation = await cdp.call('Page.navigate', { url: CHECK_TOR_URL }, TOR_NAVIGATION_TIMEOUT_MS)
    assert(!navigation.errorText, `Tor navigation failed: ${navigation.errorText || 'unknown'}`)
    await cdp.waitForEvent('Page.loadEventFired', 30_000).catch(() => null)

    const bodyText = await waitFor('Tor check endpoint response', async () => {
      const result = await cdp.call('Runtime.evaluate', {
        expression: 'document.body ? document.body.innerText : ""',
        returnByValue: true,
      })
      const value = result?.result?.value
      return typeof value === 'string' && value.trim() ? value.trim() : false
    }, { timeoutMs: 30_000, intervalMs: 500 })

    let payload
    try {
      payload = JSON.parse(bodyText)
    } catch {
      throw new Error('Tor check endpoint did not return JSON.')
    }
    const isTor = payload?.IsTor === true || payload?.isTor === true
    assert(isTor, 'Tor check endpoint reported IsTor=false.')
    return {
      isTor: true,
      endpoint: CHECK_TOR_URL,
      ipRedacted: true,
      targetType: target.type,
      targetUrl: CHECK_TOR_URL,
    }
  } finally {
    try { socket.close() } catch { /* best effort */ }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const baseURL = normalizeBaseURL(options.baseURL)
  const qaHome = normalizePath(options.qaHome)
  const stateRoot = join(qaHome, 'Library', 'Application Support', 'latitude-browser')
  const defaultOutput = join(repoRoot, 'output', 'native-tor', `native-tor-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  const outputDir = normalizePath(options.outputDir || defaultOutput)
  const createdProfiles = []
  const checks = []
  const cleanupErrors = []
  const api = createApiClient(baseURL, options.apiHeader, options.apiKey)
  const unauthenticatedApi = createApiClient(baseURL, options.apiHeader, '')
  const suffix = `${Date.now()}-${createHash('sha1').update(`${process.pid}-${Math.random()}`).digest('hex').slice(0, 8)}`
  let torProfile = null
  let torSession = null
  let browserProcess = null
  let torProcess = null

  const report = {
    script: 'verify-native-tor.mjs',
    generatedAt: new Date().toISOString(),
    status: 'running',
    environment: {
      platform: process.platform,
      baseURL,
      apiHeader: options.apiHeader,
      qaHome,
      stateRoot,
      torBinary: options.torBinary,
      coreId: options.coreId,
      canonicalNativeExecutable: CANONICAL_NATIVE_EXECUTABLE,
      fetchTimeoutMs: API_FETCH_TIMEOUT_MS,
      runtimeFetchTimeoutMs: RUNTIME_FETCH_TIMEOUT_MS,
      torNavigationTimeoutMs: TOR_NAVIGATION_TIMEOUT_MS,
      productionDataAccess: false,
      networkEvidence: 'Real native Tor route through the QA profile; this is not an anonymity or leak-free guarantee.',
    },
    checks,
    createdProfiles,
    cleanupErrors,
    nativeLaunchCommand: `HOME=${JSON.stringify(qaHome)} ${JSON.stringify(CANONICAL_NATIVE_EXECUTABLE)}`,
    reproducibleCommand: `HOME=${JSON.stringify(qaHome)} LATITUDE_NATIVE_QA_BASE_URL=${JSON.stringify(baseURL)} LATITUDE_NATIVE_QA_API_KEY="$LATITUDE_NATIVE_QA_API_KEY"${options.nativePid ? ` LATITUDE_NATIVE_QA_NATIVE_PID=${options.nativePid}` : ''} node frontend/scripts/verify-native-tor.mjs`,
  }

  const pass = (id, evidence = {}) => checks.push({ id, status: 'pass', evidence })
  const skip = (id, reason) => checks.push({ id, status: 'skipped', reason })
  const fail = (id, error) => checks.push({ id, status: 'fail', error: safeError(error, options.apiKey) })

  const requireCheck = async (id, operation) => {
    try {
      const evidence = await operation()
      pass(id, evidence)
      return evidence
    } catch (error) {
      fail(id, error)
      throw error
    }
  }

  async function createProfile(profile) {
    const response = await api.request('/api/profiles', { method: 'POST', body: { profile } })
    if (response.ok && response.data?.profileId) createdProfiles.push(response.data.profileId)
    return response
  }

  async function statusProfile(profileId) {
    const response = await api.request(`/api/profiles/${encodeURIComponent(profileId)}/status`)
    return response.data
  }

  async function stopAndDelete(profileId) {
    try {
      const status = await statusProfile(profileId)
      if (status?.running) {
        const stopResponse = await api.request(`/api/profiles/${encodeURIComponent(profileId)}/stop`, { method: 'POST' })
        if (!stopResponse.ok && stopResponse.status !== 404) {
          cleanupErrors.push(`stop ${profileId}: HTTP ${stopResponse.status}`)
        } else {
          await waitFor(`profile ${profileId} stop during cleanup`, async () => {
            const current = await statusProfile(profileId)
            return current?.running ? false : true
          }, { timeoutMs: 10_000, intervalMs: 250 })
        }
      }
    } catch (error) {
      cleanupErrors.push(`stop ${profileId}: ${safeError(error, options.apiKey)}`)
    }
    try {
      const response = await api.request(`/api/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 404) {
        cleanupErrors.push(`delete ${profileId}: HTTP ${response.status}`)
      }
    } catch (error) {
      cleanupErrors.push(`delete ${profileId}: ${safeError(error, options.apiKey)}`)
    }
  }

  try {
    assert(options.apiKey, 'Missing LATITUDE_NATIVE_QA_API_KEY; refusing unauthenticated native QA.')
    assert(/^\/tmp\/latitude-native-qa-[^/]+$/.test(qaHome), `HOME must be an isolated /tmp/latitude-native-qa-* directory, got ${qaHome}`)
    assert(isPathInside(qaHome, stateRoot), 'Native QA state root escaped the isolated HOME.')
    assert(isPathInside(qaHome, outputDir) || isPathInside(repoRoot, outputDir), 'Evidence output must stay in the repository output or QA HOME.')
    pass('safety.qa-state-guard', { qaHome, stateRoot, stateRootInsideQAHome: true })

    await requireCheck('safety.native-service-preflight', async () => (
      preflightNativeService(baseURL, qaHome, options.nativePid)
    ))

    await requireCheck('api.rejects-unauthenticated-request', async () => {
      const response = await unauthenticatedApi.request('/api/profiles')
      assert(response.status === 401 && !response.ok, `Protected profiles route returned HTTP ${response.status} without an API key; expected 401.`)
      assert(response.data?.ok === false, 'Unauthenticated rejection did not return ok=false.')
      return { path: '/api/profiles', status: response.status, rejected: true }
    })

    await requireCheck('api.authenticated-health', async () => {
      const response = await api.request('/api/health')
      assert(response.ok && response.data?.ok === true, `LaunchServer health returned HTTP ${response.status}`)
      return { status: response.status, authenticated: true }
    })

    const conflictProxy = await createProfile({
      profileName: `Native Tor QA invalid proxy ${suffix}`,
      coreId: options.coreId,
      networkMode: 'tor',
      proxyConfig: 'http://127.0.0.1:9',
    })
    assert(!conflictProxy.ok, 'Tor profile with proxyConfig was unexpectedly accepted.')
    pass('profile.rejects-tor-proxy-config', {
      status: conflictProxy.status,
      rejected: true,
      error: safeError(conflictProxy.data?.error || '', options.apiKey),
    })

    const conflictDirect = await createProfile({
      profileName: `Native Tor QA invalid direct ${suffix}`,
      coreId: options.coreId,
      networkMode: 'tor',
      proxyId: '__direct__',
    })
    assert(!conflictDirect.ok, 'Tor profile with the direct proxy sentinel was unexpectedly accepted.')
    pass('profile.rejects-tor-direct-sentinel', {
      status: conflictDirect.status,
      rejected: true,
      error: safeError(conflictDirect.data?.error || '', options.apiKey),
    })

    const ordinaryUserDataDir = join(stateRoot, 'data', 'native-qa', `ordinary-${suffix}`)
    const ordinaryResponse = await createProfile({
      profileName: `Native QA ordinary proxy default ${suffix}`,
      userDataDir: ordinaryUserDataDir,
      coreId: options.coreId,
      // Omitted networkMode/proxy fields intentionally exercise normal defaults.
    })
    assert(ordinaryResponse.ok, `Ordinary proxy-default profile was rejected (HTTP ${ordinaryResponse.status}).`)
    const ordinaryProfile = profileFromResponse(ordinaryResponse.data)
    assert(ordinaryProfile.networkMode === 'proxy', `Ordinary profile networkMode was ${ordinaryProfile.networkMode || '(empty)'}, expected proxy.`)
    assert(!ordinaryProfile.lastError, 'Ordinary proxy-default profile reported a creation error.')
    pass('profile.ordinary-proxy-default', {
      ...shortProfileEvidence(ordinaryProfile),
      directBindingAllowed: true,
      started: false,
    })

    const torUserDataDir = join(stateRoot, 'data', 'native-qa', `tor-${suffix}`)
    const torResponse = await createProfile({
      profileName: `Native Tor QA transport ${suffix}`,
      userDataDir: torUserDataDir,
      coreId: options.coreId,
      networkMode: 'tor',
    })
    assert(torResponse.ok, `Tor profile creation was rejected (HTTP ${torResponse.status}).`)
    torProfile = profileFromResponse(torResponse.data)
    assert(torProfile.profileId, 'Tor profile creation did not return profileId.')
    assert(torProfile.networkMode === 'tor', `Tor profile networkMode was ${torProfile.networkMode || '(empty)'}.`)
    assert(!String(torProfile.proxyId || '').trim() && !String(torProfile.proxyConfig || '').trim(), 'Valid Tor profile unexpectedly carried proxy fields.')
    pass('profile.create-tor-without-proxy', shortProfileEvidence(torProfile))

    const runtimeDirectConflict = await api.request('/api/runtime/session', {
      method: 'POST',
      body: {
        profileId: torProfile.profileId,
        proxyId: '__direct__',
        skipDefaultStartUrls: true,
        startUrls: ['about:blank'],
        timeoutMs: PROFILE_TIMEOUT_MS,
      },
    })
    assert(!runtimeDirectConflict.ok, 'Tor runtime session with direct proxy override was unexpectedly accepted.')
    pass('runtime.rejects-tor-direct-override', {
      status: runtimeDirectConflict.status,
      rejected: true,
      error: safeError(runtimeDirectConflict.data?.error || '', options.apiKey),
    })

    const beforeRuntimeStatus = await statusProfile(torProfile.profileId)
    assert(!beforeRuntimeStatus.running, 'Tor profile remained running after rejected direct override.')
    pass('runtime.conflict-keeps-profile-stopped', shortProfileEvidence(beforeRuntimeStatus))

    torSession = await requireCheck('runtime.start-tor-session', async () => {
      const response = await api.request('/api/runtime/session', {
        method: 'POST',
        body: {
          profileId: torProfile.profileId,
          skipDefaultStartUrls: true,
          startUrls: ['about:blank'],
          timeoutMs: PROFILE_TIMEOUT_MS,
        },
        timeoutMs: RUNTIME_FETCH_TIMEOUT_MS,
      })
      assert(response.ok, `Tor runtime session returned HTTP ${response.status}.`)
      const profile = profileFromResponse(response.data)
      assert(response.data?.ready === true, 'Tor runtime session did not report ready=true.')
      assert(profile.running && profile.debugReady, 'Tor runtime session did not expose a running debug-ready profile.')
      assert(typeof response.data?.directDebugUrl === 'string' && response.data.directDebugUrl.startsWith('http://127.0.0.1:'), 'Runtime response did not expose directDebugUrl.')
      assert(profile.networkMode === 'tor', 'Runtime response changed the profile networkMode away from tor.')
      const actualArgs = profile.lastLaunchArgs || []
      // These two flags are inherited from the isolated QA config, not passed
      // by this API request. Their presence catches the first-start regression.
      for (const flag of ['--no-first-run', '--disable-background-networking', '--disable-quic', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp']) {
        assert(actualArgs.includes(flag), `First native launch omitted ${flag}. Configure the QA defaults described in the verification plan.`)
      }
      assert(actualArgs.some((arg) => /^--proxy-server=socks5:\/\/127\.0\.0\.1:\d+$/.test(arg)), 'Native launch did not carry the managed local Tor proxy.')
      pass('runtime.first-launch-defaults-and-tor-constraints', { inheritedDefaultsPresent: true, torProxyLoopback: true, quicDisabled: true, webrtcNonProxyUDPRestricted: true, launchStringsOnlyNotLeakProof: true })
      return {
        ready: true,
        directDebugUrl: response.data.directDebugUrl,
        debugPort: Number(response.data.debugPort || profile.debugPort || 0),
        profile: shortProfileEvidence(profile),
      }
    })

    await requireCheck('network.real-tor-check-endpoint', async () => cdpTorCheck(torSession.directDebugUrl))

    const runtimeStatus = await statusProfile(torProfile.profileId)
    torProfile = { ...torProfile, ...profileFromResponse(runtimeStatus) }
    torSession = await requireCheck('runtime.normal-stop-and-restart', async () => {
      const stopped = await api.request(`/api/profiles/${encodeURIComponent(torProfile.profileId)}/stop`, { method: 'POST' })
      assert(stopped.ok, `Normal native stop returned HTTP ${stopped.status}.`)
      await waitFor('normal stop clears owned Chrome and Tor processes', async () => {
        const status = profileFromResponse(await statusProfile(torProfile.profileId))
        const rows = await listProcessRows()
        const chromeAlive = processArgMatches(rows, torProfile.userDataDir).length > 0
        const torAlive = processArgMatches(rows, expectedTorrcPath(stateRoot, torProfile.profileId)).length > 0
        return !status.running && !chromeAlive && !torAlive
      }, { timeoutMs: 10_000, intervalMs: 250 })
      const restarted = await api.request('/api/runtime/session', {
        method: 'POST',
        body: { profileId: torProfile.profileId, skipDefaultStartUrls: true, startUrls: ['about:blank'], timeoutMs: PROFILE_TIMEOUT_MS },
        timeoutMs: RUNTIME_FETCH_TIMEOUT_MS,
      })
      assert(restarted.ok && restarted.data?.ready === true, `Native restart was not ready (HTTP ${restarted.status}).`)
      const profile = profileFromResponse(restarted.data)
      assert(profile.running && profile.debugReady && profile.networkMode === 'tor', 'Native restart lost running/debug/Tor state.')
      const directDebugUrl = restarted.data.directDebugUrl
      assert(typeof directDebugUrl === 'string' && directDebugUrl.startsWith('http://127.0.0.1:'), 'Restart did not expose a loopback debug URL.')
      return { normalStopConfirmed: true, oldChromeExited: true, oldTorExited: true, restartReady: true, directDebugUrl, profile: shortProfileEvidence(profile) }
    })
    await requireCheck('network.restarted-tor-check-endpoint', async () => cdpTorCheck(torSession.directDebugUrl))

    browserProcess = await requireCheck('process.chrome-qa-user-data-dir', async () => {
      const evidence = await getBrowserProcessEvidence(torProfile, stateRoot)
      assert(evidence.userDataDirInsideState, 'Chrome user-data-dir is outside the isolated QA state.')
      if (evidence.supported) assert(evidence.commandHasUserDataDir, 'No Chrome process command line carried the QA user-data-dir.')
      return evidence
    })

    const torProcessEvidence = await getTorProcessEvidence(stateRoot, options.torBinary, torProfile.profileId)
    if (torProcessEvidence.supported) {
      assert(torProcessEvidence.torrcStateOwned, 'Managed Tor torrc is outside the isolated QA state.')
      assert(torProcessEvidence.binaryMatches, 'Managed Tor PID command did not match the configured QA Tor binary.')
      torProcess = torProcessEvidence
      pass('process.tor-qa-torrc', {
        supported: true,
        pidCaptured: true,
        pid: torProcessEvidence.pid,
        profileId: torProfile.profileId,
        torrcPath: torProcessEvidence.torrcPath,
        dataDirectory: torProcessEvidence.dataDirectory,
        torrcStateOwned: torProcessEvidence.torrcStateOwned,
        binaryMatches: torProcessEvidence.binaryMatches,
      })
    } else {
      skip('process.tor-qa-torrc', torProcessEvidence.reason)
    }

    if (options.skipTorKill) {
      skip('runtime.tor-failure-injection', 'Skipped by LATITUDE_NATIVE_QA_SKIP_TOR_KILL=1/--skip-tor-kill.')
    } else if (torProcess?.supported) {
      await requireCheck('runtime.tor-failure-injection', async () => {
        await terminatePID(torProcess.pid)
        const stopped = await waitFor('Tor-dependent profile stop after managed Tor termination', async () => {
          const status = await statusProfile(torProfile.profileId)
          const profile = profileFromResponse(status)
          return !profile.running && String(profile.lastError || '').trim() ? profile : false
        }, { timeoutMs: 20_000, intervalMs: 400 })
        assert(!stopped.running, 'Tor-dependent browser profile remained running after Tor termination.')
        assert(String(stopped.lastError || '').toLowerCase().includes('tor'), 'Tor-dependent profile did not expose a Tor LastError after runtime death.')
        const afterRows = await listProcessRows()
        const chromeMatches = processArgMatches(afterRows, torProfile.userDataDir)
        assert(chromeMatches.length === 0, 'Chrome process with the QA user-data-dir remained after Tor termination.')
        return {
          torPidTerminated: true,
          profileRunning: false,
          lastErrorPresent: true,
          lastErrorMentionsTor: true,
          chromePidExited: true,
        }
      })
    } else {
      skip('runtime.tor-failure-injection', 'Managed Tor PID was not discoverable; no process was terminated.')
    }
  } catch (error) {
    report.status = 'failed'
    report.failure = safeError(error, options.apiKey)
  } finally {
    for (const profileId of [...createdProfiles].reverse()) await stopAndDelete(profileId)
    if (cleanupErrors.length) {
      report.status = 'failed'
      report.cleanupErrors = cleanupErrors
    }
    if (report.status === 'running') {
      const failedChecks = checks.filter((check) => check.status === 'fail')
      report.status = failedChecks.length ? 'failed' : checks.some((check) => check.status === 'skipped') ? 'pass_with_skips' : 'passed'
    }
    report.checkSummary = checks.reduce((summary, check) => {
      summary[check.status] = (summary[check.status] || 0) + 1
      return summary
    }, {})
    report.artifactPath = join(outputDir, 'evidence.json')
    await mkdir(outputDir, { recursive: true })
    await writeFile(report.artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(report, null, 2))
    if (report.status === 'failed') process.exitCode = 1
  }
}

main().catch((error) => {
  const report = {
    script: 'verify-native-tor.mjs',
    status: 'failed',
    error: safeError(error),
    reproducibleCommand: 'Set LATITUDE_NATIVE_QA_API_KEY and run node frontend/scripts/verify-native-tor.mjs',
  }
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = 1
})
