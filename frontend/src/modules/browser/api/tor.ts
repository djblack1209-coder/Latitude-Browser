import { tr } from '../../../shared/i18n'
import { getGoApp } from './runtime'

export interface TorProfileRuntimeStatus {
  profileId: string
  state: string
  ready: boolean
  pid: number
  socksAddress: string
  bootstrapPercent: number
  startedAt: string
  lastError?: string
}

export interface TorRuntimeStatus {
  experimental: boolean
  productionReady: boolean
  configured: boolean
  binaryPath: string
  /** File/path validation only; not a signature or network-privacy attestation. */
  binaryValid: boolean
  activeProfiles: TorProfileRuntimeStatus[]
  message: string
  available: boolean
}

export async function fetchTorStatus(): Promise<TorRuntimeStatus> {
  const app = getGoApp()
  if (typeof app?.GetTorStatus !== 'function') {
    return {
      available: false, experimental: true, productionReady: false,
      configured: false, binaryPath: '', binaryValid: false, activeProfiles: [],
      message: app ? tr("browser.api.tor.fetchTorStatus.37033d5") : tr("browser.api.tor.fetchTorStatus.291012a"),
    }
  }
  const result = await app.GetTorStatus()
  return { ...result, activeProfiles: result?.activeProfiles || [], available: true }
}

export async function setTorRuntimePath(path: string): Promise<TorRuntimeStatus> {
  const app = getGoApp()
  if (typeof app?.SetTorRuntimePath !== 'function') throw new Error(tr("browser.api.tor.setTorRuntimePath.85f6841"))
  const result = await app.SetTorRuntimePath(path)
  return { ...result, activeProfiles: result?.activeProfiles || [], available: true }
}
