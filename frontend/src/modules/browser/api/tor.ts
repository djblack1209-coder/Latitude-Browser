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
      message: app ? '当前桌面版本尚未提供 Tor 运行时接口，请安装本次构建后检查。' : '界面预览未连接桌面，不能配置或验证 Tor。',
    }
  }
  const result = await app.GetTorStatus()
  return { ...result, activeProfiles: result?.activeProfiles || [], available: true }
}

export async function setTorRuntimePath(path: string): Promise<TorRuntimeStatus> {
  const app = getGoApp()
  if (typeof app?.SetTorRuntimePath !== 'function') throw new Error('Tor 配置仅能在支持此功能的桌面应用中保存')
  const result = await app.SetTorRuntimePath(path)
  return { ...result, activeProfiles: result?.activeProfiles || [], available: true }
}
