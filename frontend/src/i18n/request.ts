// src/i18n/request.ts
import { cookies, headers } from 'next/headers'

import { getRequestConfig } from 'next-intl/server'

import { defaultLocale, locales, type Locale } from './config'

export default getRequestConfig(async () => {
  // Try to get locale from cookie first
  const cookieStore = await cookies()
  let locale = cookieStore.get('NEXT_LOCALE')?.value as Locale | undefined

  // If no cookie, try Accept-Language header
  if (!locale) {
    const headerStore = await headers()
    const acceptLanguage = headerStore.get('accept-language')

    if (acceptLanguage) {
      // Parse Accept-Language header and find first matching locale
      const browserLocales = acceptLanguage
        .split(',')
        .map(l => l.split(';')[0].trim())

      for (const bl of browserLocales) {
        // Try exact match first (e.g. zh-CN)
        const exact = locales.find(loc => loc.toLowerCase() === bl.toLowerCase())

        if (exact) {
          locale = exact
          break
        }

        // Fallback to 2-letter prefix match (e.g. fr-FR -> fr)
        const prefix = bl.substring(0, 2).toLowerCase()
        const prefixMatch = locales.find(loc => loc.toLowerCase() === prefix)

        if (prefixMatch) {
          locale = prefixMatch
          break
        }
      }
    }
  }

  // Fallback to default locale
  if (!locale || !locales.includes(locale)) {
    locale = defaultLocale
  }

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default
  }
})
