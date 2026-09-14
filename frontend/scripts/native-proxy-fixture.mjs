/**
 * Isolated native-Chrome QA fixture, not a general-purpose proxy.
 *
 * Only the fixture-owned witness origin and api.ipify.org:443 can be forwarded.
 * External dialing is deliberately IPv4-only: every DNS answer is checked and
 * the selected numeric address is pinned before connecting. No credentials or
 * observed exit addresses are logged or included in stats().
 */
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { Resolver } from 'node:dns/promises'
import { randomBytes, timingSafeEqual } from 'node:crypto'

const HOST = '127.0.0.1'
const WITNESS_HOST = 'latitude-native-proxy.invalid'
const EXIT_HOST = 'api.ipify.org'
const MAX_HANDSHAKE_BYTES = 64 * 1024
const MAX_REFERENCE_BYTES = 4096
const HANDSHAKE_TIMEOUT_MS = 5000
const CONNECT_TIMEOUT_MS = 10000
const IDLE_TIMEOUT_MS = 30000
const REFERENCE_TIMEOUT_MS = 15000
const MAX_CONNECTIONS = 64
const EMPTY = Buffer.alloc(0)

function fixtureError(code) {
  // Never propagate OS/network errors: they can contain addresses or credentials.
  const error = new Error(`Native proxy fixture: ${code}`)
  error.code = code
  return error
}

function isPublicIPv4(address) {
  if (!net.isIPv4(address)) return false
  const [a, b, c] = address.split('.').map(Number)
  // Conservative exclusion of non-global and special-use address space. Reject
  // an entire special block even when it has individual globally routed entries.
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  )
}

async function resolveExitAddress(signal) {
  if (signal.aborted) throw fixtureError('request_cancelled')
  // A resolver per request makes cancellation local to that request. Blocking
  // SOCKS tunnels must not cancel an independent readReferenceExitIP().
  const resolver = new Resolver({ timeout: 2500, tries: 2 })
  const cancel = () => resolver.cancel()
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const addresses = await resolver.resolve4(EXIT_HOST)
    if (signal.aborted) throw fixtureError('request_cancelled')
    if (!Array.isArray(addresses) || addresses.length === 0 || addresses.length > 32 ||
        !addresses.every(isPublicIPv4)) {
      throw fixtureError('exit_dns_not_public')
    }
    return addresses[0]
  } catch (error) {
    if (error?.code === 'exit_dns_not_public') throw error
    throw fixtureError(signal.aborted ? 'request_cancelled' : 'exit_dns_failed')
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}

function socksReply(code, upstream) {
  const reply = Buffer.from([5, code, 0, 1, 0, 0, 0, 0, 0, 0])
  if (code === 0 && upstream && net.isIPv4(upstream.localAddress)) {
    upstream.localAddress.split('.').forEach((octet, i) => { reply[4 + i] = Number(octet) })
    reply.writeUInt16BE(upstream.localPort, 8)
  }
  return reply
}

function equalCredential(actual, expected) {
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function escapeHTML(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function validNonce(nonce) {
  return typeof nonce === 'string' && nonce.length > 0 && Buffer.byteLength(nonce) <= 256
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = () => reject(fixtureError('loopback_listen_failed'))
    server.once('error', onError)
    server.listen({ host: HOST, port: 0, exclusive: true, backlog: MAX_CONNECTIONS }, () => {
      server.removeListener('error', onError)
      resolve(server.address().port)
    })
  })
}

function closeServer(server) {
  return new Promise((resolve) => {
    // close() also handles a listener still starting during failed setup.
    server.close(() => resolve())
    server.closeAllConnections?.()
  })
}

