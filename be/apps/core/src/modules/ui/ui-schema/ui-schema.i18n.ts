import { HttpContext } from '@tsuki/framework'

import enUiSchema from '../../../locales/ui-schema/en'
import zhCnUiSchema from '../../../locales/ui-schema/zh-CN'

type TranslationMap = Record<string, unknown>

const resources = {
  en: enUiSchema,
  'zh-CN': zhCnUiSchema,
} satisfies Record<string, TranslationMap>

export type SupportedLanguage = keyof typeof resources

const DEFAULT_LANGUAGE: SupportedLanguage = 'en'
const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  en: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-sg': 'zh-CN',
}

let initialized = false

export type UiSchemaTFunction = (key: string) => string

export async function initUiSchemaI18n(): Promise<void> {
  initialized = true
}

function resolveTranslation(map: TranslationMap, key: string): string | null {
  const segments = key.split('.')
  let current: unknown = map

  for (const segment of segments) {
    if (typeof current !== 'object' || current === null || !(segment in current)) {
      return null
    }
    current = (current as TranslationMap)[segment]
  }

  return typeof current === 'string' ? current : null
}

export function detectLanguageFromHeader(acceptLanguage?: string | null): SupportedLanguage {
  if (!acceptLanguage) {
    return DEFAULT_LANGUAGE
  }

  const candidates = acceptLanguage
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(';')[0]!.trim().toLowerCase())
    .filter(Boolean)

  for (const candidate of candidates) {
    if (candidate in resources) {
      return candidate as SupportedLanguage
    }

    if (candidate in LANGUAGE_ALIASES) {
      return LANGUAGE_ALIASES[candidate]
    }

    const base = candidate.split('-')[0]
    if (base && base in LANGUAGE_ALIASES) {
      return LANGUAGE_ALIASES[base]
    }
  }

  return DEFAULT_LANGUAGE
}

export function getUiSchemaTranslator(acceptLanguage?: string | null): {
  readonly language: SupportedLanguage
  readonly t: UiSchemaTFunction
} {
  if (!initialized) {
    throw new Error('UI schema i18n is not initialized')
  }

  const contextLanguage = HttpContext.getValue('language') as SupportedLanguage | undefined
  const language =
    typeof acceptLanguage === 'string'
      ? detectLanguageFromHeader(acceptLanguage)
      : (contextLanguage ?? DEFAULT_LANGUAGE)
  const translate: UiSchemaTFunction = (key: string) => {
    const localized = resolveTranslation(resources[language], key)
    if (localized) {
      return localized
    }

    const fallback = resolveTranslation(resources[DEFAULT_LANGUAGE], key)
    return fallback ?? key
  }

  return {
    language,
    t: translate,
  }
}

export const identityUiSchemaT: UiSchemaTFunction = (key: string) => key
