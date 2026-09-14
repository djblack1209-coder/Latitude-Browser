import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import net from 'node:net'
import https from 'node:https'
import { Resolver } from 'node:dns/promises'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import { createProxyFixture } from './native-proxy-fixture.mjs'

const HOST = '127.0.0.1'
const WITNESS_HOST = 'latitude-native-proxy.invalid'
const EXIT_HOST = 'api.ipify.org'
const rawCreateConnection = net.createConnection

// Fail closed for the entire suite: no test may perform public DNS, HTTPS, or
// TCP. Tests of the external path explicitly replace these guards with fakes.
beforeEach((t) => {
  t.mock.method(Resolver.prototype, 'resolve4', async () => { throw new Error('Public DNS is disabled in fixture unit tests') })
  t.mock.method(https, 'request', () => { throw new Error('Public HTTPS is disabled in fixture unit tests') })
  t.mock.method(net, 'createConnection', (options) => {
    assert.equal(options.host, HOST, 'Unit tests must never open an external TCP connection')
    return rawCreateConnection(options)
  })
})

async function makeFixture(t) {
  const fixture = await createProxyFixture()
  t.after(() => fixture.close())
  return fixture
}

async function openClient(t, fixture) {
  const socket = net.createConnection({ host: fixture.host, port: fixture.port })
  socket.setNoDelay(true)
  t.after(() => socket.destroy())
  let buffer = Buffer.alloc(0)
  let ended = false
  let failed = false
  const readers = []
  let closedResolve
  const closed = new Promise((resolve) => { closedResolve = resolve })
  const flush = () => {
    while (readers.length > 0) {
      const reader = readers[0]
      if (reader.length !== null && buffer.length >= reader.length) {
        readers.shift()
        const value = buffer.subarray(0, reader.length)
        buffer = buffer.subarray(reader.length)
        clearTimeout(reader.timer)
        reader.resolve(value)
      } else if (ended) {
        readers.shift()
        clearTimeout(reader.timer)
        if (reader.length === null && !failed) {
          const value = buffer
          buffer = Buffer.alloc(0)
          reader.resolve(value)
        } else reader.reject(new Error('Fixture client closed before its expected response'))
      } else return
    }
  }
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    if (buffer.length > 128 * 1024) { failed = true; socket.destroy(); return }
    flush()
  })
  socket.on('error', () => { failed = true })
  socket.on('end', () => { ended = true; flush() })
  socket.once('close', () => { ended = true; flush(); closedResolve() })
  const read = (length) => new Promise((resolve, reject) => {
    const reader = { length, resolve, reject, timer: undefined }
    reader.timer = setTimeout(() => {
      const index = readers.indexOf(reader)
      if (index >= 0) readers.splice(index, 1)
      reject(new Error('Fixture client response deadline exceeded'))
    }, 3000)
    readers.push(reader)
    flush()
  })
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('error', () => reject(new Error('Could not connect to the loopback fixture')))
  })
  return { socket, read, readToEnd: () => read(null), closed }
}

function credentials(fixture) {
  const url = new URL(fixture.proxyURL)
  return { username: Buffer.from(decodeURIComponent(url.username)), password: Buffer.from(decodeURIComponent(url.password)) }
}

function authenticationFrame(fixture, overrides = {}) {
  const credentialsValue = { ...credentials(fixture), ...overrides }
  const { username, password } = credentialsValue
  return Buffer.concat([Buffer.from([1, username.length]), username, Buffer.from([password.length]), password])
}

function requestFrame(hostname, port, command = 1) {
  const host = Buffer.from(hostname)
  const suffix = Buffer.alloc(2)
  suffix.writeUInt16BE(port)
  return Buffer.concat([Buffer.from([5, command, 0, 3, host.length]), host, suffix])
}

async function writeFragmented(socket, frame) {
  for (const byte of frame) {
    socket.write(Buffer.from([byte]))
    await delay(1)
  }
}

async function authenticate(client, fixture, { fragmented = false } = {}) {
  const write = (bytes) => fragmented ? writeFragmented(client.socket, bytes) : client.socket.write(bytes)
  await write(Buffer.from([5, 2, 0, 2]))
  assert.deepEqual(await client.read(2), Buffer.from([5, 2]))
  await write(authenticationFrame(fixture))
  assert.deepEqual(await client.read(2), Buffer.from([1, 0]))
}

