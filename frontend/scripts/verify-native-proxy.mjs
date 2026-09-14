#!/usr/bin/env node
/**
 * Opt-in ordinary-proxy native QA. Never attaches to an existing app/profile.
 * Uses only the canonical installed app, a fresh private HOME and a loopback
 * authenticated SOCKS5 fixture. See docs/plan/latitude-proxy-native-verification.md.
 * No package installation, production config access, or TLS exceptions.
 */
import { spawn, execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { constants as fsConstants, createReadStream } from 'node:fs'
import { access, chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { createServer, isIP } from 'node:net'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { createProxyFixture } from './native-proxy-fixture.mjs'

const execFileAsync = promisify(execFile)
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const NATIVE_EXECUTABLE = '/Applications/Latitude Browser.app/Contents/MacOS/latitude-browser'
const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const XRAY_EXECUTABLE = '/Applications/Latitude Browser.app/Contents/MacOS/bin/xray'
const SING_BOX_EXECUTABLE = '/Applications/Latitude Browser.app/Contents/MacOS/bin/sing-box'
const MIHOMO_EXECUTABLE = '/Applications/Latitude Browser.app/Contents/MacOS/bin/mihomo'
// Closed alternatives, not caller-supplied executable paths or fallback kernels.
const CONNECTOR_STACKS = Object.freeze({
  xray: Object.freeze({ connector: 'xray', executable: XRAY_EXECUTABLE, directory: '_xray', configName: 'xray-config.json', chromeScheme: 'socks5', release: 'idle', requiredExecutables: Object.freeze([XRAY_EXECUTABLE, SING_BOX_EXECUTABLE]) }),
  mihomo: Object.freeze({ connector: 'mihomo', executable: MIHOMO_EXECUTABLE, directory: '_mihomo', configName: 'mihomo-config.yaml', chromeScheme: 'http', release: 'idle', requiredExecutables: Object.freeze([MIHOMO_EXECUTABLE]) }),
})
const OUTPUT_ROOT = join(REPO_ROOT, 'output/native-proxy')
// Existing LaunchServer compatibility header; not a new product/brand name.
const API_HEADER = 'X-Ant-Api-Key'
const CORE_ID = 'qa-native-google-chrome'
const PROXY_ID = 'qa-native-authenticated-socks'
const API_TIMEOUT = 20_000
const NAV_TIMEOUT = 35_000
// Product idle TTL is 45s, collected every 15s. Do not shorten it for a green test.
const BRIDGE_RELEASE_TIMEOUT = 70_000
// A delayed background speed round can refresh the same bridge's idle clock.
// Activity extends observation only; it never replaces PID/port release proof.
const BRIDGE_RELEASE_HARD_TIMEOUT = 150_000

function assert(condition, message) { if (!condition) throw new Error(message) }
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

export function connectorStack(connector = 'xray') {
  assert(typeof connector === 'string' && Object.hasOwn(CONNECTOR_STACKS, connector), 'Connector must be exactly xray or mihomo.')
  return CONNECTOR_STACKS[connector]
}
export function nativeProxyOptions({ connector = 'xray', backgroundOverlap = false } = {}) {
  connectorStack(connector)
  assert(typeof backgroundOverlap === 'boolean', 'Invalid background overlap option.')
  assert(connector !== 'mihomo' || !backgroundOverlap, 'Mihomo does not use Xray idle collection; --background-overlap is Xray-only.')
  return { connector, backgroundOverlap }
}
export function parseNativeProxyCLI(args) {
  assert(Array.isArray(args) && args.every((arg) => typeof arg === 'string'), 'Invalid native QA arguments.')
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { mode: 'help' }
  assert(args[0] === '--run', 'Explicit --run is required. Use --help for usage.')
  let connector = 'xray', backgroundOverlap = false, connectorSeen = false
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--connector' && !connectorSeen) {
      connectorSeen = true; connector = args[++i]
      assert(connector === 'xray' || connector === 'mihomo', 'Connector must be exactly xray or mihomo.')
    } else if (args[i] === '--background-overlap' && !backgroundOverlap) backgroundOverlap = true
    else throw new Error('Unknown or repeated arguments. Use --help or explicitly opt in with --run.')
  }
  return { mode: 'run', ...nativeProxyOptions({ connector, backgroundOverlap }) }
}
export function managedBridgeCommand(command, connector, stateRoot) {
  const stack = connectorStack(connector)
  assert(typeof stateRoot === 'string' && isAbsolute(stateRoot) && resolve(stateRoot) === stateRoot && !/[\r\n\0]/.test(stateRoot), 'Invalid canonical QA state root.')
  if (typeof command !== 'string') return null
  const prefix = `${stack.executable}${connector === 'mihomo' ? ' -f ' : ' run -c '}`
  const root = join(stateRoot, 'data', stack.directory)
  if (!command.startsWith(`${prefix}${root}/`)) return null
  const key = command.slice(prefix.length + root.length + 1, prefix.length + root.length + 65)
  if (!/^[a-f0-9]{64}$/.test(key)) return null
  const workdir = join(root, key), configPath = join(workdir, stack.configName)
  const expected = `${prefix}${configPath}${connector === 'mihomo' ? ` -d ${workdir}` : ''}`
  return command === expected ? { key, workdir, configPath } : null
}
export function registerOwnedBridges(rows, ledger, { connector, stateRoot, appPID, appStarted, uid }) {
  connectorStack(connector)
  // A recycled parent PID cannot authorize a new bridge. New records are only
  // learned while the independently authenticated, exact QA app is still alive.
  const parent = rows.find((row) => row.pid === appPID)
  if (!Number.isSafeInteger(appPID) || appPID <= 0 || typeof appStarted !== 'string' || !appStarted || !parent || parent.uid !== uid || parent.started !== appStarted || parent.command !== NATIVE_EXECUTABLE) return
  for (const row of rows) {
    if (!ledger.has(row.pid) && Number.isSafeInteger(row.pid) && row.pid > 0 && row.uid === uid && row.parentPID === appPID && typeof row.started === 'string' && /^\w{3} \w{3} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/.test(row.started) && managedBridgeCommand(row.command, connector, stateRoot)) ledger.set(row.pid, Object.freeze({ ...row }))
  }
}
export function managedChromeProxyPort(args, connector, upstreamPort) {
  const stack = connectorStack(connector)
  assert(Array.isArray(args) && args.every((arg) => typeof arg === 'string'), 'Missing actual Chrome launch arguments.')
  const proxyArgs = args.filter((arg) => arg.startsWith('--proxy-server='))
  const pattern = new RegExp(`^--proxy-server=${stack.chromeScheme}://127\\.0\\.0\\.1:([1-9]\\d*)$`)
  const match = proxyArgs.length === 1 ? proxyArgs[0].match(pattern) : null
  assert(match && !args.includes('--proxy-server'), `Chrome did not receive exactly one managed ${stack.chromeScheme.toUpperCase()} bridge.`)
  assert(!args.includes('--no-proxy-server') && !args.some((arg) => arg.startsWith('--proxy-pac-url') || arg.startsWith('--proxy-auto-detect') || arg.includes('ignore-certificate-errors') || arg === '--no-sandbox'), 'Unsafe direct/TLS/sandbox override found.')
  const port = Number(match[1])
  assert(Number.isSafeInteger(port) && port > 0 && port <= 65535 && port !== upstreamPort, 'Chrome bypassed the managed connector or used an invalid bridge port.')
  return port
}
export function assertSelectedKernelOnly(rows, connector, appPID) {
  const selected = connectorStack(connector).executable
  const forbidden = [XRAY_EXECUTABLE, SING_BOX_EXECUTABLE, MIHOMO_EXECUTABLE].filter((path) => path !== selected)
  assert(!rows.some((row) => row.parentPID === appPID && forbidden.some((path) => row.command === path || row.command.startsWith(`${path} `))), 'Selected connector unexpectedly started another kernel.')
}
export function mihomoGenerationExited(rows, identity) {
  assert(Array.isArray(rows) && Number.isSafeInteger(identity?.pid) && identity.pid > 0, 'Invalid Mihomo generation observation.')
  // A changed command/UID is not an exited PID. This is observation only: a
  // reused PID fails conservatively and never grants permission to signal it.
  return !rows.some((row) => row.pid === identity.pid)
}
export function assertNewMihomoGeneration(previous, next) {
  assert(previous && next && Number.isSafeInteger(previous.pid) && Number.isSafeInteger(next.pid) && previous.pid > 0 && next.pid > 0 && typeof previous.started === 'string' && previous.started && typeof next.started === 'string' && next.started && next.pid !== previous.pid, 'Mihomo restart reused a previously recorded PID instead of a fresh owned generation.')
}
export function isWithin(parent, child) {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'))
}
// All newly writable paths must remain below an already canonical, owned root.
// Check each component instead of trusting lexical startsWith()/relative() alone.
export async function ensurePrivateDirectory(root, path) {
  const base = resolve(root)
  assert(await realpath(base) === base && isWithin(base, path), 'Writable directory escaped its canonical root.')
  let current = base
  for (const part of relative(base, resolve(path)).split('/').filter(Boolean)) {
    current = join(current, part)
    try { await mkdir(current, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
    const info = await lstat(current)
    assert(info.isDirectory() && !info.isSymbolicLink() && await realpath(current) === current, 'Writable path contains a symlink or non-directory.')
  }
  return current
}
export function ownedProfileResponse(result, profileID) {
  assert(result.status === 200 && result.ok && result.data?.ok === true, 'Profile status did not return an explicit successful result.')
  const profile = result.data.profile
  assert(profile?.profileId === profileID && typeof profile.running === 'boolean', 'Profile status omitted the owned identity or running state.')
  return profile
}
export function safeError(error, secrets = []) {
  let value = error instanceof Error ? error.message : String(error)
  for (const secret of secrets) if (secret) value = value.split(secret).join('[redacted]')
  value = value.replace(/(socks5?|https?):\/\/[^\s/@]+:[^\s/@]+@/gi, '$1://[redacted]@')
  value = value.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]')
  value = value.replace(/\[?[a-f\d]*:[a-f\d:]+\]?/gi, (part) => isIP(part.replace(/^\[|\]$/g, '')) ? '[redacted-ip]' : part)
  return value.slice(0, 700)
}
export function assertDebugURL(value, port, websocket = false) {
  const url = new URL(value)
  assert(url.protocol === (websocket ? 'ws:' : 'http:') && url.hostname === '127.0.0.1', 'CDP must use the owned loopback listener.')
  assert(Number(url.port) === port && !url.username && !url.password && !url.search && !url.hash, 'CDP URL did not match the owned debug port.')
  assert(websocket ? /^\/devtools\/(page|browser)\/[\w-]+$/.test(url.pathname) : url.pathname === '/', 'Unexpected CDP endpoint path.')
  return url
}
const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`
export function chromeLauncherSource({ userDataDir, osHome, identityDir, chromeExecutable = CHROME_EXECUTABLE }) {
  assert([userDataDir, osHome, identityDir, chromeExecutable].every((path) => typeof path === 'string' && isAbsolute(path)), 'Launcher paths must be absolute.')
  return `#!/bin/sh
set -eu
export LC_ALL=C
# QA-only: preserve macOS system trust services, never a production Chrome profile.
expected=${shellQuote(userDataDir)}
if [ "$#" -eq 1 ] && [ "$1" = '--version' ]; then
  HOME=${shellQuote(osHome)} exec ${shellQuote(chromeExecutable)} "$@"
fi
count=0
for arg in "$@"; do
  case "$arg" in
    --user-data-dir=*) [ "\${arg#--user-data-dir=}" = "$expected" ] || exit 64; count=$((count + 1));;
    --user-data-dir|--profile-directory*|--disk-cache-dir*) exit 64;;
  esac
