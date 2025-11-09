import en from '@locales/app/en.json'
import jp from '@locales/app/jp.json'
import ko from '@locales/app/ko.json'
import zhCn from '@locales/app/zh-CN.json'
import zhHk from '@locales/app/zh-HK.json'
import zhTw from '@locales/app/zh-TW.json'

import type { MainSupportedLanguages, ns } from './constants'

export const resources = {
  en: {
    app: en,
  },
  'zh-CN': {
    app: zhCn,
  },
  'zh-HK': {
    app: zhHk,
  },
  jp: {
    app: jp,
  },
  ko: {
    app: ko,
  },
  'zh-TW': {
    app: zhTw,
  },
} satisfies Record<MainSupportedLanguages, Record<(typeof ns)[number], Record<string, string>>>
