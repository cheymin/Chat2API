import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import esES from './locales/es-ES.json'
import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'

const resources = {
  'es-ES': {
    translation: esES,
  },
  'en-US': {
    translation: enUS,
  },
  'zh-CN': {
    translation: zhCN,
  },
}

/**
 * Determine the initial language from persisted zustand store or browser navigator.
 * We no longer use i18next-browser-languagedetector to avoid race conditions
 * with zustand's persist middleware (both writing to localStorage independently).
 */
function getInitialLanguage(): string {
  try {
    const stored = localStorage.getItem('chat2api-settings')
    if (stored) {
      const parsed = JSON.parse(stored)
      const lang = parsed?.state?.language
      if (lang === 'es-ES' || lang === 'en-US' || lang === 'zh-CN') {
        return lang
      }
    }
  } catch {
    // ignore parse errors
  }

  // 默认中文，再根据浏览器语言判断
  const navLang = navigator.language || ''
  if (navLang.startsWith('en')) return 'en-US'
  if (navLang.startsWith('es')) return 'es-ES'
  return 'zh-CN'
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'zh-CN',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