done
[ "$count" -eq 1 ] || exit 64
[ "$(cd "$expected" && pwd -P)" = "$expected" ] || exit 64
identity_dir=${shellQuote(identityDir)}
[ "$(cd "$identity_dir" && pwd -P)" = "$identity_dir" ] || exit 64
# exec preserves PID/start time. Record before launch so a failed API response or
# dead parent does not leave an unidentifiable Chrome. Never overwrite a PID file.
umask 077
set -C
printf '%s\\n' "$$" "$(/usr/bin/id -u)" "$(/bin/ps -p $$ -o lstart=)" "$(/bin/ps -p $$ -o ppid=)" 'latitude-native-launch-v1' > "$identity_dir/$$"
HOME=${shellQuote(osHome)} exec ${shellQuote(chromeExecutable)} "$@"
`
}
export function canonicalNavigationURL(value) { return new URL(value).href }
export function matchesMainFrameResponse(event, navigation, requestedURL) {
  return typeof navigation?.frameId === 'string' && navigation.frameId.length > 0 && typeof navigation.loaderId === 'string' && navigation.loaderId.length > 0 && event.method === 'Network.responseReceived' && event.params?.type === 'Document' && event.params.frameId === navigation.frameId && event.params.loaderId === navigation.loaderId && event.params.response?.url === canonicalNavigationURL(requestedURL)
}
export function parseQASpeedCompletion(stdout) {
  let rows
  try { rows = JSON.parse(stdout) } catch { throw new Error('Invalid QA background speed completion JSON.') }
  assert(Array.isArray(rows) && rows.length === 1 && rows[0] && !Array.isArray(rows[0]), 'Missing or ambiguous QA background speed completion row.')
  const marker = rows[0].lastTestedAt
  assert(typeof marker === 'string', 'Invalid QA background speed completion marker.')
  if (marker !== '') {
    const parts = marker.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/)
    assert(parts && Number.isFinite(Date.parse(marker)), 'Invalid QA background speed completion marker.')
    const [year, month, day, hour, minute, second] = parts.slice(1).map(Number)
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    // Date.parse normalizes invalid civil dates (e.g. February 30 / 24:00).
    assert(month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1] && hour < 24 && minute < 60 && second < 60, 'Invalid QA background speed completion calendar date.')
  }
  return marker
}
async function readQASpeedCompletion(qaHome) {
  const database = join(qaHome, 'Library/Application Support/latitude-browser/data/app.db')
  const info = await lstat(database)
  assert(await realpath(qaHome) === qaHome && isWithin(qaHome, database) && await realpath(database) === database && info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid(), 'Background observation is not the owned canonical QA database.')
  // Read one completion marker, never proxy_config/credentials or production data.
  // A failed speed test also writes this marker. It is not a success assertion.
  const { stdout } = await execFileAsync('/usr/bin/sqlite3', ['-readonly', '-batch', '-init', '/dev/null', '-json', database, "SELECT COALESCE(last_tested_at, '') AS lastTestedAt FROM browser_proxies WHERE proxy_id = 'qa-native-authenticated-socks';"], {
    env: { HOME: qaHome, PATH: '/usr/bin:/bin', LC_ALL: 'C' }, timeout: 3000, maxBuffer: 4096,
  })
  return parseQASpeedCompletion(stdout)
}
export async function waitForBridgeIdle({ inspect, signal, now = () => performance.now(), pause = sleep, windowMs = BRIDGE_RELEASE_TIMEOUT, hardTimeoutMs = BRIDGE_RELEASE_HARD_TIMEOUT, pollMs = 200 }) {
  assert(typeof inspect === 'function' && typeof now === 'function' && typeof pause === 'function', 'Invalid idle bridge observer.')
  assert([windowMs, hardTimeoutMs, pollMs].every((n) => Number.isFinite(n) && n > 0) && hardTimeoutMs >= windowMs, 'Invalid idle bridge observation bounds.')
  let previousTime = -Infinity
  const time = () => { const value = now(); assert(Number.isFinite(value) && value >= previousTime, 'Idle observation clock must be monotonic.'); previousTime = value; return value }
  const started = time(), hardDeadline = started + hardTimeoutMs
  let softDeadline = started + windowMs, previous, completionObserved = false
  const activityObservations = []
  const interrupted = () => assert(!signal?.aborted, 'Native QA interrupted; idle release was not verified.')
  while (true) {
    interrupted()
    assert(time() < hardDeadline, 'Idle bridge release timed out at the hard observation bound.')
    const state = await inspect()
    interrupted()
    const observedAt = time()
    // An inspection completing beyond the hard bound cannot manufacture a pass.
    assert(observedAt < hardDeadline, 'Idle bridge release timed out at the hard observation bound.')
    assert(state && typeof state.released === 'boolean' && Number.isSafeInteger(state.witnessForwarded) && state.witnessForwarded >= 0 && Number.isSafeInteger(state.bridgeGenerationCount) && state.bridgeGenerationCount >= 0 && typeof state.speedCompletedAt === 'string', 'Invalid idle bridge observation.')
    const reasons = []
    if (previous) {
      assert(state.witnessForwarded >= previous.witnessForwarded && state.bridgeGenerationCount >= previous.bridgeGenerationCount && !(previous.speedCompletedAt && !state.speedCompletedAt), 'Idle bridge observation moved backwards.')
      if (state.witnessForwarded > previous.witnessForwarded) reasons.push('witness_traffic')
      if (state.bridgeGenerationCount > previous.bridgeGenerationCount) reasons.push('new_bridge_identity')
      if (state.speedCompletedAt && state.speedCompletedAt !== previous.speedCompletedAt) reasons.push('background_speed_completed')
    }
    completionObserved ||= state.speedCompletedAt.length > 0
    if (reasons.length) {
      softDeadline = Math.min(observedAt + windowMs, hardDeadline)
      activityObservations.push({ elapsedMs: Math.round(observedAt - started), reasons })
    }
    previous = state
    if (state.released) return { elapsedMs: Math.round(observedAt - started), allowedWindowMs: windowMs, hardTimeoutMs, activityObservations, backgroundSpeedCompletionObserved: completionObserved }
    // Before the first scheduler completion, EnsureBridge may already have been
    // touched even though no request reached the fixture yet. Do not treat that
    // invisible in-flight gap as an idle leak; the overall hard bound still wins.
    assert(!completionObserved || observedAt < softDeadline, 'Idle bridge release timed out after the last observed activity window.')
    await pause(Math.min(pollMs, hardDeadline - observedAt, completionObserved ? softDeadline - observedAt : Infinity))
  }
}
// Mihomo releases its last browser reference immediately. No Xray idle-clock,
// speed-completion extension or app shutdown is a substitute for this proof.
export async function waitForMihomoRelease({ inspect, signal, now = () => performance.now(), pause = sleep, timeoutMs = BRIDGE_RELEASE_HARD_TIMEOUT, pollMs = 200 }) {
  assert(typeof inspect === 'function' && typeof now === 'function' && typeof pause === 'function' && [timeoutMs, pollMs].every((n) => Number.isFinite(n) && n > 0), 'Invalid Mihomo release observer.')
  let previousTime = -Infinity
  const time = () => { const value = now(); assert(Number.isFinite(value) && value >= previousTime, 'Mihomo release clock must be monotonic.'); previousTime = value; return value }
  const started = time(), deadline = started + timeoutMs
  const interrupted = () => assert(!signal?.aborted, 'Native QA interrupted; Mihomo release was not verified.')
  while (true) {
    interrupted()
    assert(time() < deadline, 'Mihomo process/socket release timed out.')
    const state = await inspect()
    interrupted()
    const observedAt = time()
    assert(observedAt < deadline, 'Mihomo process/socket release timed out.')
    assert(state && ['appAlive', 'generationExited', 'portsReleased'].every((key) => typeof state[key] === 'boolean'), 'Invalid Mihomo release observation.')
    assert(state.appAlive, 'QA app exited; shutdown is not a successful Mihomo idle release.')
    if (state.generationExited && state.portsReleased) return { elapsedMs: Math.round(observedAt - started), timeoutMs, appAliveDuringRelease: true, bridgePIDExited: true, TCPAndUDPPortsReleased: true, harnessSignalUsed: false }
    await pause(Math.min(pollMs, deadline - observedAt))
  }
}
async function waitFor(label, fn, timeoutMs = API_TIMEOUT, signal) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Native QA interrupted; cleaning up only owned resources.')
    try { const result = await fn(); if (result) return result } catch (error) { last = safeError(error) }
    await sleep(200)
  }
  throw new Error(`${label} timed out${last ? `: ${last}` : ''}`)
}
async function fileHash(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
async function processRows() {
  const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,ppid=,uid=,lstart=,command='], { maxBuffer: 4 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } })
  return stdout.split('\n').flatMap((line) => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/)
    return m ? [{ pid: Number(m[1]), parentPID: Number(m[2]), uid: Number(m[3]), started: m[4].replace(/\s+/g, ' '), command: m[5] }] : []
  })
}
async function listeners(port) {
  try {
    const { stdout } = await execFileAsync('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { maxBuffer: 128 * 1024 })
    return [...new Set(stdout.split(/\s+/).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0))]
  } catch (error) { if (error.code === 1) return []; throw new Error('Unable to inspect listener ownership.') }
}
const MIHOMO_CONFIG_LIMIT = 64 * 1024
export function parseMihomoBridgePorts(text) {
  assert(typeof text === 'string' && Buffer.byteLength(text) <= MIHOMO_CONFIG_LIMIT && !text.includes('\0'), 'Invalid bounded Mihomo QA config.')
  const fields = new Map()
  for (const line of text.split(/\r?\n/)) {
    // The app emits a single, simple YAML mapping. Reject aliases/quoted keys or
    // additional documents rather than guessing which controller config wins.
    assert(!/^(?:---|\.\.\.)(?:\s|$)/.test(line) && !/^(?:["'](?:mixed-port|external-controller|allow-lan)["']\s*:|<<\s*:)/.test(line), 'Ambiguous Mihomo QA config.')
    const match = line.match(/^(mixed-port|external-controller|allow-lan)\s*:\s*(.*?)\s*$/)
    if (!match) continue
    assert(!fields.has(match[1]), 'Duplicate Mihomo QA listener setting.')
    fields.set(match[1], match[2])
  }
  const mixed = fields.get('mixed-port'), controller = fields.get('external-controller')?.match(/^(["']?)127\.0\.0\.1:([1-9]\d*)\1$/)
  assert(typeof mixed === 'string' && /^[1-9]\d*$/.test(mixed) && controller && fields.get('allow-lan') === 'false', 'Mihomo QA config must declare two local ports and disable LAN access.')
  const mixedPort = Number(mixed), controllerPort = Number(controller[2])
  assert([mixedPort, controllerPort].every((port) => Number.isSafeInteger(port) && port > 0 && port <= 65535) && mixedPort !== controllerPort, 'Invalid or overlapping Mihomo QA ports.')
  return Object.freeze({ mixedPort, controllerPort })
}
export async function readMihomoBridgePorts(qaHome, command) {
  const stateRoot = join(qaHome, 'Library/Application Support/latitude-browser')
  const info = managedBridgeCommand(command, 'mihomo', stateRoot)
  const homeInfo = await lstat(qaHome)
  assert(info && isWithin(qaHome, info.configPath) && await realpath(qaHome) === qaHome && homeInfo.isDirectory() && !homeInfo.isSymbolicLink() && homeInfo.uid === process.getuid() && (homeInfo.mode & 0o077) === 0, 'Mihomo config is not inside the private owned QA HOME.')
  let current = qaHome, leafInfo
  for (const part of relative(qaHome, info.configPath).split('/')) {
    current = join(current, part)
    const entry = await lstat(current)
    assert(!entry.isSymbolicLink() && await realpath(current) === current && entry.uid === process.getuid() && (entry.mode & 0o022) === 0, 'Mihomo QA config path contains a symlink, foreign owner or writable redirection.')
    if (current === info.configPath) { assert(entry.isFile() && entry.size > 0 && entry.size <= MIHOMO_CONFIG_LIMIT, 'Mihomo QA config is not a bounded regular file.'); leafInfo = entry }
    else assert(entry.isDirectory(), 'Mihomo QA config path is not a directory.')
  }
  // Read only this app-generated QA file, without following a swapped leaf.
  // Do not log the YAML: it contains the self-created fixture credentials.
  const handle = await open(info.configPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    assert(stat.isFile() && stat.ino === leafInfo.ino && stat.dev === leafInfo.dev && stat.size === leafInfo.size, 'Mihomo QA config changed before its bounded read.')
    const buffer = Buffer.alloc(MIHOMO_CONFIG_LIMIT + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    assert(bytesRead === stat.size && bytesRead <= MIHOMO_CONFIG_LIMIT, 'Mihomo QA config changed during its bounded read.')
    return parseMihomoBridgePorts(buffer.subarray(0, bytesRead).toString('utf8'))
  } finally { await handle.close() }
}
export function parseInternetSockets(stdout) {
  assert(typeof stdout === 'string' && Buffer.byteLength(stdout) <= 128 * 1024, 'Invalid bounded socket inspection.')
  const sockets = []
  let pid, file, processHasFile = false
  const finish = () => {
    if (!file) return
    assert(Number.isSafeInteger(pid) && pid > 0 && ['TCP', 'UDP'].includes(file.protocol) && typeof file.endpoint === 'string' && (file.protocol !== 'TCP' || typeof file.state === 'string'), 'Incomplete socket inspection; release cannot be inferred.')
    const endpoint = file.endpoint.split('->')[0]
    const match = endpoint.match(/^(\[[\da-fA-F:.%]+\]|[\da-fA-F:.*]+):(\d+|\*)$/)
    assert(match, 'Unrecognized local socket endpoint.')
    const port = match[2] === '*' ? 0 : Number(match[2])
    assert(Number.isSafeInteger(port) && port >= 0 && port <= 65535, 'Invalid local socket port.')
    const host = match[1].replace(/^\[|\]$/g, '')
    assert(host === '*' || isIP(host), 'Socket inspection did not use numeric local addresses.')
    sockets.push({ pid, protocol: file.protocol, host, port, state: file.state || null })
    file = undefined
  }
  assert(!stdout || stdout.endsWith('\n'), 'Truncated socket inspection.')
  for (const line of stdout.split('\n')) {
    if (!line) continue
    const field = line[0], value = line.slice(1)
    if (field === 'p') {
      finish(); assert(pid === undefined || processHasFile, 'Socket process has no complete descriptor.')
      assert(/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)), 'Invalid socket owner PID.')
      pid = Number(value); processHasFile = false
    } else if (field === 'f') { finish(); assert(pid && /^\d+[rwu]?$/.test(value), 'Missing socket owner or file descriptor.'); file = {}; processHasFile = true }
    else if (field === 'P') { assert(file && !file.protocol, 'Ambiguous socket protocol.'); file.protocol = value }
    else if (field === 'n') { assert(file && !file.endpoint, 'Ambiguous socket endpoint.'); file.endpoint = value }
    else if (field === 'T') { assert(file, 'Socket state without a descriptor.'); if (value.startsWith('ST=')) { assert(!file.state && value.length > 3, 'Ambiguous socket state.'); file.state = value.slice(3) } }
    else throw new Error('Unrecognized socket inspection field.')
  }
  finish()
  assert(pid === undefined || processHasFile, 'Socket process has no complete descriptor.')
  return sockets
}
function validateSockets(sockets) {
  assert(Array.isArray(sockets) && sockets.every((socket) => socket && Number.isSafeInteger(socket.pid) && socket.pid > 0 && ['TCP', 'UDP'].includes(socket.protocol) && typeof socket.host === 'string' && socket.host && Number.isSafeInteger(socket.port) && socket.port >= 0 && socket.port <= 65535 && (socket.protocol !== 'TCP' || (typeof socket.state === 'string' && socket.state))), 'Invalid socket observation.')
}
function validatePorts(ports) {
  assert(Array.isArray(ports) && ports.length > 0 && ports.length <= 128 && ports.every((port) => Number.isSafeInteger(port) && port > 0 && port <= 65535), 'Invalid observed QA port set.')
}
export function mihomoPortsReleased(sockets, ports) {
  validateSockets(sockets); validatePorts(ports)
  // Include bound/connected UDP and accepted TCP descriptors, not just LISTEN.
  // A connection whose *remote* port matches is not a retained local listener.
  return !sockets.some((socket) => ports.includes(socket.port))
}
export function assertMihomoListeners(sockets, identity, { mixedPort, controllerPort }) {
  validateSockets(sockets); validatePorts([mixedPort, controllerPort])
  assert(mixedPort !== controllerPort && Number.isSafeInteger(identity?.pid) && identity.pid > 0, 'Invalid Mihomo listener identity.')
  for (const port of [mixedPort, controllerPort]) {
    const bound = sockets.filter((socket) => socket.port === port)
    assert(bound.some((socket) => socket.protocol === 'TCP' && socket.state === 'LISTEN' && socket.host === '127.0.0.1'), 'Mihomo mixed/controller TCP listener is missing.')
    assert(bound.every((socket) => socket.pid === identity.pid && ['127.0.0.1', '::1'].includes(socket.host)), 'Mihomo mixed/controller socket has a foreign owner or non-loopback binding.')
  }
}
async function internetSockets({ pid, ports } = {}) {
  let selection
  if (pid !== undefined) {
    assert(Number.isSafeInteger(pid) && pid > 0 && ports === undefined, 'Invalid QA socket process selector.')
    selection = ['-a', '-p', String(pid), '-i']
  } else { validatePorts(ports); const list = [...new Set(ports)].join(','); selection = [`-iTCP:${list}`, `-iUDP:${list}`] }
  let output
  try {
    output = await execFileAsync('/usr/sbin/lsof', ['-nP', ...selection, '-FpfPnT', '-Ts'], { timeout: 3000, maxBuffer: 128 * 1024, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LC_ALL: 'C' } })
  } catch (error) {
    if (error.code === 1 && !String(error.stdout || '').trim() && !String(error.stderr || '').trim()) return []
    throw new Error('Unable to inspect Mihomo TCP/UDP socket ownership.')
  }
  assert(output.stdout.trim() && !output.stderr.trim(), 'Socket inspection reported an incomplete observation.')
  return parseInternetSockets(output.stdout)
}
const appIdentities = new WeakMap()
async function assertNativeOwner(child, home, port) {
  assert(child && child.exitCode === null && child.signalCode === null && child.pid > 0, 'Owned QA app already exited.')
  const [pids, txt, env, rows] = await Promise.all([
    listeners(port),
    execFileAsync('/usr/sbin/lsof', ['-nP', '-a', '-p', String(child.pid), '-d', 'txt', '-Fn']),
    execFileAsync('/bin/ps', ['eww', '-p', String(child.pid), '-o', 'command='], { maxBuffer: 2 * 1024 * 1024 }),
    processRows(),
  ])
  const row = rows.find((r) => r.pid === child.pid)
  assert(row?.uid === process.getuid() && row.parentPID === process.pid, 'QA app process ownership changed.')
  const original = appIdentities.get(child)
  assert(!original || original === row.started, 'QA app PID was reused.')
  appIdentities.set(child, row.started)
  assert(pids.length === 1 && pids[0] === child.pid, 'QA API listener does not belong exclusively to the spawned app.')
  assert(txt.stdout.split('\n').includes(`n${NATIVE_EXECUTABLE}`), 'QA app is not the exact canonical installed executable.')
  assert([...env.stdout.matchAll(/(?:^|\s)HOME=([^\s]+)/g)].some((m) => m[1] === home), 'Native listener is not using the fresh isolated HOME.')
}
export function ownedRuntimeMatches(row, identity) {
  return !!identity && row.pid === identity.pid && row.uid === identity.uid && row.started === identity.started && row.command === identity.command
}
function isChromeCommand(command) {
  return command === CHROME_EXECUTABLE || command.startsWith(`${CHROME_EXECUTABLE} `) || command.startsWith('/Applications/Google Chrome.app/Contents/Frameworks/')
}
function exactUserDataDir(command, userDataDir) {
  const token = ` --user-data-dir=${userDataDir}`
  return command.includes(`${token} `) || command.endsWith(token)
}
// The ledger is immutable by PID. A response PID alone is never an authority to
// signal a process. Only the guarded launcher record can establish a new root;
// descendants must have a still-matching, already verified ancestor.
export function registerOwnedBrowsers(rows, ledger, records, { appPID, userDataDir, uid }) {
  for (const record of records) {
    const row = rows.find((candidate) => candidate.pid === record.pid)
    if (row && !ledger.has(row.pid) && row.uid === uid && record.uid === uid && record.parentPID === appPID && row.started === record.started && row.command.startsWith(`${CHROME_EXECUTABLE} `) && exactUserDataDir(row.command, userDataDir)) ledger.set(row.pid, { ...row })
  }
  for (let changed = true; changed;) {
    changed = false
    const verified = new Set(rows.filter((row) => ownedRuntimeMatches(row, ledger.get(row.pid))).map((row) => row.pid))
    for (const row of rows) {
      if (!ledger.has(row.pid) && row.uid === uid && isChromeCommand(row.command) && verified.has(row.parentPID)) {
        ledger.set(row.pid, { ...row }); changed = true
      }
    }
  }
}
export async function readLauncherRecords(identityDir) {
  const names = await readdir(identityDir)
  assert(names.length <= 32, 'Unexpected number of QA launcher identity records.')
  const records = []
  for (const name of names) {
    assert(/^[1-9]\d*$/.test(name), 'Unexpected QA launcher identity filename.')
    const path = join(identityDir, name)
    const info = await lstat(path)
    assert(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid() && (info.mode & 0o077) === 0 && info.size <= 512, 'QA launcher identity record is not private or bounded.')
    const lines = (await readFile(path, 'utf8')).trim().split('\n').map((line) => line.trim().replace(/\s+/g, ' '))
    // The collector can race the launcher's single write. No incomplete record
    // authorizes a process; a later poll reads the completed record after exec.
    if (lines.length !== 5 || lines[4] !== 'latitude-native-launch-v1') continue
    assert(lines[0] === name && /^\d+$/.test(lines[1]) && /^\d+$/.test(lines[3]) && lines[2].length >= 20, 'Invalid QA launcher identity record.')
    records.push({ pid: Number(lines[0]), uid: Number(lines[1]), started: lines[2], parentPID: Number(lines[3]) })
  }
  return records
}
export function assertRuntimeExecutablePaths(row, paths, connector = 'xray') {
  const executable = connectorStack(connector).executable
  assert(Array.isArray(paths) && paths.some((path) => typeof path === 'string' && (path === executable || path.startsWith('/Applications/Google Chrome.app/Contents/')) && (row.command === path || row.command.startsWith(`${path} `))), 'Owned runtime executable could not be re-verified; refusing to signal it.')
}
async function assertRuntimeExecutable(row, connector) {
  const { stdout } = await execFileAsync('/usr/sbin/lsof', ['-nP', '-a', '-p', String(row.pid), '-d', 'txt', '-Fn'])
  const paths = stdout.split('\n').filter((line) => line.startsWith('n')).map((line) => line.slice(1))
  assertRuntimeExecutablePaths(row, paths, connector)
}
async function availablePort() {
  const server = createServer()
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const port = server.address().port
  await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()))
  return port
}
export async function requestJSON(url, init = {}, timeoutMs = API_TIMEOUT, signal) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]) })
  const chunks = []
  let bytes = 0
  for await (const chunk of response.body || []) {
    bytes += chunk.length
    assert(bytes <= 2 * 1024 * 1024, 'JSON response exceeded the QA bound.')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`Endpoint returned non-JSON (HTTP ${response.status}).`) }
  return { status: response.status, ok: response.ok, data }
}
async function connectCDP(debugPort, browserPID, signal) {
  const owners = await listeners(debugPort)
  assert(owners.length === 1 && owners[0] === browserPID, 'CDP listener ownership changed.')
  const target = await waitFor('Owned Chrome page target', async () => {
    const r = await requestJSON(`http://127.0.0.1:${debugPort}/json/list`)
    assert(r.ok && Array.isArray(r.data), 'Invalid Chrome target list.')
    return r.data.find((item) => item.type === 'page' && item.url === 'about:blank' && item.webSocketDebuggerUrl) || false
  }, API_TIMEOUT, signal)
  assertDebugURL(target.webSocketDebuggerUrl, debugPort, true)
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((done, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error('CDP connection timed out.')) }, API_TIMEOUT)
    ws.addEventListener('open', () => { clearTimeout(timer); done() }, { once: true })
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed.')) }, { once: true })
  })
  let sequence = 0
  const pending = new Map()
  const events = []
  const requestURLs = new Map()
  function rejectPending() {
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('Owned Chrome CDP connection closed.')) }
    pending.clear()
  }
  ws.addEventListener('close', rejectPending)
  ws.addEventListener('error', rejectPending)
  ws.addEventListener('message', ({ data }) => {
    if (String(data).length > 8 * 1024 * 1024) { ws.close(); return }
    let m
    try { m = JSON.parse(String(data)) } catch { return }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer)
      if (m.error) p.reject(new Error(`CDP command failed: ${m.error.message || 'unknown'}`))
      else p.resolve(m.result || {})
    } else if (m.method) {
      if (m.method === 'Network.requestWillBeSent') {
        requestURLs.set(m.params.requestId, m.params.request.url)
        if (requestURLs.size > 400) requestURLs.delete(requestURLs.keys().next().value)
      }
      events.push(m)
      if (events.length > 800) events.shift()
    }
  })
  const cdp = {
    call(method, params = {}, timeoutMs = API_TIMEOUT) {
      const id = ++sequence
      return new Promise((resolveCall, rejectCall) => {
        const timer = setTimeout(() => { pending.delete(id); rejectCall(new Error(`CDP ${method} timed out.`)) }, timeoutMs)
        pending.set(id, { resolve: resolveCall, reject: rejectCall, timer })
        try { ws.send(JSON.stringify({ id, method, params })) } catch (error) { pending.delete(id); clearTimeout(timer); rejectCall(error) }
      })
    },
    async navigate(url) {
      url = canonicalNavigationURL(url)
      events.length = 0
      const navigation = await cdp.call('Page.navigate', { url }, NAV_TIMEOUT)
      assert(!navigation.errorText, `Chrome navigation failed: ${navigation.errorText}`)
      const received = await waitFor('Chrome main-frame response for the exact requested URL', () => events.find((e) => matchesMainFrameResponse(e, navigation, url)), NAV_TIMEOUT, signal)
      const response = received.params.response
      assert(response.status === 200, `Chrome target returned HTTP ${response.status}.`)
      assert(!response.fromDiskCache && !response.fromServiceWorker, 'Chrome target was not a fresh network response.')
      await waitFor('Chrome network body completion', () => events.some((e) => e.method === 'Network.loadingFinished' && e.params.requestId === received.params.requestId), NAV_TIMEOUT, signal)
      const body = await cdp.call('Network.getResponseBody', { requestId: received.params.requestId })
      const text = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body
      assert(typeof text === 'string' && text.length > 0 && text.length <= 64 * 1024, 'Missing or oversized Chrome response body.')
      return { response, text }
    },
    async navigateBlocked(url) {
      url = canonicalNavigationURL(url)
      events.length = 0
      const result = await cdp.call('Page.navigate', { url }, NAV_TIMEOUT)
      const errorText = result.errorText || (await waitFor('Chrome explicit network rejection', () => events.find((e) => e.method === 'Network.loadingFailed' && requestURLs.get(e.params.requestId) === url), NAV_TIMEOUT, signal)).params.errorText
      assert(/^net::ERR_(SOCKS_CONNECTION_FAILED|PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED|CONNECTION_CLOSED|CONNECTION_RESET|CONNECTION_REFUSED)$/.test(errorText), `Expected explicit proxy-path rejection, got ${errorText || 'no error'}.`)
      assert(!events.some((e) => e.method === 'Network.responseReceived' && e.params.response.url === url && e.params.response.status === 200), 'Blocked browser navigation unexpectedly succeeded.')
      return errorText
    },
    close() { rejectPending(); ws.close() },
  }
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await cdp.call('Network.enable')
  await cdp.call('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.call('Network.setBypassServiceWorker', { bypass: true })
  return cdp
}

