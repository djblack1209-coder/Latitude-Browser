const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const runner = path.join(__dirname, '../assets/runner.cjs');
const controlled = 'http://127.0.0.1:45671';

function runFixture({ endpoint = 'ws://127.0.0.1:45671/devtools/browser/fixture', failure = '', auth = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'latitude-runner-auth-'));
  try {
    const attempts = path.join(root, 'attempts.jsonl');
    const moduleRoot = path.join(root, 'node_modules/playwright-core');
    fs.mkdirSync(moduleRoot, { recursive: true });
    // Run the shipped runner entry point with a controlled Playwright boundary;
    // this records actual connectOverCDP arguments without starting a browser.
    fs.writeFileSync(path.join(moduleRoot, 'index.js'), `
      const fs = require('node:fs');
      exports.chromium = { connectOverCDP: async (endpoint, options) => {
        fs.appendFileSync(${JSON.stringify(attempts)}, JSON.stringify({ endpoint, options }) + String.fromCharCode(10));
        if (endpoint.includes(':45671') && ${JSON.stringify(failure)}) throw new Error(${JSON.stringify(failure)});
        return { contexts: () => [], close: async () => {} };
      }};
    `);
    const script = path.join(root, 'script.cjs');
    fs.writeFileSync(script, `exports.run = async api => {
      await api.connect({ cdpUrl: ${JSON.stringify(endpoint)}, debugPort: 45672 }, { timeoutMs: 20 });
      return { ok: true };
    };`);
    const payload = path.join(root, 'payload.json');
    fs.writeFileSync(payload, JSON.stringify({
      runtimeDir: root, scriptPath: script, artifactDir: root,
      launchBaseUrl: controlled,
      launchAuthHeader: auth ? 'X-Fixture-Control' : '',
      launchAuthValue: auth ? 'synthetic-test-key' : '',
    }));
    const child = spawnSync(process.execPath, [runner, payload], { encoding: 'utf8', timeout: 5000 });
    assert.equal(child.status, 0, child.stderr);
    return {
      result: JSON.parse(child.stdout),
      attempts: fs.existsSync(attempts) ? fs.readFileSync(attempts, 'utf8').trim().split('\n').map(JSON.parse) : [],
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('authenticated CDP success carries the control header', () => {
  const output = runFixture();
  assert.equal(output.result.ok, true);
  assert.equal(output.attempts.length, 1);
  assert.equal(output.attempts[0].options.headers['X-Fixture-Control'], 'synthetic-test-key');
});

for (const failure of ['401 Unauthorized', '403 Forbidden', 'connection refused']) {
  test(`${failure} cannot fall back to a direct debug port`, () => {
    const output = runFixture({ failure });
    assert.equal(output.result.ok, false);
    assert.ok(output.attempts.length > 0);
    assert.ok(output.attempts.every(({ endpoint }) => endpoint.startsWith('ws://127.0.0.1:45671/')));
    assert.ok(output.attempts.every(({ options }) => options.headers['X-Fixture-Control'] === 'synthetic-test-key'));
  });
}

for (const endpoint of ['https://foreign.invalid/devtools/browser/x', 'ws://127.0.0.1:45672/devtools/browser/x', 'ws://user:password@127.0.0.1:45671/devtools/browser/x', 'invalid']) {
  test(`rejects an endpoint outside the trusted control origin: ${endpoint}`, () => {
    const output = runFixture({ endpoint });
    assert.equal(output.result.ok, false);
    assert.deepEqual(output.attempts, []);
  });
}

test('missing session endpoint uses the controlled discovery URL', () => {
  const output = runFixture({ endpoint: '' });
  assert.equal(output.result.ok, true);
  assert.equal(output.attempts[0].endpoint, controlled);
});

test('explicitly disabled auth does not invent a credential or direct fallback', () => {
  const output = runFixture({ auth: false });
  assert.equal(output.result.ok, true);
  assert.deepEqual(output.attempts[0].options.headers, {});
  assert.equal(output.attempts.length, 1);
});
