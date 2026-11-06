import { tr, localized } from '../../../shared/i18n'
﻿export type FingerprintCapabilityMode = 'configurable' | 'seed' | 'platform_limited' | 'unconfirmed' | 'removed'

export interface FingerprintCapabilityItem {
  id: string
  name: string
  mode: FingerprintCapabilityMode
  coverage: string
  args: string[]
}

export interface FingerprintPersona {
  id: string
  name: string
  region: string
  platform: 'windows' | 'macos' | 'linux'
  brand: 'Chrome' | 'Edge' | 'Opera' | 'Vivaldi'
  lang: string
  timezone: string
  resolution: string
  hardwareConcurrency: string
  brandVersion?: string
  platformVersion?: string
}

export const FINGERPRINT_CAPABILITIES: FingerprintCapabilityItem[] = localized(() => ([
  {
    id: 'seed',
    name: tr("browser.utils.fingerprintCapabilities.name.38b68ae"),
    mode: 'configurable',
    coverage: tr("browser.utils.fingerprintCapabilities.coverage.7b7d7d5"),
    args: ['--fingerprint'],
  },
  {
    id: 'identity',
    name: tr("browser.copyOptions.label.6419965"),
    mode: 'configurable',
    coverage: tr("browser.utils.fingerprintCapabilities.coverage.0ed4846"),
    args: ['--fingerprint-brand', '--fingerprint-brand-version', '--fingerprint-platform', '--fingerprint-platform-version'],
  },
  {
    id: 'locale',
    name: tr("browser.copyOptions.label.fec658f"),
    mode: 'configurable',
    coverage: tr("browser.utils.fingerprintCapabilities.coverage.51c87db"),
    args: ['--lang', '--accept-lang', '--timezone'],
  },
  {
    id: 'hardware',
    name: 'CPU',
    mode: 'configurable',
    coverage: tr("browser.utils.fingerprintCapabilities.coverage.e0348d8"),
    args: ['--fingerprint-hardware-concurrency'],
  },
  {
    id: 'canvas-audio',
    name: 'Canvas / Audio',
    mode: 'configurable',
    coverage: tr("browser.utils.fingerprintCapabilities.coverage.611fe35"),
    args: ['--fingerprinting-canvas-image-data-noise', '--disable-spoofing=canvas,audio'],
  },
  {
    id: 'fonts-clientrects',
    name: tr("browser.utils.fingerprintCapabilities.name.2cc6fbe"),
    mode: 'configurable',
    coverage: tr("browser.utils.fingerprintCapabilities.coverage.71ec2a0"),
    args: ['--fingerprinting-client-rects-noise', '--disable-spoofing=font,clientrects'],
  },
  {
    id: 'webgl',
    name: tr("browser.utils.fingerprintCapabilities.name.8a17678"),
    mode: 'unconfirmed',
    coverage: tr("browser.utils.fingerprintCapabilities.coverage.b9a1fd7"),
    args: ['--disable-spoofing=gpu'],
  },
  {
    id: 'webrtc',
    name: tr("browser.utils.fingerprintCapabilities.name.2cc6f77"),
    mode: 'configurable',
    coverage: tr("browser.utils.fingerprintCapabilities.coverage.674c8b2"),
    args: ['--disable-non-proxied-udp', '--webrtc-ip-handling-policy'],
  },
  {
    id: 'gpu-legacy',
    name: tr("browser.utils.fingerprintCapabilities.name.d5ffa31"),
    mode: 'removed',
    coverage: tr("browser.utils.fingerprintCapabilities.coverage.f27f98e"),
    args: ['--fingerprint-gpu-vendor', '--fingerprint-gpu-renderer', '--disable-gpu-fingerprint'],
  },
]))

export const FINGERPRINT_PERSONAS: FingerprintPersona[] = localized(() => ([
  {
    id: 'us-win-chrome-office',
    name: tr("browser.utils.fingerprintCapabilities.name.0acf767"),
    region: 'US',
    platform: 'windows',
    brand: 'Chrome',
    lang: 'en-US',
    timezone: 'America/New_York',
    resolution: '1920,1080',
    hardwareConcurrency: '8',
    platformVersion: '10.0.0',
  },
  {
    id: 'jp-mac-chrome-light',
    name: tr("browser.utils.fingerprintCapabilities.name.00b3699"),
    region: 'JP',
    platform: 'macos',
    brand: 'Chrome',
    lang: 'ja-JP',
    timezone: 'Asia/Tokyo',
    resolution: '1440,900',
    hardwareConcurrency: '8',
    platformVersion: '15.2.0',
  },
  {
    id: 'uk-win-edge-enterprise',
    name: tr("browser.utils.fingerprintCapabilities.name.7779014"),
    region: 'GB',
    platform: 'windows',
    brand: 'Edge',
    lang: 'en-GB',
    timezone: 'Europe/London',
    resolution: '1920,1080',
    hardwareConcurrency: '8',
    platformVersion: '10.0.0',
  },
  {
    id: 'sg-win-chrome-business',
    name: tr("browser.utils.fingerprintCapabilities.name.99908b9"),
    region: 'SG',
    platform: 'windows',
    brand: 'Chrome',
    lang: 'en-SG',
    timezone: 'Asia/Singapore',
    resolution: '1920,1080',
    hardwareConcurrency: '8',
    platformVersion: '10.0.0',
  },
  {
    id: 'de-linux-chrome-dev',
    name: tr("browser.utils.fingerprintCapabilities.name.bdf4adf"),
    region: 'DE',
    platform: 'linux',
    brand: 'Chrome',
    lang: 'de-DE',
    timezone: 'Europe/Berlin',
    resolution: '1920,1080',
    hardwareConcurrency: '12',
  },
]))

export function capabilityModeLabel(mode: FingerprintCapabilityMode): string {
  if (mode === 'configurable') return tr("browser.utils.fingerprintCapabilities.capabilityModeLabel.47e6c48")
  if (mode === 'seed') return tr("browser.utils.fingerprintCapabilities.capabilityModeLabel.2ba06f6")
  if (mode === 'platform_limited') return tr("browser.utils.fingerprintCapabilities.capabilityModeLabel.3d44412")
  if (mode === 'unconfirmed') return tr("browser.pages.BrowserEditPage.not_effective.01516e9")
  return tr("browser.utils.fingerprintCapabilities.capabilityModeLabel.4e5c495")
}
