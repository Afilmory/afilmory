import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@afilmory/ui'
import { Check, Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { currentSupportedLanguages } from '~/@types/constants'

const languageLabels: Record<string, string> = {
  'en': 'English',
  'zh-CN': '简体中文',
}

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()

  const currentLanguage = i18n.resolvedLanguage || i18n.language || 'en'

  const handleChange = (lng: string) => {
    void i18n.changeLanguage(lng)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-text-secondary transition-all duration-200 hover:bg-fill/50 hover:text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
          aria-label={t('common.language')}
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">{languageLabels[currentLanguage] ?? currentLanguage}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {currentSupportedLanguages.map(lng => (
          <DropdownMenuItem
            key={lng}
            onClick={() => handleChange(lng)}
            className={currentLanguage === lng ? 'bg-fill/50 text-text' : ''}
          >
            <span className="flex w-full items-center justify-between">
              {languageLabels[lng] ?? lng}
              {currentLanguage === lng && <Check className="ml-2 h-4 w-4" />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