async function openTunnel(t, fixture, { hostname = WITNESS_HOST, port = fixture.ports[1], command = 1, fragmented = false } = {}) {
  const client = await openClient(t, fixture)
  await authenticate(client, fixture, { fragmented })
  const request = requestFrame(hostname, port, command)
  if (fragmented) await writeFragmented(client.socket, request)
  else client.socket.write(request)
  return { ...client, reply: await client.read(10) }
}

function witnessRequest(fixture, nonce) {
  const url = new URL(fixture.witnessURL(nonce))
  return `GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: close\r\n\r\n`
}

async function readWitness(t, fixture, nonce) {
  const client = await openTunnel(t, fixture)
  assert.equal(client.reply[1], 0)
  client.socket.write(witnessRequest(fixture, nonce))
  const response = (await client.readToEnd()).toString('utf8')
  await client.closed
  return response
}

async function waitFor(predicate) {
  const deadline = Date.now() + 2000
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'Fixture cleanup deadline exceeded')
    await delay(5)
  }
}

function fakeHTTPS(t, { body = '{"ip":"203.0.113.7"}', status = 200, transportFailure = false, inspect = () => {} } = {}) {
  const requests = []
  t.mock.method(https, 'request', (options, onResponse) => {
    requests.push(options)
    inspect(options)
    const request = new EventEmitter()
    let destroyed = false
    request.destroy = () => { destroyed = true }
    request.end = () => queueMicrotask(() => {
      if (transportFailure) { request.emit('error', new Error('Sensitive OS address 192.0.2.42')); return }
      if (destroyed) return
      const response = new PassThrough()
      response.statusCode = status
      onResponse(response)
      if (!destroyed) response.end(body)
    })
    return request
  })
  return requests
}

test('creates unique in-memory credentials, loopback listeners and sanitized immutable metadata', async (t) => {
  const fixture = await makeFixture(t)
  const other = await makeFixture(t)
  assert.equal(fixture.host, HOST)
  assert.equal(fixture.ports.length, 2)
  assert.equal(new Set(fixture.ports).size, 2)
  assert.ok(fixture.ports.every((port) => Number.isInteger(port) && port > 0))
  const firstCredentials = credentials(fixture)
  const secondCredentials = credentials(other)
  // Boolean comparisons avoid emitting random credentials on assertion failure.
  assert.equal(firstCredentials.username.equals(secondCredentials.username), false)
  assert.equal(firstCredentials.password.equals(secondCredentials.password), false)
  assert.notEqual(fixture.witnessToken, other.witnessToken)
  const url = new URL(fixture.witnessURL('test-nonce'))
  assert.equal(url.hostname, WITNESS_HOST)
  assert.equal(Number(url.port), fixture.ports[1])
  assert.equal(url.searchParams.get('nonce'), 'test-nonce')
  const statsJSON = JSON.stringify(fixture.stats())
  assert.equal(statsJSON.includes(firstCredentials.username.toString()), false)
  assert.equal(statsJSON.includes(firstCredentials.password.toString()), false)
  assert.equal(statsJSON.includes(HOST), false)
  const snapshot = fixture.stats()
  snapshot.activeConnections = 1000
  snapshot.targets.push('not-an-allowed-target')
  assert.equal(fixture.stats().activeConnections, 0)
  assert.deepEqual(fixture.stats().targets, [WITNESS_HOST, EXIT_HOST])
  assert.throws(() => fixture.witnessURL(''), { code: 'witness_nonce_invalid' })
  assert.throws(() => fixture.witnessURL('x'.repeat(257)), { code: 'witness_nonce_invalid' })
})

test('requires RFC1929 authentication even if the peer offers no-auth', async (t) => {
  const fixture = await makeFixture(t)
  const client = await openClient(t, fixture)
  client.socket.write(Buffer.from([5, 1, 0]))
  assert.deepEqual(await client.read(2), Buffer.from([5, 255]))
  await client.closed
  assert.equal(fixture.stats().authFailures, 1)
  assert.equal(fixture.stats().witnessForwarded, 0)
})

test('rejects incorrect username and password without reaching a target', async (t) => {
  const fixture = await makeFixture(t)
  for (const overrides of [{ username: Buffer.from('wrong') }, { password: Buffer.from('wrong') }]) {
    const client = await openClient(t, fixture)
    client.socket.write(Buffer.from([5, 1, 2]))
    assert.deepEqual(await client.read(2), Buffer.from([5, 2]))
    client.socket.write(authenticationFrame(fixture, overrides))
    assert.deepEqual(await client.read(2), Buffer.from([1, 1]))
    await client.closed
  }
  assert.equal(fixture.stats().authFailures, 2)
  assert.equal(fixture.stats().activeConnections, 0)
})

