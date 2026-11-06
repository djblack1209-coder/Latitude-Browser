import { tr, localized } from '../../shared/i18n'
// Settings 模块类型定义

export interface AppSettings {
  id?: number
  // 基础设置
  appName: string
  appDescription: string

  // 外观设置
  theme: 'dark' | 'dark' | 'system'
  primaryColor: string
  language: string

  // 功能设置
  enableNotifications: boolean
  enableAutoSave: boolean
  autoSaveInterval: number

  // 高级设置
  maxUploadSize: number
  sessionTimeout: number
  cacheEnabled: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'

  // 运行时设置
  maxMemoryMB: number
  gcPercent: number
}

export const defaultSettings: AppSettings = localized(() => ({
  appName: 'Latitude Browser',
  appDescription: tr("config.projectBase.config.description.6a15bf5"),
  theme: 'dark',
  primaryColor: 'var(--accent)',
  language: 'system',
  enableNotifications: true,
  enableAutoSave: true,
  autoSaveInterval: 30,
  maxUploadSize: 10,
  sessionTimeout: 30,
  cacheEnabled: true,
  logLevel: 'info',
  maxMemoryMB: 1024,
  gcPercent: 100,
}))