export async function runNativeProxyQA({ connector = 'xray', backgroundOverlap = false } = {}) {
  nativeProxyOptions({ connector, backgroundOverlap })
  const stack = connectorStack(connector)
  assert(process.platform === 'darwin', 'Native proxy QA currently runs only on macOS.')
  assert(Number(process.versions.node.split('.')[0]) >= 22, 'Node 22+ is required.')
  await Promise.all([NATIVE_EXECUTABLE, CHROME_EXECUTABLE, ...stack.requiredExecutables, '/usr/bin/sqlite3'].map((path) => access(path, fsConstants.X_OK)))
  const bundledCore = await lstat(stack.executable)
  assert(bundledCore.isFile() && !bundledCore.isSymbolicLink() && await realpath(stack.executable) === stack.executable, 'The selected core must be the exact regular executable in the canonical installed bundle.')
  const osHome = await realpath(process.env.HOME || '')
  assert(osHome && !osHome.startsWith('/private/tmp/') && !osHome.startsWith('/tmp/'), 'Run the harness from the normal OS environment; it creates its own isolated HOME.')
  const qaHome = await mkdtemp(join(await realpath('/tmp'), 'latitude-native-qa-proxy-'))
  const stateRoot = join(qaHome, 'Library/Application Support/latitude-browser')
  const userDataDir = join(stateRoot, 'data/native-qa/chrome-profile')
  const identityDir = join(qaHome, 'launch-identities')
  const runID = qaHome.split('/').pop()
  const outputDir = join(OUTPUT_ROOT, runID)
  await ensurePrivateDirectory(await realpath(REPO_ROOT), OUTPUT_ROOT)
  await mkdir(outputDir, { mode: 0o700 })
  assert(await realpath(outputDir) === outputDir && await realpath(qaHome) === qaHome, 'QA directories must not be symlinks.')
  await chmod(outputDir, 0o700)
  const secrets = []
  const checks = []
  const cleanupErrors = []
  const report = {
    script: 'verify-native-proxy.mjs', generatedAt: new Date().toISOString(), status: 'running',
    environment: { platform: process.platform, arch: process.arch, qaHome, stateRoot, outputDir, canonicalExecutable: NATIVE_EXECUTABLE, productionDataAccess: false, installedAppModified: false, connector, bundledCoreExecutable: stack.executable, protocol: 'socks5', chromeProxyScheme: stack.chromeScheme, browser: 'Google Chrome', osTrustServicesShared: true, backgroundOverlapRequested: backgroundOverlap },
    boundary: 'Real installed app and Chrome, with a self-created local authenticated upstream. Same-machine forwarding proves this tested proxy path, not a remote residential exit, fingerprint protection, or absence of DNS/WebRTC leaks. It does not install current source changes.',
    checks, cleanupErrors,
  }
  const apiKey = randomBytes(32).toString('hex')
  secrets.push(apiKey)
  let fixture, app, appExit, appStartedAt, apiPort, api, profileID, cdp, browserPID, debugPort, bridgePort, bridgeIdentity, lastStoppedBridge, appLogs = ''
  const ownedBrowserIdentities = new Map()
  const ownedBridgeIdentities = new Map()
  const bridgeResources = new Map()
  const bridgePorts = new Set()
  const abort = new AbortController()
  let cleaningUp = false
  let ownershipTimer, collectingOwnership
  const interrupted = () => { report.interrupted = true; abort.abort(); cdp?.close(); void fixture?.close() }
  process.on('SIGINT', interrupted)
  process.on('SIGTERM', interrupted)
  const qaBridges = (rows) => rows.filter((r) => r.uid === process.getuid() && managedBridgeCommand(r.command, connector, stateRoot))
  const hasQAKernelPath = (row) => ['_xray', '_singbox', '_mihomo'].some((directory) => row.command.includes(`${stateRoot}/data/${directory}/`))
  const bridgeContext = () => ({ connector, stateRoot, appPID: app?.pid, appStarted: appIdentities.get(app), uid: process.getuid() })
  const qaAppAlive = (rows) => app?.exitCode === null && app?.signalCode === null && rows.some((row) => row.pid === app.pid && row.uid === process.getuid() && row.parentPID === process.pid && row.started === appIdentities.get(app) && row.command === NATIVE_EXECUTABLE)
  async function collectOwnedRuntimes() {
    if (!app?.pid) return
    if (collectingOwnership) return collectingOwnership
    collectingOwnership = (async () => {
      const rows = await processRows()
      registerOwnedBrowsers(rows, ownedBrowserIdentities, await readLauncherRecords(identityDir), { appPID: app.pid, userDataDir, uid: process.getuid() })
      registerOwnedBridges(rows, ownedBridgeIdentities, bridgeContext())
      if (connector === 'mihomo') for (const identity of ownedBridgeIdentities.values()) {
        if (!rows.some((row) => ownedRuntimeMatches(row, identity))) continue
        let resource = bridgeResources.get(identity.pid)
        if (!resource) {
          const ports = await readMihomoBridgePorts(qaHome, identity.command)
          resource = Object.freeze({ ...ports, observedPorts: new Set([ports.mixedPort, ports.controllerPort]), udpPorts: new Set() })
          bridgeResources.set(identity.pid, resource)
          for (const port of resource.observedPorts) bridgePorts.add(port)
        }
        const sockets = await internetSockets({ pid: identity.pid })
        // Do not attach a recycled PID's sockets to the old immutable generation.
        if (!(await processRows()).some((row) => ownedRuntimeMatches(row, identity))) continue
        for (const socket of sockets) if (socket.pid === identity.pid && socket.protocol === 'UDP' && socket.port > 0) {
          resource.udpPorts.add(socket.port); resource.observedPorts.add(socket.port); bridgePorts.add(socket.port)
        }
      }
    })()
    try { await collectingOwnership } finally { collectingOwnership = null }
  }
  const pass = (id, evidence = {}) => { checks.push({ id, status: 'pass', evidence }); console.log(`PASS ${id}`) }
  async function check(id, operation) {
    try { assert(!abort.signal.aborted, 'Native QA interrupted.'); const evidence = await operation(); assert(!abort.signal.aborted, 'Native QA interrupted.'); pass(id, evidence || {}); return evidence }
    catch (error) { checks.push({ id, status: 'fail', error: safeError(error, secrets) }); throw error }
  }
  async function profileStatus() {
    const r = await api(`/api/profiles/${encodeURIComponent(profileID)}/status`)
    return ownedProfileResponse(r, profileID)
  }
  async function captureBrowserOwnership(profile) {
    assert(profile.profileId === profileID && resolve(profile.userDataDir) === userDataDir, 'Runtime profile escaped the owned profile/user-data-dir.')
    assert(profile.networkMode === 'proxy' && profile.proxyId === PROXY_ID, 'Runtime changed the selected ordinary proxy binding.')
    const nextPID = Number(profile.pid), nextDebugPort = Number(profile.debugPort)
    assert(Number.isInteger(nextPID) && nextPID > 0 && Number.isInteger(nextDebugPort) && nextDebugPort > 0, 'Runtime omitted actual Chrome PID/debug port.')
    const rows = await processRows()
    const chrome = rows.find((row) => row.pid === nextPID)
    assert(chrome?.uid === process.getuid() && chrome.command.startsWith(`${CHROME_EXECUTABLE} `) && exactUserDataDir(chrome.command, userDataDir), 'Runtime PID was not Chrome with the exact QA user-data-dir.')
    assert(chrome.parentPID === app.pid, 'Chrome was not launched by this QA app.')
    await collectOwnedRuntimes()
    assert(ownedRuntimeMatches(chrome, ownedBrowserIdentities.get(nextPID)), 'Chrome has no matching immutable QA launcher identity.')
    const debugOwners = await listeners(nextDebugPort)
    assert(debugOwners.length === 1 && debugOwners[0] === nextPID, 'Chrome does not exclusively own the returned debug listener.')
    const nextBridgePort = managedChromeProxyPort(profile.lastLaunchArgs, connector, fixture.port)
    assert(managedChromeProxyPort(chrome.command.split(/\s+/), connector, fixture.port) === nextBridgePort, 'Actual Chrome command disagrees with the selected API bridge.')
    const bridgePIDs = await listeners(nextBridgePort)
    assert(bridgePIDs.length === 1, 'Managed bridge did not have one listener owner.')
    const nextBridgeIdentity = rows.find((row) => row.pid === bridgePIDs[0])
    assert(nextBridgeIdentity?.uid === process.getuid() && nextBridgeIdentity.parentPID === app.pid && managedBridgeCommand(nextBridgeIdentity.command, connector, stateRoot), 'Managed bridge is not the exact QA-owned selected core process.')
    assert(ownedRuntimeMatches(nextBridgeIdentity, ownedBridgeIdentities.get(nextBridgeIdentity.pid)), 'Managed bridge PID identity changed or was not independently recorded.')
    await assertRuntimeExecutable(nextBridgeIdentity, connector)
    assertSelectedKernelOnly(rows, connector, app.pid)
    let portsEvidence = {}
    if (connector === 'mihomo') {
      const info = managedBridgeCommand(nextBridgeIdentity.command, connector, stateRoot)
      const expectedKey = createHash('sha256').update(`${fixture.proxyURL.trim()}\0mihomo`).digest('hex')
      assert(info.key === expectedKey, 'Mihomo bridge does not match the selected authenticated fixture node.')
      const resource = bridgeResources.get(nextBridgeIdentity.pid)
      assert(resource && resource.mixedPort === nextBridgePort && ![fixture.port, apiPort, nextDebugPort].includes(resource.controllerPort), 'Mihomo ports do not match this owned runtime generation.')
      assertMihomoListeners(await internetSockets({ ports: [resource.mixedPort, resource.controllerPort] }), nextBridgeIdentity, resource)
      if (lastStoppedBridge) assertNewMihomoGeneration(lastStoppedBridge, nextBridgeIdentity)
      assert((await processRows()).some((row) => ownedRuntimeMatches(row, nextBridgeIdentity)), 'Mihomo identity changed during listener verification.')
      portsEvidence = { controllerPort: resource.controllerPort, observedUDPPorts: [...resource.udpPorts], ...(lastStoppedBridge ? { freshMihomoGenerationAfterStop: true } : {}) }
    }
    // Assign response identities only after the complete ownership validation.
    browserPID = nextPID; debugPort = nextDebugPort; bridgePort = nextBridgePort; bridgeIdentity = ownedBridgeIdentities.get(nextBridgeIdentity.pid)
    bridgePorts.add(bridgePort)
    return { browserPID, debugPort, bridgePID: bridgeIdentity.pid, bridgePort, ...portsEvidence, proxySelectionPreserved: true, qaUserDataDir: true, exactManagedKernel: connector }
  }
  async function startSession() {
    const r = await api('/api/runtime/session', { method: 'POST', body: { profileId: profileID, skipDefaultStartUrls: true, startUrls: ['about:blank'], timeoutMs: 60_000 }, timeoutMs: 75_000 })
    assert(r.status === 200 && r.data.ok === true && r.data.ready === true, `Runtime did not become ready (HTTP ${r.status}; ${safeError(r.data.error || 'ready=false', secrets)}).`)
    const profile = r.data.profile || r.data
    assert(profile.running === true && profile.debugReady === true, 'Runtime reported ready without running/debugReady.')
    assertDebugURL(r.data.directDebugUrl, Number(profile.debugPort))
    const evidence = await captureBrowserOwnership(profile)
    cdp = await connectCDP(debugPort, browserPID, abort.signal)
    const version = await cdp.call('Browser.getVersion')
    report.environment.chromeVersion = version.product
    return evidence
  }
  async function witness(label) {
    const nonce = randomBytes(12).toString('hex')
    const url = fixture.witnessURL(nonce)
    const before = fixture.stats().witnessForwarded
    const received = await cdp.navigate(url)
    assert(received.text.includes(fixture.witnessToken) && received.text.includes(nonce), 'Browser did not receive the unique upstream witness.')
    await waitFor('Witness DOM rendered in Chrome', async () => {
      const r = await cdp.call('Runtime.evaluate', { expression: '({url:location.href,text:document.body?.innerText || ""})', returnByValue: true })
      return r.result?.value?.url === url && r.result?.value?.text.includes(fixture.witnessToken) && r.result?.value?.text.includes(nonce)
    }, API_TIMEOUT, abort.signal)
    assert(fixture.stats().witnessForwarded > before, 'Witness was not forwarded through the authenticated upstream.')
    const image = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    assert(typeof image.data === 'string' && image.data.length > 100, 'Chrome screenshot is empty.')
    await writeFile(join(outputDir, `${label}.png`), Buffer.from(image.data, 'base64'), { mode: 0o600 })
    return { actualChromeDOM: true, upstreamWitnessMatched: true, nonceMatched: true, screenshot: `${label}.png`, HTTPStatus: received.response.status }
  }
  async function exitCheck() {
    const reference = await fixture.readReferenceExitIP()
    assert(isIP(reference), 'Reference target did not return a valid exit IP.')
    secrets.push(reference)
    const before = fixture.stats().externalForwarded
    const url = `https://api.ipify.org?format=json&latitude_qa=${randomBytes(12).toString('hex')}`
    const received = await cdp.navigate(url)
    let payload
    try { payload = JSON.parse(received.text) } catch { throw new Error('Actual Chrome HTTPS target did not return JSON.') }
    assert(isIP(payload?.ip) && payload.ip === reference, 'Browser exit IP did not match the fixture forwarding exit.')
    secrets.push(payload.ip)
    assert(received.response.securityState === 'secure', 'Browser HTTPS response was not classified secure.')
    assert(fixture.stats().externalForwarded > before, 'External target was not observed through the authenticated upstream.')
    return { actualChromeHTTPS: true, expectedForwarderExitMatched: true, validIP: true, ipRecorded: false, upstreamTunnelObserved: true, tlsSecurityState: received.response.securityState }
  }
  async function stopProfile() {
    await collectOwnedRuntimes()
    const stoppingBridge = bridgeIdentity, stoppingResource = bridgeResources.get(stoppingBridge?.pid)
    if (cdp) { cdp.close(); cdp = null }
    const r = await api(`/api/profiles/${encodeURIComponent(profileID)}/stop`, { method: 'POST' })
    assert(r.status === 200 && r.data.ok === true && r.data.stopped === true, `Profile stop failed (HTTP ${r.status}).`)
    await waitFor('Chrome process and debug listener release', async () => {
      const profile = await profileStatus()
      const rows = await processRows()
      const stillOwned = rows.some((row) => row.command.includes(userDataDir) || ownedBrowserIdentities.get(row.pid)?.started === row.started)
      return profile.running === false && !stillOwned && (!debugPort || !(await listeners(debugPort)).length)
    }, API_TIMEOUT, cleaningUp ? undefined : abort.signal)
    let bridgeRelease = {}
    if (connector === 'mihomo') {
      assert(stoppingBridge && stoppingResource && ownedBridgeIdentities.get(stoppingBridge.pid) === stoppingBridge, 'Missing immutable Mihomo generation for product stop verification.')
      bridgeRelease = await waitForMihomoRelease({ signal: cleaningUp ? undefined : abort.signal, inspect: async () => {
        const ports = [...stoppingResource.observedPorts]
        const sockets = await internetSockets({ ports })
        const rows = await processRows()
        return { appAlive: qaAppAlive(rows), generationExited: mihomoGenerationExited(rows, stoppingBridge), portsReleased: mihomoPortsReleased(sockets, ports) }
      } })
      lastStoppedBridge = stoppingBridge
      bridgeRelease = { ...bridgeRelease, bridgePID: stoppingBridge.pid, mixedPort: stoppingResource.mixedPort, controllerPort: stoppingResource.controllerPort, observedUDPPorts: [...stoppingResource.udpPorts], releasePolicy: stack.release }
    }
    return { profileStopped: true, chromeProcessesExited: true, debugListenerReleased: true, ...bridgeRelease }
  }
  try {
    report.environment.nativeExecutableSHA256 = await fileHash(NATIVE_EXECUTABLE)
    report.environment.bundledCoreSHA256 = await fileHash(stack.executable)
    const { stdout: nativeVersion } = await execFileAsync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', '/Applications/Latitude Browser.app/Contents/Info.plist'])
    report.environment.nativeVersion = nativeVersion.trim()
    const { stdout: sourceHead } = await execFileAsync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT })
    report.environment.sourceHead = sourceHead.trim()
    const { stdout: dirty } = await execFileAsync('/usr/bin/git', ['status', '--porcelain'], { cwd: REPO_ROOT })
    report.environment.sourceDirty = dirty.trim().length > 0
    report.environment.installedBuildMatchesCurrentSource = 'not_verified'
    report.environment.verifierSHA256 = await fileHash(fileURLToPath(import.meta.url))
    report.environment.fixtureSHA256 = await fileHash(join(dirname(fileURLToPath(import.meta.url)), 'native-proxy-fixture.mjs'))
    fixture = await createProxyFixture()
    secrets.push(fixture.proxyURL, new URL(fixture.proxyURL).username, new URL(fixture.proxyURL).password)
    apiPort = await availablePort()
    const launcherDir = join(qaHome, 'qa-core')
    for (const path of [stateRoot, userDataDir, launcherDir, identityDir, join(stateRoot, 'chrome'), join(qaHome, 'tmp')]) await ensurePrivateDirectory(qaHome, path)
    const launcher = join(launcherDir, 'chrome')
    await writeFile(launcher, chromeLauncherSource({ userDataDir, osHome, identityDir }), { mode: 0o700, flag: 'wx' })
    await writeFile(join(stateRoot, 'proxies.yaml'), 'proxies: []\n', { mode: 0o600, flag: 'wx' })
    const config = {
      database: { type: 'sqlite', sqlite: { path: 'data/app.db' } },
      app: { name: 'Latitude Browser', window: { width: 1200, height: 800, min_width: 1200, min_height: 700 } },
      logging: { level: 'warn', file_enabled: false, interceptor: { enabled: false, log_parameters: false, log_results: false } },
      browser: {
        user_data_root: 'data', core_root: launcherDir, default_connector_type: connector, default_core_id: CORE_ID,
        cores: [{ core_id: CORE_ID, core_name: 'Native QA Google Chrome', core_path: launcherDir, is_default: true }],
        proxies: [{ proxy_id: PROXY_ID, proxy_name: 'Native QA authenticated upstream', proxy_config: fixture.proxyURL, preferred_kernel: connector }],
        profiles: [], default_fingerprint_args: [], default_start_urls: [], restore_last_session: false,
        default_launch_args: ['--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking', '--disable-component-update', '--disable-quic', '--disable-extensions', '--disable-breakpad', '--disable-crash-reporter', '--window-size=1100,760'],
        ...(connector === 'mihomo' ? { clash_binary_path: stack.executable } : { xray_binary_path: XRAY_EXECUTABLE, singbox_binary_path: SING_BOX_EXECUTABLE }),
        start_ready_timeout_ms: 5000, start_stable_window_ms: 1200,
      },
      // The app's delayed background speed check is restricted to this owned
      // witness as well; no default public targets or production proxies are used.
      proxy_check: { speed_target_id: 'native-qa-speed', ip_health_target_id: 'native-qa-ip', targets: [
        { id: 'native-qa-speed', name: 'Native QA local witness', type: 'speed', url: fixture.witnessURL('background-speed'), method: 'GET', timeout_ms: 5000, expected_status: [200] },
        { id: 'native-qa-ip', name: 'Native QA exit', type: 'ip_health', url: 'https://api.ipify.org?format=json', parser: 'ipify', method: 'GET', timeout_ms: 10000, expected_status: [200] },
      ] },
      launch_server: { port: apiPort, auth: { enabled: true, api_key: apiKey, header: API_HEADER } },
      automation: { enabled: false },
    }
    await writeFile(join(stateRoot, 'config.yaml'), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    // Minimal child environment prevents inherited proxy settings/credentials.
    const env = { HOME: qaHome, TMPDIR: join(qaHome, 'tmp'), XDG_CONFIG_HOME: join(qaHome, '.config'), XDG_DATA_HOME: join(qaHome, '.local/share'), XDG_CACHE_HOME: join(qaHome, '.cache'), PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8', USER: process.env.USER || '', LOGNAME: process.env.LOGNAME || '' }
    app = spawn(NATIVE_EXECUTABLE, [], { cwd: qaHome, env, stdio: ['ignore', 'pipe', 'pipe'] })
    appStartedAt = performance.now()
    appExit = new Promise((done) => { app.once('exit', (code, signal) => done({ code, signal })); app.once('error', () => done({ error: true })) })
    for (const stream of [app.stdout, app.stderr]) stream.on('data', (data) => { appLogs = (appLogs + data.toString()).slice(-128 * 1024) })
    // Collect independently of the runtime API: it may time out or the app may
    // exit after exec, before returning a Chrome PID. Never queue overlapping ps.
    ownershipTimer = setInterval(() => {
      void collectOwnedRuntimes().catch((error) => {
        if (!report.ownershipMonitorError) {
          report.ownershipMonitorError = safeError(error, secrets)
          cleanupErrors.push(report.ownershipMonitorError)
        }
      })
    }, 500)
    ownershipTimer.unref()
    const baseURL = `http://127.0.0.1:${apiPort}`
    api = async (path, { method = 'GET', body, timeoutMs = API_TIMEOUT, authenticated = true } = {}) => {
      // Recheck before sending even a read-only authenticated request: never
      // disclose the QA key or mutate anything through a reused listener.
      await assertNativeOwner(app, qaHome, apiPort)
      return requestJSON(`${baseURL}${path}`, { method, headers: { Accept: 'application/json', ...(authenticated ? { [API_HEADER]: apiKey } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }, timeoutMs, cleaningUp ? undefined : abort.signal)
    }
    await check('safety.canonical-app-and-isolated-home', async () => {
      await waitFor('Spawned native QA app listener', () => assertNativeOwner(app, qaHome, apiPort).then(() => true), 30_000, abort.signal)
      const lock = JSON.parse(await readFile(join(stateRoot, 'app-instance.lock'), 'utf8'))
      assert(lock.pid === app.pid, 'Isolated single-instance lock does not belong to the spawned app.')
      const h = await api('/api/health')
      assert(h.ok && h.data.ok === true, 'QA app health failed.')
      return { nativePID: app.pid, listenerPort: apiPort, freshPrivateHOME: true, singleInstanceLockOwned: true, canonicalPathMatched: true }
    })
    await check('api.rejects-unauthenticated-mutation', async () => {
      const r = await api('/api/profiles', { method: 'POST', body: { profile: { profileName: 'Rejected native QA write' } }, authenticated: false })
      assert(r.status === 401 && r.data.ok === false, 'Unauthenticated profile mutation was not rejected.')
      return { HTTPStatus: r.status }
    })
    await check('profile.select-authenticated-pool-proxy', async () => {
      const r = await api('/api/profiles', { method: 'POST', body: { profile: { profileName: `Latitude native proxy QA ${runID}`, coreId: CORE_ID, userDataDir, networkMode: 'proxy', proxyId: PROXY_ID } } })
      // Save the returned id before assertions so partial creation is cleaned up.
      profileID = r.data.profileId || r.data.profile?.profileId
      assert(r.status === 201 && r.data.ok === true && typeof profileID === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(profileID), `QA profile creation failed (HTTP ${r.status}).`)
      const profile = r.data.profile || r.data
      assert(profile.networkMode === 'proxy' && profile.proxyId === PROXY_ID, 'Profile did not preserve the selected pool proxy.')
      return { selectedFromQAPool: true, authRequired: true, networkMode: profile.networkMode }
    })
    await check(`runtime.actual-chrome-and-${connector}`, startSession)
    await check('network.unique-upstream-witness', () => witness('witness-initial'))
    await check('network.browser-https-exit', exitCheck)
    await check('network.upstream-failure-no-direct-fallback', async () => {
      // Confirm the public endpoint still works independently of the blocked proxy.
      const reference = await fixture.readReferenceExitIP(); secrets.push(reference)
      assert(isIP(reference), 'Reference endpoint failed before fault injection.')
      fixture.setBlocked(true)
      const before = fixture.stats().blocked
      const error = await cdp.navigateBlocked(`https://api.ipify.org?format=json&latitude_qa=${randomBytes(12).toString('hex')}`)
      assert(fixture.stats().blocked > before, 'Fault injection did not observe a blocked upstream CONNECT.')
      const after = await fixture.readReferenceExitIP(); secrets.push(after)
      assert(isIP(after), 'External target was not independently reachable during proxy failure.')
      fixture.setBlocked(false)
      return { explicitBrowserError: error, blockedConnectObserved: true, targetIndependentlyReachable: true, noSuccessfulDirectResponse: true, timeoutCountedAsPass: false }
    })
    await check('network.retry-after-upstream-recovery', () => witness('witness-recovered'))
    await check('network.same-browser-https-recovery', async () => {
      const originalPID = browserPID
      const evidence = await exitCheck()
      const profile = await profileStatus()
      assert(profile.running === true && profile.pid === originalPID, 'HTTPS recovery was not tested in the same browser process.')
      return { ...evidence, sameBrowserPID: true }
    })
    await check('runtime.stop-before-restart', stopProfile)
    await check('runtime.restart-same-profile', startSession)
    await check('network.restarted-browser-witness', () => witness('witness-restarted'))
    await check('network.restarted-browser-https-exit', exitCheck)
    if (backgroundOverlap) await check('runtime.background-speed-overlap-setup', async () => {
      assert(await readQASpeedCompletion(qaHome) === '', 'Background speed already completed; this run cannot claim the requested overlap.')
      await waitFor('Controlled final-stop timing', () => performance.now() >= appStartedAt + 90_000, 95_000, abort.signal)
      const profile = await profileStatus()
      assert(profile.running === true && profile.pid === browserPID, 'Overlap setup lost the real restarted browser.')
      assert(await readQASpeedCompletion(qaHome) === '', 'Background speed completed before final stop; overlap was not exercised.')
      return { appAgeAtFinalStopMs: Math.round(performance.now() - appStartedAt), backgroundCompletionBeforeStop: false, sameRestartedBrowserRunning: true }
    })
    await check('runtime.final-stop-browser', stopProfile)
    if (connector === 'mihomo') await check('runtime.mihomo-all-bridge-pids-and-ports-release', async () => {
      assert(bridgePorts.size > 0, 'No Mihomo ports were recorded; release cannot be inferred.')
      const observation = await waitForMihomoRelease({ signal: abort.signal, inspect: async () => {
        await collectOwnedRuntimes()
        const ports = [...bridgePorts], sockets = await internetSockets({ ports }), rows = await processRows()
        const generationExited = !rows.some((row) => hasQAKernelPath(row)) && [...ownedBridgeIdentities.values()].every((identity) => mihomoGenerationExited(rows, identity))
        return { appAlive: qaAppAlive(rows), generationExited, portsReleased: mihomoPortsReleased(sockets, ports) }
      } })
      return { ...observation, releasePolicy: stack.release, allObservedGenerationsReleased: true, checkedPorts: [...bridgePorts] }
    })
    else await check('runtime.idle-bridge-pid-and-port-release', async () => {
      const observation = await waitForBridgeIdle({ signal: abort.signal, inspect: async () => {
        const [rows, speedCompletedAt] = await Promise.all([processRows(), readQASpeedCompletion(qaHome)])
        const owner = rows.find((row) => row.pid === app.pid)
        assert(app.exitCode === null && app.signalCode === null && owner?.uid === process.getuid() && owner.started === appIdentities.get(app), 'QA app exited during idle observation; shutdown is not normal idle release.')
        registerOwnedBridges(rows, ownedBridgeIdentities, bridgeContext())
        let released = !qaBridges(rows).length && !rows.some((row) => ownedBridgeIdentities.get(row.pid)?.started === row.started)
        for (const port of bridgePorts) if ((await listeners(port)).length) released = false
        assert(app.exitCode === null && app.signalCode === null, 'QA app exited before idle release could be verified.')
        return { released, speedCompletedAt, witnessForwarded: fixture.stats().witnessForwarded, bridgeGenerationCount: ownedBridgeIdentities.size }
      } })
      if (backgroundOverlap) assert(observation.elapsedMs > observation.allowedWindowMs && observation.activityObservations.some((activity) => activity.reasons.includes('background_speed_completed')), 'Requested background speed overlap did not exercise release beyond the old fixed window.')
      return { bridgePIDExited: true, bridgePortReleased: true, afterAppStopNotHarnessKill: true, ...observation }
    })
  } catch (error) {
    report.status = 'failed'; report.failure = safeError(error, secrets)
  } finally {
    cleaningUp = true
    clearInterval(ownershipTimer)
    try { await collectingOwnership; await collectOwnedRuntimes() } catch (error) { cleanupErrors.push(safeError(error, secrets)) }
    if (cdp) cdp.close()
    // Only the single id created in this fresh state is eligible for mutation.
    if (profileID && api && app?.exitCode === null && app?.signalCode === null) {
      try {
        const p = await profileStatus()
        if (p.running === true) await stopProfile()
        assert((await profileStatus()).running === false, 'Owned profile was not confirmed stopped before deletion.')
        const deleted = await api(`/api/profiles/${encodeURIComponent(profileID)}`, { method: 'DELETE' })
        assert(deleted.ok && deleted.data.deleted === true, 'Owned QA profile deletion failed.')
        const remaining = await api(`/api/profiles/${encodeURIComponent(profileID)}`)
        assert(remaining.status === 404, 'Owned QA profile remained after deletion.')
        pass('cleanup.only-created-profile-removed')
      } catch (error) { cleanupErrors.push(safeError(error, secrets)) }
    }
    // Faulted paths may retain runtimes. Record exact identities while the owning
    // app is alive, stop that app first (prevent bridge auto-restarts), then reap
    // only those already proven identities. Emergency cleanup never makes a
    // failed product stop/idle-release assertion pass; never use broad pkill.
    if (app?.pid && app.exitCode === null && app.signalCode === null) {
      try { await collectOwnedRuntimes() } catch (error) { cleanupErrors.push(safeError(error, secrets)) }
      try {
        // This terminates only the harness-spawned app after product stop checks;
        // it is not evidence for native GUI quit/confirmation behavior.
        app.kill('SIGTERM')
        let exited = await Promise.race([appExit, sleep(8000).then(() => false)])
        if (!exited && app.exitCode === null && app.signalCode === null) { app.kill('SIGKILL'); exited = await appExit }
        await waitFor('Owned QA app listener released', async () => !(await listeners(apiPort)).includes(app.pid), 10_000)
        pass('cleanup.owned-qa-app-exited', { nativePID: app.pid, APIListenerReleased: true, GUIQuitTested: false })
      } catch (error) { cleanupErrors.push(safeError(error, secrets)) }
    }
    // Read guarded launcher records again after parent exit: an in-flight
    // runtime start may only have exec'd during shutdown. Current PPID may be 1.
    try { await collectOwnedRuntimes() } catch (error) { cleanupErrors.push(safeError(error, secrets)) }
    try {
      const identities = new Map([...ownedBrowserIdentities, ...ownedBridgeIdentities])
      let leftovers = (await processRows()).filter((r) => r.uid === process.getuid() && ownedRuntimeMatches(r, identities.get(r.pid)))
      if (leftovers.length) {
        report.emergencyRuntimeCleanup = true
        for (const row of leftovers) {
          try { await assertRuntimeExecutable(row, connector); if ((await processRows()).some((r) => ownedRuntimeMatches(r, row))) process.kill(row.pid, 'SIGTERM') }
          catch (error) { if (error.code !== 'ESRCH' && (await processRows()).some((r) => ownedRuntimeMatches(r, row))) cleanupErrors.push(safeError(error, secrets)) }
        }
        await sleep(1000)
        leftovers = (await processRows()).filter((r) => r.uid === process.getuid() && ownedRuntimeMatches(r, identities.get(r.pid)))
        for (const row of leftovers) {
          try { await assertRuntimeExecutable(row, connector); if ((await processRows()).some((r) => ownedRuntimeMatches(r, row))) process.kill(row.pid, 'SIGKILL') }
          catch (error) { if (error.code !== 'ESRCH' && (await processRows()).some((r) => ownedRuntimeMatches(r, row))) cleanupErrors.push(safeError(error, secrets)) }
        }
        await waitFor('Previously proven QA runtime identities exited', async () => !(await processRows()).some((r) => ownedRuntimeMatches(r, identities.get(r.pid))), 8000)
      }
    } catch (error) { cleanupErrors.push(safeError(error, secrets)) }
    if (fixture) {
      report.fixtureBeforeClose = fixture.stats()
      try {
        await fixture.close()
        for (const port of fixture.ports) assert(!(await listeners(port)).length, 'Owned fixture listener remained after cleanup.')
        report.fixture = fixture.stats()
        assert(report.fixture.activeConnections === 0 && report.fixture.isClosed, 'Fixture still has active tunnels after cleanup.')
        pass('cleanup.fixture-sockets-and-listeners-closed')
      } catch (error) { cleanupErrors.push(safeError(error, secrets)) }
    }
    try {
      const rows = await processRows()
      assert(!rows.some((r) => r.command.includes(userDataDir) || hasQAKernelPath(r)), 'QA-owned browser or bridge processes remain after cleanup.')
      if (connector === 'mihomo' && bridgePorts.size) assert(mihomoPortsReleased(await internetSockets({ ports: [...bridgePorts] }), [...bridgePorts]), 'A recorded Mihomo TCP/UDP port remains bound after cleanup.')
      assert(await fileHash(NATIVE_EXECUTABLE) === report.environment.nativeExecutableSHA256, 'Installed executable changed during QA; this run did not install anything.')
      const coreAfter = await lstat(stack.executable)
      assert(coreAfter.isFile() && !coreAfter.isSymbolicLink() && await realpath(stack.executable) === stack.executable, 'Bundled selected core path changed during native QA.')
      report.environment.bundledCoreSHA256After = await fileHash(stack.executable)
      assert(report.environment.bundledCoreSHA256After === report.environment.bundledCoreSHA256, 'Bundled selected core changed during native QA.')
      pass('safety.no-owned-runtime-left-installed-app-unchanged', { bundledCoreUnchanged: true })
    } catch (error) { cleanupErrors.push(safeError(error, secrets)) }
    report.status = report.status === 'failed' || report.interrupted || cleanupErrors.length ? 'failed' : 'passed'
    process.removeListener('SIGINT', interrupted)
    process.removeListener('SIGTERM', interrupted)
    report.checkSummary = checks.reduce((r, c) => { r[c.status] = (r[c.status] || 0) + 1; return r }, {})
    report.appLogTail = safeError(appLogs.slice(-6000), secrets)
    report.evidencePath = join(outputDir, 'evidence.json')
    await writeFile(report.evidencePath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
    console.log(JSON.stringify({ status: report.status, checkSummary: report.checkSummary, cleanupErrors, failure: report.failure, evidencePath: report.evidencePath }, null, 2))
  }
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let options
  try { options = parseNativeProxyCLI(process.argv.slice(2)) }
  catch (error) { console.error(safeError(error)); process.exitCode = 2 }
  if (options?.mode === 'run') {
    runNativeProxyQA(options).then((report) => { if (report.status !== 'passed') process.exitCode = 1 }).catch((error) => { console.error(safeError(error)); process.exitCode = 1 })
  } else if (options?.mode === 'help') {
    console.log('Usage: node frontend/scripts/verify-native-proxy.mjs --run [--connector xray|mihomo] [--background-overlap]\n\nExplicitly starts the canonical installed Latitude Browser with a fresh private HOME, creates a local authenticated SOCKS5 fixture and real isolated Google Chrome, visits api.ipify.org using normal TLS, tests failure/recovery and stops only owned processes. Xray is the default; --connector mihomo selects only the bundled Mihomo with HTTP mixed-port and controller/TCP/UDP release checks. No external binary path is accepted. No production state is read or modified. Evidence: output/native-proxy/<run>/evidence.json.\nOptional --background-overlap is Xray-only: it delays only the owned final stop to exercise the app background speed round during idle release. Requires macOS sqlite3 for a read-only QA completion marker. Default/help does not start apps or contact the network.')
  }
}