test('rejects malformed greeting and RFC1929 frames', async (t) => {
  const fixture = await makeFixture(t)
  for (const greeting of [Buffer.from([4, 1, 2]), Buffer.from([5, 0])]) {
    const client = await openClient(t, fixture)
    client.socket.write(greeting)
    assert.deepEqual(await client.read(2), Buffer.from([5, 255]))
    await client.closed
  }
  for (const auth of [Buffer.from([2, 1]), Buffer.from([1, 0]), Buffer.from([1, 1, 97, 0])]) {
    const client = await openClient(t, fixture)
    client.socket.write(Buffer.from([5, 1, 2]))
    await client.read(2)
    client.socket.write(auth)
    assert.deepEqual(await client.read(2), Buffer.from([1, 1]))
    await client.closed
  }
  assert.equal(fixture.stats().authFailures, 5)
})

test('handles fragmented greeting, authentication, hostname and port; returns witness token and nonce', async (t) => {
  const fixture = await makeFixture(t)
  const client = await openTunnel(t, fixture, { fragmented: true })
  assert.equal(client.reply[1], 0)
  client.socket.write(witnessRequest(fixture, 'fragmented-nonce'))
  const response = (await client.readToEnd()).toString('utf8')
  assert.match(response, /^HTTP\/1\.1 200/)
  assert.ok(response.includes(fixture.witnessToken))
  assert.ok(response.includes('fragmented-nonce'))
  assert.match(response, /Cache-Control: no-store/i)
  await client.closed
  await waitFor(() => fixture.stats().activeConnections === 0)
  assert.equal(fixture.stats().witnessForwarded, 1)
  assert.equal(fixture.stats().externalForwarded, 0)
})

test('preserves coalesced greeting, authentication, CONNECT and early HTTP bytes', async (t) => {
  const fixture = await makeFixture(t)
  const client = await openClient(t, fixture)
  client.socket.write(Buffer.concat([
    Buffer.from([5, 1, 2]), authenticationFrame(fixture),
    requestFrame(WITNESS_HOST, fixture.ports[1]), Buffer.from(witnessRequest(fixture, 'coalesced-nonce')),
  ]))
  assert.deepEqual(await client.read(2), Buffer.from([5, 2]))
  assert.deepEqual(await client.read(2), Buffer.from([1, 0]))
  assert.equal((await client.read(10))[1], 0)
  const response = (await client.readToEnd()).toString('utf8')
  assert.ok(response.includes(fixture.witnessToken))
  assert.ok(response.includes('coalesced-nonce'))
})

test('escapes nonce HTML and does not serve other origins or paths', async (t) => {
  const fixture = await makeFixture(t)
  const response = await readWitness(t, fixture, '<script>"&\'</script>')
  assert.ok(response.includes('&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;'))
  assert.equal(response.includes('<script>'), false)
  for (const request of [
    `GET /?nonce=wrong-host HTTP/1.1\r\nHost: localhost:${fixture.ports[1]}\r\n\r\n`,
    `GET /other?nonce=wrong-path HTTP/1.1\r\nHost: ${WITNESS_HOST}:${fixture.ports[1]}\r\n\r\n`,
    `GET //% HTTP/1.1\r\nHost: ${WITNESS_HOST}:${fixture.ports[1]}\r\n\r\n`,
    `GET /?nonce=one&nonce=two HTTP/1.1\r\nHost: ${WITNESS_HOST}:${fixture.ports[1]}\r\n\r\n`,
  ]) {
    const client = await openTunnel(t, fixture)
    assert.equal(client.reply[1], 0)
    client.socket.write(request)
    const refused = (await client.readToEnd()).toString('utf8')
    assert.match(refused, /^HTTP\/1\.1 4\d\d/)
    assert.equal(refused.includes(fixture.witnessToken), false)
  }
})

