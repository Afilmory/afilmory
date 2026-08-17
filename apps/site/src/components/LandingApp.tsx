import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Locale } from '../i18n'
import { otherLocale, resolveLocale, t as translate } from '../i18n'
import { CreateSpaceModal } from './CreateSpaceModal'
import { Discover } from './Discover'
import { LiveDemo } from './LiveDemo'
import { LoginSpaceModal } from './LoginSpaceModal'

const DOCS_URL = (import.meta.env.PUBLIC_DOCS_URL as string | undefined) ?? 'https://docs.afilmory.art'
const GITHUB_URL = (import.meta.env.PUBLIC_GITHUB_URL as string | undefined) ?? 'https://github.com/Afilmory/Afilmory'
const SELF_HOST_URL = `${GITHUB_URL}#option-2-self-hosting`

export interface LandingAppProps {
  initialLocale?: string
}

export function LandingApp({ initialLocale }: LandingAppProps) {
  const [locale, setLocale] = useState<Locale>(() => resolveLocale(initialLocale))
  const [createOpen, setCreateOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const copy = useMemo(() => translate(locale), [locale])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.title = copy.meta.title
  }, [locale, copy.meta.title])

  const openCreate = useCallback(() => setCreateOpen(true), [])
  const closeCreate = useCallback(() => setCreateOpen(false), [])
  const openLogin = useCallback(() => setLoginOpen(true), [])
  const closeLogin = useCallback(() => setLoginOpen(false), [])

  const switchLocale = () => {
    const next = otherLocale(locale)
    setLocale(next)
    try {
      localStorage.setItem('afilmory-site-locale', next)
    }
    catch {
      /* ignore */
    }
    const url = new URL(window.location.href)
    url.searchParams.set('lang', next)
    window.history.replaceState({}, '', url)
  }

  return (
    <>
      <header className="site-header fixed inset-x-0 top-0 z-50 border-b border-line bg-page-80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 md:px-8">
          <a href="/" className="font-serif text-lg tracking-wide">
            Afilmory
          </a>
          <nav className="flex items-center gap-4 text-xs tracking-wide text-muted md:gap-6">
            <a href="#demo" className="nav-link-desktop hover:text-fg">
              {copy.nav.demo}
            </a>
            <a href="#discover" className="nav-link-desktop hover:text-fg">
              {copy.nav.discover}
            </a>
            <a href={DOCS_URL} target="_blank" rel="noreferrer" className="nav-link-wide hover:text-fg">
              {copy.nav.docs}
            </a>
            <button
              type="button"
              onClick={switchLocale}
              className="font-mono text-xs tracking-wider text-dim hover:text-fg"
            >
              {copy.nav.lang}
            </button>
            <button type="button" className="hover:text-fg" onClick={openLogin}>
              {copy.nav.login}
            </button>
            <button type="button" className="btn btn-compact" onClick={openCreate}>
              {copy.nav.create}
            </button>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-section relative flex flex-col justify-center px-5 pb-24 pt-28 md:px-8">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="hero-glow-a absolute rounded-full" />
            <div className="hero-glow-b absolute" />
          </div>
          <div className="relative mx-auto w-full max-w-6xl">
            <p className="font-mono text-xs tracking-widest uppercase text-accent">{copy.hero.eyebrow}</p>
            <h1 className="hero-title mt-6 max-w-4xl font-serif tracking-tight">{copy.hero.title}</h1>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-muted md:text-lg">{copy.hero.subtitle}</p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button type="button" className="btn" onClick={openCreate}>
                {copy.hero.cta}
              </button>
              <button type="button" className="btn btn-ghost" onClick={openLogin}>
                {copy.hero.login}
              </button>
              <a href="#demo" className="text-sm tracking-wide text-muted hover:text-fg">
                {copy.hero.secondary}
              </a>
            </div>
            <p className="mt-6 font-mono text-xs tracking-wide text-dim">{copy.hero.note}</p>
          </div>
        </section>

        <LiveDemo locale={locale} onCreate={openCreate} />
        <Discover locale={locale} />
      </main>

      <footer className="border-t border-line px-5 py-12 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-serif text-xl">{copy.footer.copy}</p>
            <p className="mt-2 text-xs text-dim">afilmory.art</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs tracking-wide text-muted">
            <a href="/terms" className="hover:text-fg">
              {copy.footer.terms}
            </a>
            <a href="/privacy" className="hover:text-fg">
              {copy.footer.privacy}
            </a>
            <a href={DOCS_URL} target="_blank" rel="noreferrer" className="hover:text-fg">
              {copy.footer.docs}
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-fg">
              {copy.footer.github}
            </a>
            <a href={SELF_HOST_URL} target="_blank" rel="noreferrer" className="hover:text-fg">
              {copy.footer.selfHost}
            </a>
          </div>
        </div>
      </footer>

      <CreateSpaceModal open={createOpen} onClose={closeCreate} locale={locale} />
      <LoginSpaceModal open={loginOpen} onClose={closeLogin} locale={locale} />
    </>
  )
}