export async function createProxyFixture() {
  const username = Buffer.from(randomBytes(18).toString('hex'))
  const password = Buffer.from(randomBytes(24).toString('hex'))
  const witnessToken = `latitude-witness-${randomBytes(24).toString('hex')}`
  const sockets = new Set()
  const clients = new Set()
  const referenceControllers = new Set()
  const counters = {
    witnessForwarded: 0,
    externalForwarded: 0,
    blocked: 0,
    authFailures: 0,
    rejected: 0,
    activeConnections: 0,
  }
  let blocked = false
  let closed = false
  let closePromise
  let originPort

  function ownSocket(socket) {
    sockets.add(socket)
    socket.on('error', () => {})
    socket.once('close', () => sockets.delete(socket))
    socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy())
    if (closed) socket.destroy()
    return socket
  }

  const origin = http.createServer({ maxHeaderSize: 8192 }, (request, response) => {
    response.setHeader('Cache-Control', 'no-store, max-age=0')
    response.setHeader('Connection', 'close')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
    const reject = (status) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Witness request rejected')
    }
    if (closed || request.method !== 'GET' || request.url.length > 2048 ||
        request.headers.host?.toLowerCase() !== `${WITNESS_HOST}:${originPort}` ||
        !request.url.startsWith('/') || request.url.startsWith('//')) {
      reject(400)
      return
    }
    let url
    try { url = new URL(request.url, `http://${WITNESS_HOST}:${originPort}`) }
    catch { reject(400); return }
    const nonce = url.searchParams.get('nonce')
    if (url.pathname !== '/' || url.searchParams.getAll('nonce').length !== 1 || !validNonce(nonce)) {
      reject(404)
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Latitude Browser · 代理链路验收</title>
<style>body{margin:0;background:#090e13;color:#dcebea;font:16px/1.6 ui-monospace,monospace}main{max-width:860px;margin:12vh auto;padding:32px}p{color:#76dcc9;letter-spacing:.16em}h1{font:500 34px/1.3 system-ui}dl{margin-top:44px}dt{color:#8aa19f;margin-top:24px}dd{margin:8px 0;overflow-wrap:anywhere}code{font:inherit}</style>
</head><body><main><p>LATITUDE BROWSER</p><h1>代理链路已到达验收源</h1><dl>
<dt>Witness token</dt><dd><code id="witness-token">${witnessToken}</code></dd>
<dt>Request nonce</dt><dd><code id="witness-nonce">${escapeHTML(nonce)}</code></dd>
</dl></main></body></html>`)
  })
  origin.maxConnections = MAX_CONNECTIONS
  origin.maxHeadersCount = 32
  origin.headersTimeout = HANDSHAKE_TIMEOUT_MS
  origin.requestTimeout = HANDSHAKE_TIMEOUT_MS
  origin.keepAliveTimeout = 1000
  origin.on('connection', ownSocket)
  origin.on('clientError', (_error, socket) => socket.destroy())

  const socks = net.createServer({ allowHalfOpen: true }, (client) => {
    ownSocket(client)
    client.setNoDelay(true)
    if (closed) return
    let phase = 'greeting'
    let buffer = EMPTY
    let upstream
    let retired = false
    let countedActive = false
    let deadline
    const controller = new AbortController()
    const record = { stop, block }
    clients.add(record)

    function retire() {
      if (retired) return false
      retired = true
      clearTimeout(deadline)
      controller.abort()
      buffer = EMPTY
      client.removeListener('data', onData)
      if (countedActive) {
        counters.activeConnections -= 1
        countedActive = false
      }
      return true
    }

    function stop() {
      retire()
      upstream?.destroy()
      client.destroy()
    }

    function reject(reply) {
      if (!retire()) return
      upstream?.destroy()
      // Bound even a peer that will not consume the small refusal response.
      const closeTimer = setTimeout(() => client.destroy(), 250)
      closeTimer.unref()
      client.once('close', () => clearTimeout(closeTimer))
      client.resume()
      client.end(reply, () => client.destroy())
    }

    function block() {
      if (retired || (phase !== 'connecting' && phase !== 'forwarding')) return
      counters.blocked += 1
      if (phase === 'forwarding') stop()
      else reject(socksReply(2))
    }

    function failAuthentication(reply) {
      counters.authFailures += 1
      reject(reply)
    }

    function rejectRequest(code = 2) {
      counters.rejected += 1
      reject(socksReply(code))
    }

    async function connectTarget(target, port, earlyData) {
      try {
        const address = target === 'witness' ? HOST : await resolveExitAddress(controller.signal)
        if (retired || closed || controller.signal.aborted) return
        if (blocked) { block(); return }
        // Never pass a hostname here. Only an owned loopback address or the
        // validated, pinned public A record can reach the TCP dialer.
        upstream = ownSocket(net.createConnection({ host: address, port, family: 4 }))
        upstream.once('error', () => {
          if (phase === 'forwarding') stop()
        })
        await new Promise((resolve, rejectConnection) => {
          const cancelled = () => {
            upstream.destroy()
            rejectConnection(fixtureError('request_cancelled'))
          }
          controller.signal.addEventListener('abort', cancelled, { once: true })
          upstream.once('connect', resolve)
          upstream.once('error', rejectConnection)
          upstream.once('close', () => {
            controller.signal.removeEventListener('abort', cancelled)
            rejectConnection(fixtureError('target_closed'))
          })
        })
        if (retired || closed) { upstream.destroy(); return }
        if (blocked) { block(); return }
        clearTimeout(deadline)
        phase = 'forwarding'
        countedActive = true
        counters.activeConnections += 1
        counters[target === 'witness' ? 'witnessForwarded' : 'externalForwarded'] += 1
        client.setTimeout(IDLE_TIMEOUT_MS)
        client.write(socksReply(0, upstream))
        upstream.once('close', (hadError) => {
          if (hadError || !upstream.readableEnded) stop()
          else client.end(() => client.destroy())
        })
        upstream.pipe(client)
        const startForwarding = () => {
          if (!retired && !closed) client.pipe(upstream)
        }
        // Preserve coalesced application bytes without defeating backpressure.
        if (earlyData.length > 0 && !upstream.write(earlyData)) upstream.once('drain', startForwarding)
        else startForwarding()
      } catch {
        if (!retired) rejectRequest(4)
      }
    }

    function onData(chunk) {
      if (retired) return
      if (buffer.length + chunk.length > MAX_HANDSHAKE_BYTES) {
        counters.rejected += 1
        stop()
        return
      }
      buffer = Buffer.concat([buffer, chunk])
      while (!retired) {
        if (phase === 'greeting') {
          if (buffer.length < 2) return
          const methodsLength = buffer[1]
          if (buffer[0] !== 5 || methodsLength === 0) {
            failAuthentication(Buffer.from([5, 255])); return
          }
          if (buffer.length < 2 + methodsLength) return
          if (!buffer.subarray(2, 2 + methodsLength).includes(2)) {
            failAuthentication(Buffer.from([5, 255])); return
          }
          buffer = buffer.subarray(2 + methodsLength)
          phase = 'authentication'
          client.write(Buffer.from([5, 2]))
        } else if (phase === 'authentication') {
          if (buffer.length < 2) return
          const usernameLength = buffer[1]
          if (buffer[0] !== 1 || usernameLength === 0) {
            failAuthentication(Buffer.from([1, 1])); return
          }
          if (buffer.length < 3 + usernameLength) return
          const passwordLength = buffer[2 + usernameLength]
          if (passwordLength === 0) { failAuthentication(Buffer.from([1, 1])); return }
          const frameLength = 3 + usernameLength + passwordLength
          if (buffer.length < frameLength) return
          const correctUsername = equalCredential(buffer.subarray(2, 2 + usernameLength), username)
          const correctPassword = equalCredential(buffer.subarray(3 + usernameLength, frameLength), password)
          if (!correctUsername || !correctPassword) {
            failAuthentication(Buffer.from([1, 1])); return
          }
          buffer = buffer.subarray(frameLength)
          phase = 'request'
          client.write(Buffer.from([1, 0]))
        } else if (phase === 'request') {
          if (buffer.length < 4) return
          if (buffer[0] !== 5 || buffer[2] !== 0) { rejectRequest(1); return }
          if (buffer[1] !== 1) { rejectRequest(7); return }
          const addressType = buffer[3]
          if (addressType !== 3) { rejectRequest(addressType === 1 || addressType === 4 ? 2 : 8); return }
          if (buffer.length < 5) return
          const hostnameLength = buffer[4]
          if (hostnameLength === 0) { rejectRequest(8); return }
          const frameLength = 7 + hostnameLength
          if (buffer.length < frameLength) return
          const hostname = buffer.subarray(5, 5 + hostnameLength).toString('utf8').toLowerCase()
          const port = buffer.readUInt16BE(5 + hostnameLength)
          const target = hostname === WITNESS_HOST && port === originPort ? 'witness'
            : hostname === EXIT_HOST && port === 443 ? 'exit' : null
          if (!target) { rejectRequest(); return }
          if (blocked) { counters.blocked += 1; reject(socksReply(2)); return }
          const earlyData = buffer.subarray(frameLength)
          buffer = EMPTY
          phase = 'connecting'
          client.pause()
          client.removeListener('data', onData)
          clearTimeout(deadline)
          deadline = setTimeout(() => rejectRequest(4), CONNECT_TIMEOUT_MS)
          client.setTimeout(CONNECT_TIMEOUT_MS)
          void connectTarget(target, port, earlyData)
          return
        } else return
      }
    }

    deadline = setTimeout(stop, HANDSHAKE_TIMEOUT_MS)
    client.setTimeout(HANDSHAKE_TIMEOUT_MS)
    client.on('data', onData)
    client.once('error', stop)
    client.once('end', () => { if (phase !== 'forwarding') stop() })
    client.once('close', () => { clients.delete(record); stop() })
  })
  socks.maxConnections = MAX_CONNECTIONS

  async function readReferenceExitIP() {
    if (closed) throw fixtureError('fixture_closed')
    if (referenceControllers.size >= 4) throw fixtureError('reference_limit')
    const controller = new AbortController()
    referenceControllers.add(controller)
    const timer = setTimeout(() => controller.abort(), REFERENCE_TIMEOUT_MS)
    try {
      const address = await resolveExitAddress(controller.signal)
      if (controller.signal.aborted) throw fixtureError('request_cancelled')
      return await new Promise((resolve, reject) => {
        let settled = false
        const finish = (error, value) => {
          if (settled) return
          settled = true
          if (error) reject(error)
          else resolve(value)
        }
        const request = https.request({
          hostname: EXIT_HOST,
          port: 443,
          path: '/?format=json',
          method: 'GET',
          servername: EXIT_HOST,
          family: 4,
          agent: false,
          rejectUnauthorized: true,
          maxHeaderSize: 8192,
          signal: controller.signal,
          // TLS authenticates EXIT_HOST; DNS is not consulted again at connect.
          lookup: (hostname, options, callback) => {
            if (hostname !== EXIT_HOST) { callback(fixtureError('reference_host_rejected')); return }
            if (options?.all) callback(null, [{ address, family: 4 }])
            else callback(null, address, 4)
          },
          headers: { Accept: 'application/json', Connection: 'close', 'User-Agent': 'Latitude Browser Native Proxy QA' },
        }, (response) => {
          if (response.statusCode !== 200) {
            finish(fixtureError('reference_http_status'))
            response.destroy()
            request.destroy()
            return
          }
          const chunks = []
          let bytes = 0
          response.on('data', (chunk) => {
            bytes += chunk.length
            if (bytes > MAX_REFERENCE_BYTES) {
              finish(fixtureError('reference_body_too_large'))
              response.destroy()
              request.destroy()
              return
            }
            chunks.push(chunk)
          })
          response.once('end', () => {
            try {
              const ip = JSON.parse(Buffer.concat(chunks).toString('utf8'))?.ip
              if (typeof ip !== 'string' || net.isIP(ip) === 0) throw fixtureError('reference_invalid_ip')
              finish(null, ip)
            } catch { finish(fixtureError('reference_invalid_ip')) }
          })
          response.once('aborted', () => finish(fixtureError('reference_response_incomplete')))
          response.once('error', () => finish(fixtureError('reference_response_failed')))
        })
        request.once('socket', ownSocket)
        request.once('error', () => finish(fixtureError(controller.signal.aborted ? 'reference_cancelled' : 'reference_tls_or_network_failed')))
        request.end()
      })
    } finally {
      clearTimeout(timer)
      referenceControllers.delete(controller)
    }
  }

  function close() {
    if (closePromise) return closePromise
    closed = true
    for (const controller of referenceControllers) controller.abort()
    for (const client of clients) client.stop()
    for (const socket of sockets) socket.destroy()
    closePromise = Promise.all([closeServer(socks), closeServer(origin)]).then(() => {})
    return closePromise
  }

  try {
    originPort = await listen(origin)
    const port = await listen(socks)
    // An unexpected listener error invalidates the fixture rather than leaving a
    // partially functioning proxy that could produce misleading QA evidence.
    origin.on('error', () => { void close() })
    socks.on('error', () => { void close() })
    return Object.freeze({
      host: HOST,
      port,
      proxyURL: `socks5://${username.toString()}:${password.toString()}@${HOST}:${port}`,
      witnessToken,
      ports: Object.freeze([port, originPort]),
      witnessURL(nonce) {
        if (!validNonce(nonce)) throw fixtureError('witness_nonce_invalid')
        const url = new URL(`http://${WITNESS_HOST}:${originPort}/`)
        url.searchParams.set('nonce', nonce)
        return url.href
      },
      stats() {
        // activeConnections counts established SOCKS tunnels, not HTTP requests.
        // blocked counts each refused/terminated allowed-target tunnel once.
        // Reference HTTPS reads are intentionally NOT externalForwarded traffic.
        return { ...counters, targets: [WITNESS_HOST, EXIT_HOST], isBlocked: blocked, isClosed: closed }
      },
      setBlocked(value) {
        if (typeof value !== 'boolean') throw fixtureError('blocked_flag_invalid')
        if (closed) throw fixtureError('fixture_closed')
        blocked = value
        if (blocked) for (const client of clients) client.block()
      },
      readReferenceExitIP,
      close,
    })
  } catch (error) {
    await close()
    throw error
  }
}