test('blocks existing tunnels and new CONNECTs, then permits a fresh witness after unblock', async (t) => {
  const fixture = await makeFixture(t)
  const active = await openTunnel(t, fixture)
  assert.equal(active.reply[1], 0)
  assert.equal(fixture.stats().activeConnections, 1)
  fixture.setBlocked(true)
  await active.closed
  assert.equal(fixture.stats().activeConnections, 0)
  assert.equal(fixture.stats().blocked, 1)
  fixture.setBlocked(true)
  assert.equal(fixture.stats().blocked, 1, 'Repeated blocking must not double-count a killed tunnel')
  for (const target of [
    { hostname: WITNESS_HOST, port: fixture.ports[1] },
    { hostname: EXIT_HOST, port: 443 },
  ]) {
    const denied = await openTunnel(t, fixture, target)
    assert.equal(denied.reply[1], 2)
    await denied.closed
  }
  assert.equal(fixture.stats().blocked, 3)
  fixture.setBlocked(false)
  assert.ok((await readWitness(t, fixture, 'after-unblock')).includes('after-unblock'))
  assert.equal(fixture.stats().witnessForwarded, 2)
  assert.equal(fixture.stats().isBlocked, false)
  assert.throws(() => fixture.setBlocked(1), { code: 'blocked_flag_invalid' })
})

test('rejects non-allowlisted names, literal IPs, ports, BIND and UDP without DNS', async (t) => {
  const fixture = await makeFixture(t)
  const lookup = t.mock.method(Resolver.prototype, 'resolve4', async () => { assert.fail('Rejected targets must not trigger DNS') })
  for (const target of [
    { hostname: 'example.com', port: 443 }, { hostname: 'localhost', port: fixture.ports[1] },
    { hostname: '127.0.0.1', port: fixture.ports[1] }, { hostname: '169.254.169.254', port: 80 },
    { hostname: WITNESS_HOST, port: fixture.port }, { hostname: EXIT_HOST, port: 80 },
    { hostname: `${EXIT_HOST}.evil.invalid`, port: 443 }, { hostname: EXIT_HOST, port: 0 },
  ]) {
    const client = await openTunnel(t, fixture, target)
    assert.equal(client.reply[1], 2)
    await client.closed
  }
  for (const command of [2, 3, 255]) {
    const client = await openTunnel(t, fixture, { command })
    assert.equal(client.reply[1], 7)
    await client.closed
  }
  for (const [type, reply] of [[1, 2], [4, 2], [99, 8]]) {
    const client = await openClient(t, fixture)
    await authenticate(client, fixture)
    client.socket.write(Buffer.from([5, 1, 0, type]))
    assert.equal((await client.read(10))[1], reply)
    await client.closed
  }
  assert.equal(lookup.mock.callCount(), 0)
  assert.equal(fixture.stats().witnessForwarded, 0)
  assert.equal(fixture.stats().externalForwarded, 0)
})

test('fails closed for non-public or mixed public/private DNS answers (DNS mocked)', async (t) => {
  const fixture = await makeFixture(t)
  const responses = [
    [], ['0.0.0.0'], ['0.1.2.3'], ['10.0.0.1'], ['100.64.0.1'], ['100.127.255.254'], ['127.0.0.1'],
    ['169.254.169.254'], ['172.16.0.1'], ['172.31.255.255'], ['192.168.1.1'], ['192.0.0.1'],
    ['192.0.2.1'], ['192.88.99.1'], ['198.18.0.1'], ['198.19.255.255'], ['198.51.100.1'],
    ['203.0.113.1'], ['224.0.0.1'], ['239.255.255.255'], ['240.0.0.1'], ['255.255.255.255'],
    ['::1'], ['::ffff:127.0.0.1'], ['not-an-address'], ['8.8.8.8', '127.0.0.1'],
  ]
  let current
  t.mock.method(Resolver.prototype, 'resolve4', async (hostname) => { assert.equal(hostname, EXIT_HOST); return current })
  for (const response of responses) {
    current = response
    const client = await openTunnel(t, fixture, { hostname: EXIT_HOST, port: 443 })
    assert.equal(client.reply[1], 4)
    await client.closed
  }
  assert.equal(fixture.stats().externalForwarded, 0)
  assert.equal(fixture.stats().rejected, responses.length)
})

test('pins the checked public address and never passes the external hostname to the TCP dialer (transport mocked)', async (t) => {
  const fixture = await makeFixture(t)
  let lookups = 0
  t.mock.method(Resolver.prototype, 'resolve4', async () => { lookups += 1; return ['8.8.8.8'] })
  const dials = []
  t.mock.method(net, 'createConnection', (options) => {
    if (options.port === 443) {
      dials.push(options)
      assert.equal(options.host, '8.8.8.8')
      assert.equal(options.family, 4)
      // Substitute only the transport. No TLS/real-IP success is claimed here.
      return rawCreateConnection({ host: HOST, port: fixture.ports[1] })
    }
    assert.equal(options.host, HOST)
    return rawCreateConnection(options)
  })
  const client = await openTunnel(t, fixture, { hostname: EXIT_HOST, port: 443 })
  assert.equal(client.reply[1], 0)
  assert.equal(lookups, 1)
  assert.equal(dials.length, 1)
  assert.equal(fixture.stats().externalForwarded, 1)
  assert.equal(fixture.stats().witnessForwarded, 0)
  fixture.setBlocked(true)
  await client.closed
  assert.equal(fixture.stats().activeConnections, 0)
})

