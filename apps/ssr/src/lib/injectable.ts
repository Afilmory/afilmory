import siteConfig from '@config'
import type { DOMParser } from 'linkedom'

import { DbManager } from './db'

type HtmlElement = ReturnType<typeof DOMParser.prototype.parseFromString>
type OnlyHTMLDocument = HtmlElement extends infer T ? (T extends { [key: string]: any; head: any } ? T : never) : never
export const injectConfigToDocument = (document: OnlyHTMLDocument) => {
  const $config = document.head.querySelector('#config')
  const injectConfigBase = {
    useApi: DbManager.shared.isEnabled(),
    useNext: true,
  }
  if ($config) {
    $config.innerHTML = `window.__CONFIG__ = ${JSON.stringify(injectConfigBase)};window.__SITE_CONFIG__ = ${JSON.stringify(siteConfig)};`
  }
  return document
}
