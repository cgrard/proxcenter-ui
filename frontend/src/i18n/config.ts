// src/i18n/config.ts
export const locales = ['fr', 'en', 'zh-CN'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

// Labels for each locale
export const localeNames: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  'zh-CN': '简体中文'
}

// Flag emojis for each locale
export const localeFlags: Record<Locale, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
  'zh-CN': '🇨🇳'
}
