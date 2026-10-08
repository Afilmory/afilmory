import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { atom } from 'jotai'
import { initReactI18next } from 'react-i18next'

import { currentSupportedLanguages, defaultNS, ns } from './@types/constants'
import { resources } from './@types/resources'
import { jotaiStore } from './lib/jotai'

const i18n = i18next.createInstance()

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: {
      default: ['en'],
    },
    supportedLngs: currentSupportedLanguages,
    defaultNS,
    ns,
    resources,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    returnNull: false,
  })

export { i18n }

export const i18nAtom = atom(i18n)

export const getI18n = () => jotaiStore.get(i18nAtom)