test('pending DNS cannot open a tunnel after block/unblock (DNS mocked)', async (t) => {
  const fixture = await makeFixture(t)
  let resolveDNS
  t.mock.method(Resolver.prototype, 'resolve4', () => new Promise((resolve) => { resolveDNS = resolve }))
  // Simulate a late DNS completion even after cancellation to exercise the guard.
  t.mock.method(Resolver.prototype, 'cancel', () => {})
  const client = await openClient(t, fixture)
  await authenticate(client, fixture)
  client.socket.write(requestFrame(EXIT_HOST, 443))
  await waitFor(() => Boolean(resolveDNS))
  fixture.setBlocked(true)
  fixture.setBlocked(false)
  assert.equal((await client.read(10))[1], 2)
  await client.closed
  resolveDNS(['8.8.8.8'])
  await delay(10)
  assert.equal(fixture.stats().externalForwarded, 0)
  assert.equal(fixture.stats().activeConnections, 0)
  assert.equal(fixture.stats().blocked, 1)
})

test('reference reads remain independent of SOCKS blocking, retain TLS verification and do not contaminate forwarding counts (HTTPS mocked)', async (t) => {
  const fixture = await makeFixture(t)
  const dns = t.mock.method(Resolver.prototype, 'resolve4', async () => ['8.8.8.8'])
  const requests = fakeHTTPS(t, { inspect(options) {
    assert.equal(options.hostname, EXIT_HOST)
    assert.equal(options.servername, EXIT_HOST)
    assert.equal(options.port, 443)
    assert.equal(options.rejectUnauthorized, true)
    assert.equal(options.agent, false)
    options.lookup(EXIT_HOST, {}, (error, address, family) => {
      assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4)
    })
    options.lookup(EXIT_HOST, { all: true }, (error, addresses) => {
      assert.equal(error, null); assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }])
    })
    options.lookup('other.invalid', {}, (error) => assert.equal(error.code, 'reference_host_rejected'))
  } })
  fixture.setBlocked(true)
  assert.equal(await fixture.readReferenceExitIP(), '203.0.113.7')
  assert.equal(dns.mock.callCount(), 1)
  assert.equal(requests.length, 1)
  assert.equal(fixture.stats().externalForwarded, 0)
  assert.equal(fixture.stats().blocked, 0)
  assert.equal(JSON.stringify(fixture.stats()).includes('203.0.113.7'), false)
})

for (const [name, options, code] of [
  ['redirects', { status: 302 }, 'reference_http_status'],
  ['oversized response', { body: 'x'.repeat(4097) }, 'reference_body_too_large'],
  ['invalid JSON', { body: 'not JSON' }, 'reference_invalid_ip'],
  ['missing IP', { body: '{}' }, 'reference_invalid_ip'],
  ['non-IP result', { body: '{"ip":"not-an-address"}' }, 'reference_invalid_ip'],
  ['transport errors', { transportFailure: true }, 'reference_tls_or_network_failed'],
]) {
  test(`reference rejects ${name} without exposing an address (HTTPS mocked)`, async (t) => {
    const fixture = await makeFixture(t)
    t.mock.method(Resolver.prototype, 'resolve4', async () => ['8.8.8.8'])
    const requests = fakeHTTPS(t, options)
    await assert.rejects(fixture.readReferenceExitIP(), (error) => {
      assert.equal(error.code, code)
      assert.equal(error.message.includes('192.0.2.42'), false)
      assert.equal(error.message.includes('8.8.8.8'), false)
      return true
    })
    assert.equal(requests.length, 1)
  })
}

