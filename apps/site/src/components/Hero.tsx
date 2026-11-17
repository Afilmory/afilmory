import type { Translations } from '../i18n'
import { Mark } from './Mark'

export function Hero({ copy }: { copy: Translations['hero'] }) {
  return (
    <section className="lp-hero">
      <div className="lp-in">
        <div className="lp-hero-top">
          <h1 className="lp-hero-title">
            <span className="lp-line">{copy.title[0]}</span>
            <span className="lp-line">{copy.title[1]}</span>
          </h1>
          <div className="lp-hero-mark" data-scroll data-scroll-range="420">
            <Mark className="lp-mark-glass" />
          </div>
        </div>
        <div className="lp-hero-row lp-enter" style={{ '--d': '360ms' } as React.CSSProperties}>
          <p>{copy.subtitle}</p>
          <a className="lp-news" href="#wander">
            <b>{copy.newsLabel}</b>
            {copy.news}
            <span className="lp-arrow">→</span>
          </a>
        </div>
        <div className="lp-stage" data-scroll data-scroll-range="520">
          <div className="lp-window">
            <picture>
              <source media="(max-width: 720px)" srcSet="/landing/viewer-m.jpg" />
              <img src="/landing/viewer.jpg" alt={copy.shotAlt} width={1600} height={1000} fetchPriority="high" />
            </picture>
          </div>
          <div className="lp-floor" />
        </div>
      </div>
      <div className="lp-hero-end" />
    </section>
  )
}
