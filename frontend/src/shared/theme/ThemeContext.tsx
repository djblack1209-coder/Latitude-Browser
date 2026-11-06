import { useLocale } from '../i18n'
import { useEffect, type ReactNode } from 'react'

/** Fieldwork is the application theme. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useLocale()

  useEffect(() => { document.documentElement.dataset.theme = 'dark' }, [])
  return <>{children}</>
}
