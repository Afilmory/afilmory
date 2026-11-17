import type { Translations } from '../i18n'

export function Hero({ copy }: { copy: Translations['hero'] }) {
  return (
    <section className="lp-hero">
      <div className="lp-in">
        <h1 className="lp-hero-title">
          {copy.title[0]}
          <br />
          {copy.title[1]}
        </h1>
        <div className="lp-hero-row">
          <p>{copy.subtitle}</p>
          <a className="lp-news" href="#wander">
            <b>{copy.newsLabel}</b>
            {copy.news}
            {' →'}
          </a>
        </div>
        <div className="lp-window">
          <picture>
            <source media="(max-width: 720px)" srcSet="/landing/viewer-m.jpg" />
            <img src="/landing/viewer.jpg" alt={copy.shotAlt} width={1600} height={1000} fetchPriority="high" />
          </picture>
        </div>
      </div>
      <div className="lp-floor" />
      <div className="lp-hero-end" />
    </section>
  )
}
