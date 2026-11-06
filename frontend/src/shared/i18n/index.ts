import { useSyncExternalStore } from 'react'
import { enUS } from './en-US'
import { zhCN } from './zh-CN'
import { wireSource } from './wire'

export type Locale = 'en-US' | 'zh-CN'
export type LanguagePreference = Locale | 'system'
export type MessageKey = keyof typeof enUS
const listeners = new Set<() => void>()
let systemLocale = typeof navigator === 'undefined' ? 'en-US' : navigator.languages?.[0] || navigator.language
let preference: LanguagePreference = 'system'
try { const saved = localStorage.getItem('latitude.language'); if (saved === 'en-US' || saved === 'zh-CN') preference = saved } catch { /* restricted storage */ }
export function getLocale(): Locale { return (preference === 'system' ? systemLocale : preference).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US' }
export function getLanguagePreference() { return preference }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function useLocale() { return useSyncExternalStore(subscribe, getLocale, getLocale) }
export function useT() { useLocale(); return tr }
function applyLanguage() { document.documentElement.lang = getLocale(); document.title = 'Latitude Browser'; listeners.forEach(listener => listener()); window.dispatchEvent(new Event('latitude:locale-changed')) }
export async function initializeLocale() {
  applyLanguage()
  const app = (window as any).go?.main?.App
  if (app?.GetSystemLocale && app?.GetUILanguage) {
    try { const [system, saved] = await Promise.all([app.GetSystemLocale(), app.GetUILanguage()]); systemLocale = system || systemLocale; if (['system','en-US','zh-CN'].includes(saved)) preference = saved } catch { /* retain last verified preference */ }
  }
  applyLanguage()
}
export async function setLanguage(next: LanguagePreference) {
  const app = (window as any).go?.main?.App
  if (app?.SetUILanguage) await app.SetUILanguage(next)
  preference = next
  try { localStorage.setItem('latitude.language', next) } catch { /* native config remains authoritative */ }
  applyLanguage()
}
export function tr(key: MessageKey, params: Record<string, unknown> | readonly unknown[] = {}): string {
  const message = getLocale() === 'zh-CN' ? zhCN[key] : enUS[key]
  return String(message).replace(/\{(\w+)\}/g, (all, name: string) => Object.prototype.hasOwnProperty.call(params, name) ? String((params as Record<string, unknown>)[name]) : all)
}
export const t = tr
/** Source-language protocol tokens stay stable when they are parsed or compared. */
export function sourceText(key: MessageKey, params: readonly unknown[] = []): string { return (wireSource[key] ?? zhCN[key]).replace(/\{(\d+)\}/g, (all, name: string) => Number(name) < params.length ? String(params[Number(name)]) : all) }
/** Module-level option tables are evaluated lazily and cached per locale. */
export function localized<T extends object>(factory: () => T): T {
  let language: Locale | undefined, value: T
  const current = () => { if (language !== getLocale()) { value = factory(); language = getLocale() }; return value }
  const first = current()
  return new Proxy(Array.isArray(first) ? [] as unknown as T : {} as T, {
    get(_target, key) { const object = current(); const result = Reflect.get(object, key, object); return typeof result === 'function' ? result.bind(object) : result },
    has(_target, key) { return key in current() },
    ownKeys() { return Reflect.ownKeys(current()) },
    getOwnPropertyDescriptor(_target, key) { const descriptor = Reflect.getOwnPropertyDescriptor(current(), key); return descriptor ? { ...descriptor, configurable: key !== 'length' } : undefined },
  })
}
export function formatDate(value: Date | number | string, options?: Intl.DateTimeFormatOptions) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(getLocale(), options).format(date) : '—' }
export function formatNumber(value: number, options?: Intl.NumberFormatOptions) { return new Intl.NumberFormat(getLocale(), options).format(value) }
export function relativeTime(value: string | undefined) { if (!value) return '—'; const milliseconds = Date.parse(value); if (!Number.isFinite(milliseconds)) return '—'; const seconds = (milliseconds - Date.now()) / 1000; const unit = Math.abs(seconds) < 60 ? 'second' : Math.abs(seconds) < 3600 ? 'minute' : Math.abs(seconds) < 86400 ? 'hour' : 'day'; const divisor = { second: 1, minute: 60, hour: 3600, day: 86400 }[unit]; return new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(Math.round(seconds / divisor), unit) }

const messageLookup = new Map<string, MessageKey>()
const messagePatterns: { key: MessageKey; expressions: RegExp[]; names: string[] }[] = []
function messagePattern(message: string) {
  const names: string[] = []
  let cursor = 0, pattern = '^'
  for (const match of message.matchAll(/\{(\w+)\}/g)) {
    pattern += message.slice(cursor, match.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([\\s\\S]*?)'
    names.push(match[1]); cursor = match.index! + match[0].length
  }
  pattern += message.slice(cursor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'
  return { expression: new RegExp(pattern), names }
}
for (const key of Object.keys(enUS) as MessageKey[]) {
  messageLookup.set(zhCN[key], key); messageLookup.set(enUS[key], key)
  if (zhCN[key].includes('{') && zhCN[key].replace(/\{\w+\}/g, '').trim().length >= 4) {
    const source = messagePattern(zhCN[key]), english = messagePattern(enUS[key])
    messagePatterns.push({ key, expressions: [source.expression, english.expression], names: source.names })
  }
}
/** Translate known app diagnostics; user data and raw upstream output stay intact. */
function diagnostic(value: string, depth = 0): string {
  if (depth > 5) return value
  const key = messageLookup.get(value)
  if (key) return tr(key)
  for (const item of messagePatterns) {
    for (const expression of item.expressions) {
      const match = expression.exec(value)
      if (!match) continue
      const params = Object.fromEntries(item.names.map((name, index) => [name, diagnostic(match[index + 1], depth + 1)]))
      return tr(item.key, params)
    }
  }
  return value
}
export function translateMessage<T>(value: T): T {
  return typeof value === 'string' ? diagnostic(value) as T : value
}
