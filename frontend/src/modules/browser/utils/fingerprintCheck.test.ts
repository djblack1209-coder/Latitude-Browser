import assert from 'node:assert/strict'
import test from 'node:test'

import type { BrowserFingerprintCheckResult } from '../types'
import { compareFingerprintValue, evaluateFingerprintCheck } from './fingerprintCheck.ts'

const makeResult = (
  expected: Record<string, unknown> = {},
  runtime: Record<string, unknown> = {},
): BrowserFingerprintCheckResult => ({
  profileId: 'profile-test',
  expected: {
    language: '',
    acceptLanguage: '',
    timezone: '',
    hardwareConcurrency: '',
    deviceMemory: '',
    colorDepth: '',
    touchPoints: '',
    windowSize: '',
    brand: '',
    brandVersion: '',
    platform: '',
    platformVersion: '',
    seed: '',
    disableSpoofing: '',
    webrtcPolicy: '',
    doNotTrack: '',
    mediaDevices: '',
    canvasNoise: '',
    audioNoise: '',
    clientRectsNoise: '',
    fontList: '',
    webglVendor: '',
    webglRenderer: '',
    ...expected,
  },
  runtime: {
    language: '',
    languages: [],
    timezone: '',
    hardwareConcurrency: 0,
    deviceMemory: 0,
    maxTouchPoints: 0,
    doNotTrack: '',
    mediaDeviceCount: 0,
    platform: '',
    userAgent: '',
    userAgentData: '',
    webdriver: false,
    screenWidth: 0,
    screenHeight: 0,
    colorDepth: 0,
    innerWidth: 0,
    innerHeight: 0,
    outerWidth: 0,
    outerHeight: 0,
    devicePixelRatio: 1,
    webglVendor: '',
    webglRenderer: '',
    canvasHash: '',
    audioHash: '',
    clientRectsHash: '',
    plugins: [],
    ...runtime,
  },
})

test('compareFingerprintValue handles platform aliases and browser versions', () => {
  assert.equal(compareFingerprintValue('macOS', 'MacIntel', 'platform'), 'match')
  assert.equal(compareFingerprintValue('145', 'Chrome/145.0.1.2', 'browser-version'), 'compatible')
  assert.equal(compareFingerprintValue('144', 'Chrome/145.0.1.2', 'browser-version'), 'mismatch')
})

test('matching expected and runtime values pass the quick check', () => {
  const evaluation = evaluateFingerprintCheck(makeResult(
    {
      language: 'en-US',
      acceptLanguage: 'en-US,en',
      timezone: 'America/New_York',
      hardwareConcurrency: '8',
      windowSize: '1280,720',
      brand: 'Chromium',
      brandVersion: '145',
      platform: 'macOS',
      platformVersion: '10.15',
    },
    {
      language: 'en-US',
      languages: ['en-US', 'en'],
      timezone: 'America/New_York',
      hardwareConcurrency: 8,
      innerWidth: 1280,
      innerHeight: 720,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/145.0.1.2 Safari/537.36',
      platform: 'MacIntel',
      webdriver: false,
    },
  ))

  assert.equal(evaluation.status, 'passed')
  assert.equal(evaluation.summary.hasBlockingMismatch, false)
  assert.equal(evaluation.summary.isComparable, true)
  assert.equal(evaluation.rows.find((row) => row.key === 'acceptLanguage')?.status, 'match')
})

test('a configured CPU mismatch fails without turning optional fields into failures', () => {
  const evaluation = evaluateFingerprintCheck(makeResult(
    { language: 'en-US', hardwareConcurrency: '8', deviceMemory: '8' },
    { language: 'en-US', hardwareConcurrency: 4, deviceMemory: 4, webdriver: false },
  ))

  assert.equal(evaluation.status, 'failed')
  assert.equal(evaluation.summary.hasBlockingMismatch, true)
  assert.equal(evaluation.rows.find((row) => row.key === 'hardwareConcurrency')?.status, 'mismatch')
  assert.equal(evaluation.rows.find((row) => row.key === 'deviceMemory')?.blocking, false)
  assert.equal(evaluation.rows.find((row) => row.key === 'deviceMemory')?.status, 'observe')
})

test('webdriver exposure is always a blocking failure', () => {
  const evaluation = evaluateFingerprintCheck(makeResult(
    { language: 'en-US' },
    { language: 'en-US', webdriver: true },
  ))

  assert.equal(evaluation.status, 'failed')
  assert.equal(evaluation.rows.find((row) => row.key === 'webdriver')?.status, 'mismatch')
})

test('an empty expected snapshot remains unavailable instead of falsely passing', () => {
  const evaluation = evaluateFingerprintCheck(makeResult({}, { language: 'en-US', webdriver: false }))

  assert.equal(evaluation.status, 'unavailable')
  assert.equal(evaluation.summary.isComparable, false)
  assert.equal(evaluation.summary.hasBlockingMismatch, false)
})

test('window comparison falls back to outer dimensions as compatible', () => {
  const evaluation = evaluateFingerprintCheck(makeResult(
    { windowSize: '1280,720' },
    { outerWidth: 1280, outerHeight: 720, innerWidth: 0, innerHeight: 0, webdriver: false },
  ))

  assert.equal(evaluation.status, 'passed')
  assert.equal(evaluation.rows.find((row) => row.key === 'windowSize')?.status, 'compatible')
})

test('accept-language requires the configured order but allows an extra runtime language', () => {
  assert.equal(compareFingerprintValue('zh-CN,zh', ['zh-CN', 'zh', 'en-US'], 'accept-language'), 'compatible')
  assert.equal(compareFingerprintValue('zh-CN,zh', ['en-US', 'zh-CN'], 'accept-language'), 'mismatch')
})


test('UAData-only browser evidence supplies a consistent brand and version result', () => {
  const evaluation = evaluateFingerprintCheck(makeResult(
    { brand: 'Chrome', brandVersion: '145' },
    {
      userAgentData: JSON.stringify({ brands: [{ brand: 'Chromium', version: '145' }] }),
      webdriver: false,
    },
  ))

  assert.equal(evaluation.rows.find((row) => row.key === 'brand')?.status, 'compatible')
  assert.equal(evaluation.rows.find((row) => row.key === 'brandVersion')?.status, 'match')
  assert.equal(evaluation.status, 'passed')
})

test('window fallback renders the dimensions that were actually used', () => {
  const evaluation = evaluateFingerprintCheck(makeResult(
    { windowSize: '1280,720' },
    { outerWidth: 1280, outerHeight: 720, webdriver: false },
  ))

  assert.equal(evaluation.rows.find((row) => row.key === 'windowSize')?.actual, '1280,720 (outer)')
})

test('configured WebRTC policy remains unavailable until candidate leakage is checked', () => {
  const evaluation = evaluateFingerprintCheck(makeResult(
    {
      language: 'en-US',
      timezone: 'America/New_York',
      hardwareConcurrency: '8',
      webrtcPolicy: 'disable_non_proxied_udp',
    },
    {
      language: 'en-US',
      timezone: 'America/New_York',
      hardwareConcurrency: 8,
      webdriver: false,
    },
  ))

  assert.equal(evaluation.status, 'unavailable')
  assert.equal(evaluation.summary.hasBlockingMismatch, false)
  assert.equal(evaluation.rows.find((row) => row.key === 'webrtcPolicy')?.status, 'unreadable')
})