test('close destroys owned handshake/tunnel/origin sockets, is idempotent, and releases both ports', async (t) => {
  const fixture = await makeFixture(t)
  const pending = await openClient(t, fixture)
  pending.socket.write(Buffer.from([5]))
  const tunnel = await openTunnel(t, fixture)
  assert.equal(tunnel.reply[1], 0)
  const directOrigin = net.createConnection({ host: HOST, port: fixture.ports[1] })
  directOrigin.on('error', () => {}) // Abrupt fixture shutdown may reset this incomplete HTTP connection.
  t.after(() => directOrigin.destroy())
  const directClosed = new Promise((resolve) => directOrigin.once('close', resolve))
  await new Promise((resolve) => directOrigin.once('connect', resolve))
  const firstClose = fixture.close()
  assert.equal(fixture.close(), firstClose)
  await firstClose
  await Promise.all([pending.closed, tunnel.closed, directClosed])
  assert.equal(fixture.stats().activeConnections, 0)
  assert.equal(fixture.stats().isClosed, true)
  assert.throws(() => fixture.setBlocked(false), { code: 'fixture_closed' })
  await assert.rejects(fixture.readReferenceExitIP(), { code: 'fixture_closed' })
  for (const port of fixture.ports) {
    const server = net.createServer()
    t.after(() => { if (server.listening) server.close() })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen({ host: HOST, port, exclusive: true }, resolve)
    })
    await new Promise((resolve) => server.close(resolve))
  }
})

test('close cancels pending SOCKS DNS and ignores any late resolver completion (DNS mocked)', async (t) => {
  const fixture = await makeFixture(t)
  let resolveDNS
  t.mock.method(Resolver.prototype, 'resolve4', () => new Promise((resolve) => { resolveDNS = resolve }))
  const cancel = t.mock.method(Resolver.prototype, 'cancel', () => {})
  const client = await openClient(t, fixture)
  await authenticate(client, fixture)
  client.socket.write(requestFrame(EXIT_HOST, 443))
  await waitFor(() => Boolean(resolveDNS))
  await fixture.close()
  await client.closed
  resolveDNS(['8.8.8.8'])
  await delay(10)
  assert.equal(cancel.mock.callCount(), 1)
  assert.equal(fixture.stats().externalForwarded, 0)
  assert.equal(fixture.stats().activeConnections, 0)
})

test('close cancels independent reference DNS and settles its promise (DNS mocked)', async (t) => {
  const fixture = await makeFixture(t)
  const pending = new Map()
  t.mock.method(Resolver.prototype, 'resolve4', function () {
    return new Promise((_resolve, reject) => { pending.set(this, reject) })
  })
  const cancel = t.mock.method(Resolver.prototype, 'cancel', function () {
    pending.get(this)?.(new Error('Cancelled fake DNS query'))
  })
  const result = assert.rejects(fixture.readReferenceExitIP(), { code: 'request_cancelled' })
  await waitFor(() => pending.size === 1)
  await fixture.close()
  await result
  assert.equal(cancel.mock.callCount(), 1)
})

test('close cancels independent reference TLS/HTTP and settles its promise (HTTPS mocked)', async (t) => {
  const fixture = await makeFixture(t)
  t.mock.method(Resolver.prototype, 'resolve4', async () => ['8.8.8.8'])
  let started = false
  let aborted = false
  t.mock.method(https, 'request', (options) => {
    const request = new EventEmitter()
    request.end = () => { started = true }
    request.destroy = () => {}
    options.signal.addEventListener('abort', () => {
      aborted = true
      request.emit('error', new Error('Cancelled fake TLS request'))
    }, { once: true })
    return request
  })
  const result = assert.rejects(fixture.readReferenceExitIP(), { code: 'reference_cancelled' })
  await waitFor(() => started)
  await fixture.close()
  await result
  assert.equal(aborted, true)
})

test('reference DNS rejects a non-public address before constructing HTTPS (DNS mocked)', async (t) => {
  const fixture = await makeFixture(t)
  t.mock.method(Resolver.prototype, 'resolve4', async () => ['8.8.8.8', HOST])
  const requests = fakeHTTPS(t)
  await assert.rejects(fixture.readReferenceExitIP(), { code: 'exit_dns_not_public' })
  assert.equal(requests.length, 0)
})

test('an absolute handshake deadline closes a peer that trickles incomplete greeting bytes', { timeout: 8000 }, async (t) => {
  const fixture = await makeFixture(t)
  const client = await openClient(t, fixture)
  client.socket.write(Buffer.from([5, 255]))
  const trickle = setInterval(() => client.socket.write(Buffer.from([0])), 500)
  t.after(() => clearInterval(trickle))
  await client.closed
  assert.equal(fixture.stats().activeConnections, 0)
  assert.equal(fixture.stats().witnessForwarded, 0)
})
