import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@afilmory/ui'
import { useTranslation } from 'react-i18next'

import { currentSupportedLanguages } from '~/@types/constants'

const languageLabels: Record<string, string> = {
  'en': 'English',
  'jp': '日本語',
  'ko': '한국어',
  'zh-CN': '简体中文',
  'zh-HK': '繁體中文（香港）',
  'zh-TW': '繁體中文（台灣）',
}

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const current = i18n.resolvedLanguage || i18n.language || 'en'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex size-7 items-center justify-center rounded text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white lg:size-8"
          title={t('action.language')}
          aria-label={t('action.language')}
        >
          <i className="i-mingcute-translate-2-line text-sm lg:text-base" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <div className="px-2 py-1.5 text-xs font-medium text-white/50">{t('action.language')}</div>
        {currentSupportedLanguages.map(lng => (
          <DropdownMenuItem key={lng} onClick={() => void i18n.changeLanguage(lng)} className="justify-between">
            <span>{languageLabels[lng] ?? lng}</span>
            {current === lng && <i className="i-mingcute-check-line text-base" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
