import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Locale } from '../i18n'
import { otherLocale, resolveLocale, t as translate } from '../i18n'
import { APP_STORE_URL, DOCS_URL, GITHUB_URL, SELF_HOST_URL } from '../lib/links'
import { CreateSpaceModal } from './CreateSpaceModal'
import { Discover } from './Discover'
import { CanvasFeature, WallFeature } from './Features'
import { Hero } from './Hero'
import { LoginSpaceModal } from './LoginSpaceModal'
import { OpenSection } from './OpenSection'
import { Story } from './Story'
import { Ways } from './Ways'

export interface LandingAppProps {
  initialLocale?: string
}

export function LandingApp({ initialLocale }: LandingAppProps) {
  const [locale] = useState<Locale>(() => resolveLocale(initialLocale))
  const [createOpen, setCreateOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const copy = useMemo(() => translate(locale), [locale])
  const home = locale === 'en' ? '/en/' : '/'

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.title = copy.meta.title
  }, [locale, copy.meta.title])

  const closeCreate = useCallback(() => setCreateOpen(false), [])
  const closeLogin = useCallback(() => setLoginOpen(false), [])

  const switchLocale = () => {
    const next = otherLocale(locale)
    try {
      localStorage.setItem('afilmory-site-locale', next)
    }
    catch {}
    window.location.href = next === 'en' ? '/en/' : '/'
  }

  return (
    <>
      <header className="lp-nav">
        <div className="lp-in">
          <a className="lp-mark" href={home}>
            Afilmory
          </a>
          <button type="button" className="lp-nav-link lp-hide-sm" onClick={switchLocale}>
            {copy.nav.lang}
          </button>
          <button type="button" className="lp-nav-link" onClick={() => setLoginOpen(true)}>
            {copy.nav.login}
          </button>
          <button type="button" className="lp-cap lp-cap-sm" onClick={() => setCreateOpen(true)}>
            {copy.nav.create}
          </button>
        </div>
      </header>

      <main>
        <Hero copy={copy.hero} />
        <Story statement={copy.statement} principles={copy.principles} />
        <WallFeature copy={copy.wall} />
        <CanvasFeature copy={copy.canvas} />
        <Discover copy={copy.discover} />
        <Ways copy={copy.ways} />
        <OpenSection copy={copy.open} createCopy={copy.createModal} />
      </main>

      <footer className="lp-footer">
        <div className="lp-in">
          <div>
            <span className="lp-mark">Afilmory</span>
            <span>afilmory.art</span>
          </div>
          <nav aria-label="Footer">
            <a href={locale === 'en' ? '/en/terms/' : '/terms/'}>{copy.footer.terms}</a>
            <a href={locale === 'en' ? '/en/privacy/' : '/privacy/'}>{copy.footer.privacy}</a>
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              {copy.footer.docs}
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              {copy.footer.github}
            </a>
            <a href={SELF_HOST_URL} target="_blank" rel="noreferrer">
              {copy.footer.selfHost}
            </a>
            <a href={APP_STORE_URL} target="_blank" rel="noreferrer">
              {copy.footer.appStore}
            </a>
            <button type="button" onClick={switchLocale}>
              {copy.nav.lang}
            </button>
          </nav>
        </div>
      </footer>

      <CreateSpaceModal open={createOpen} onClose={closeCreate} locale={locale} />
      <LoginSpaceModal open={loginOpen} onClose={closeLogin} locale={locale} />
    </>
  )
}
