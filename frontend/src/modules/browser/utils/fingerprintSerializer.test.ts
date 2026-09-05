import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyLocaleToFingerprintArgs,
  buildAcceptLanguage,
  buildAdaptiveDefaultWindowSize,
  validateFingerprintArgs,
  withAdaptiveDefaultWindowSize,
} from './fingerprintSerializer.ts'
import { isAutoConfigProxyReady, sanitizeAutoConfigDraft } from './autoConfig.ts'

test('buildAdaptiveDefaultWindowSize scales a large screen without exceeding the configured cap', () => {
  assert.equal(
    buildAdaptiveDefaultWindowSize({ availWidth: 2560, availHeight: 1440 }),
    '1075,605',
  )
})

test('buildAdaptiveDefaultWindowSize keeps small screens usable', () => {
  assert.equal(
    buildAdaptiveDefaultWindowSize({ availWidth: 800, availHeight: 600 }),
    '960,540',
  )
})

test('withAdaptiveDefaultWindowSize does not overwrite an explicit window size', () => {
  assert.deepEqual(
    withAdaptiveDefaultWindowSize(['--fingerprint=123', '--window-size=1440,900']),
    ['--fingerprint=123', '--window-size=1440,900'],
  )
})

test('withAdaptiveDefaultWindowSize adds a valid default when no window size exists', () => {
  const args = withAdaptiveDefaultWindowSize(['--fingerprint=123'])
  const windowSize = args.find((arg) => arg.startsWith('--window-size='))

  assert.ok(windowSize)
  assert.match(windowSize, /^--window-size=\d{3,5},\d{3,5}$/)
})

test('applyLocaleToFingerprintArgs updates locale, accept-language and timezone while preserving seed', () => {
  assert.deepEqual(
    applyLocaleToFingerprintArgs(
      ['--fingerprint=123', '--lang=en-US', '--timezone=UTC'],
      'zh-CN',
      'Asia/Shanghai',
    ),
    [
      '--fingerprint=123',
      '--lang=zh-CN',
      '--accept-lang=zh-CN,zh',
      '--timezone=Asia/Shanghai',
    ],
  )
})

test('buildAcceptLanguage keeps a base language without adding a duplicate', () => {
  assert.equal(buildAcceptLanguage('zh'), 'zh')
  assert.equal(buildAcceptLanguage('en-US'), 'en-US,en')
})

test('validateFingerprintArgs accepts the supported profile argument set', () => {
  const result = validateFingerprintArgs([
    '--fingerprint=123',
    '--fingerprint-brand=Chrome',
    '--fingerprint-platform=macos',
    '--lang=en-US',
    '--accept-lang=en-US,en',
    '--timezone=America/New_York',
    '--window-size=1920,1080',
    '--fingerprint-hardware-concurrency=8',
    '--disable-non-proxied-udp',
    '--fingerprinting-canvas-image-data-noise',
    '--fingerprinting-client-rects-noise',
  ])

  assert.equal(result.valid, true)
  assert.equal(result.issues.some((issue) => issue.level === 'error'), false)
})

test('validateFingerprintArgs rejects an invalid seed instead of creating an unsafe profile', () => {
  const result = validateFingerprintArgs(['--fingerprint=0'])

  assert.equal(result.valid, false)
  assert.equal(result.issues.some((issue) => issue.level === 'error'), true)
})




test('sanitizeAutoConfigDraft removes custom proxy credentials without mutating the live draft', () => {
  const liveDraft = {
    networkMode: 'proxy' as const,
    proxySource: 'custom' as const,
    proxyConfig: 'socks5://user:password@example.com:1080',
    marker: 'keep-me',
  }

  const sanitized = sanitizeAutoConfigDraft(liveDraft)

  assert.equal(sanitized.proxyConfig, '')
  assert.equal(sanitized.proxyConfigRedacted, true)
  assert.equal(sanitized.marker, 'keep-me')
  assert.equal(liveDraft.proxyConfig, 'socks5://user:password@example.com:1080')
  assert.equal(JSON.stringify(sanitized).includes('password'), false)
})

test('sanitizeAutoConfigDraft preserves the redaction marker when restoring a safe draft', () => {
  const sanitized = sanitizeAutoConfigDraft({
    networkMode: 'proxy' as const,
    proxySource: 'custom' as const,
    proxyConfig: '',
    proxyConfigRedacted: true,
  })

  assert.equal(sanitized.proxyConfig, '')
  assert.equal(sanitized.proxyConfigRedacted, true)
})

test('sanitizeAutoConfigDraft clears unexpected proxy values in direct drafts too', () => {
  const sanitized = sanitizeAutoConfigDraft({
    networkMode: 'direct' as const,
    proxyConfig: 'http://user:password@example.com:8080',
  })

  assert.equal(sanitized.proxyConfig, '')
  assert.equal(sanitized.proxyConfigRedacted, false)
})

test('isAutoConfigProxyReady requires an explicit network choice', () => {
  assert.equal(isAutoConfigProxyReady(null, 'pool', '', ''), false)
  assert.equal(isAutoConfigProxyReady('direct', 'pool', '', ''), true)
  assert.equal(isAutoConfigProxyReady('proxy', 'pool', 'node-1', ''), true)
  assert.equal(isAutoConfigProxyReady('proxy', 'custom', '', 'socks5://127.0.0.1:1080'), true)
  assert.equal(isAutoConfigProxyReady('proxy', 'custom', '', ''), false)
})
