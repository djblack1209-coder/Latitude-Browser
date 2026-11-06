import { tr } from '../../../shared/i18n'
import { getGoApp } from './runtime'

export interface BrowserPlatformCapabilities {
  platform: string
  memoryHardLimit: boolean
  memoryHardLimitReason: string
}

export async function fetchBrowserPlatformCapabilities(): Promise<BrowserPlatformCapabilities> {
  const app = getGoApp()
  if (!app) return { platform: 'development', memoryHardLimit: false, memoryHardLimitReason: tr("browser.api.platform.memoryHardLimitReason.484a090") }
  const result = await app.BrowserPlatformCapabilities()
  if (typeof result?.platform !== 'string' || typeof result?.memoryHardLimit !== 'boolean') {
    throw new Error(tr("browser.api.platform.fetchBrowserPlatformCapabilities.e6b1712"))
  }
  return result
}
