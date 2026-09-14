import { getGoApp } from './runtime'

export interface BrowserPlatformCapabilities {
  platform: string
  memoryHardLimit: boolean
  memoryHardLimitReason: string
}

export async function fetchBrowserPlatformCapabilities(): Promise<BrowserPlatformCapabilities> {
  const app = getGoApp()
  if (!app) return { platform: 'development', memoryHardLimit: false, memoryHardLimitReason: '开发模拟模式不提供实例内存硬限制。' }
  const result = await app.BrowserPlatformCapabilities()
  if (typeof result?.platform !== 'string' || typeof result?.memoryHardLimit !== 'boolean') {
    throw new Error('桌面服务未返回有效的平台能力，操作未执行。')
  }
  return result
}
