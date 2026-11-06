import { tr } from '../../../shared/i18n'
import type { BrowserCore, BrowserProfile, BrowserProxy, BrowserSettings } from '../types'

export class DesktopBridgeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'DesktopBridgeError'
  }
}

export function isDevelopmentMockEnabled(): boolean {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env
  return env?.DEV === true && env?.VITE_ENABLE_DEV_MOCK === 'true'
}

export function desktopBridgeAvailable(): boolean {
  return !!(globalThis as any).go?.main?.App
}

function requireDesktopApp(): any {
  const app = (globalThis as any).go?.main?.App
  if (app) return app
  if (isDevelopmentMockEnabled()) return null
  throw new DesktopBridgeError('DESKTOP_BRIDGE_UNAVAILABLE', tr("browser.api.runtime.requireDesktopApp.70b5320"))
}

function checkedMethods<T extends object>(methods: T): T {
  // Rollup freezes binding namespaces. Wrap a mutable facade so returning a
  // checked function cannot violate the source object's Proxy invariants.
  return new Proxy({ ...methods }, {
    get(_target, name) {
      // Promise resolution probes then; it is not a backend operation.
      if (typeof name !== 'string' || name === 'then') return Reflect.get(methods, name, methods)
      const app = requireDesktopApp()
      const method = Reflect.get(methods, name, methods)
      if (typeof app?.[name] !== 'function' || typeof method !== 'function') {
        throw new DesktopBridgeError('DESKTOP_METHOD_UNAVAILABLE', tr("browser.api.runtime.checkedMethods.88034cd", [name]))
      }
      return (...args: unknown[]) => {
        // Validate again at invocation if the bridge changed since lookup.
        if (typeof requireDesktopApp()?.[name] !== 'function') {
          throw new DesktopBridgeError('DESKTOP_METHOD_UNAVAILABLE', tr("browser.api.runtime.checkedMethods.7200152"))
        }
        return Reflect.apply(method, methods, args)
      }
    },
  })
}

export async function getBindings() {
  if (!requireDesktopApp()) return null

  let bindings
  try {
    bindings = await import('../../../wailsjs/go/main/App')
  } catch {
    throw new DesktopBridgeError('DESKTOP_BINDINGS_LOAD_FAILED', tr("browser.api.runtime.getBindings.7516b75"))
  }
  return checkedMethods(bindings)
}

export function getGoApp(): any {
  const app = requireDesktopApp()
  return app ? checkedMethods(app) : null
}

export function nowISOString(): string {
  return new Date().toISOString()
}

export function createDefaultBrowserSettings(): BrowserSettings {
  return {
    userDataRoot: 'data',
    defaultFingerprintArgs: [],
    defaultLaunchArgs: [],
    defaultStartUrls: [],
    lightStartEnabled: true,
    restoreLastSession: false,
    startReadyTimeoutMs: 3000,
    startStableWindowMs: 1200,
    defaultConnectorType: 'xray',
  }
}

let mockProfiles: BrowserProfile[] = [
  {
    profileId: 'mock-1',
    profileName: tr("browser.api.runtime.profileName.5048212"),
    userDataDir: 'data/default',
    coreId: 'default',
    fingerprintArgs: ['--fingerprint-brand=Chrome', '--fingerprint-platform=windows'],
    proxyId: '',
    proxyConfig: '',
    memoryLimitMb: 0,
    launchArgs: ['--disable-features=Translate'],
    tags: [tr("browser.api.runtime.message.c8d09cf")],
    keywords: [],
    running: false,
    debugPort: 0,
    debugReady: false,
    pid: 0,
    runtimeWarning: '',
    lastError: '',
    createdAt: nowISOString(),
    updatedAt: nowISOString(),
  },
]

let mockCores: BrowserCore[] = []
let mockProxies: BrowserProxy[] = []

export function getMockProfiles(): BrowserProfile[] {
  return mockProfiles
}

export function setMockProfiles(next: BrowserProfile[]): void {
  mockProfiles = next
}

export function getMockCores(): BrowserCore[] {
  return mockCores
}

export function setMockCores(next: BrowserCore[]): void {
  mockCores = next
}

export function getMockProxies(): BrowserProxy[] {
  return mockProxies
}

export function setMockProxies(next: BrowserProxy[]): void {
  mockProxies = next
}
