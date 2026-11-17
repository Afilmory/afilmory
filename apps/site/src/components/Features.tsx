import type { CSSProperties, ReactNode } from 'react'

import type { Translations } from '../i18n'

function FeatureHead({ title, body }: { title: [string, string] | [string], body?: string }) {
  return (
    <div className="lp-feat-head" data-reveal>
      <h2>
        {title.map(line => (
          <span key={line} className="lp-line">
            {line}
          </span>
        ))}
      </h2>
      {body ? <p className="lp-rise">{body}</p> : null}
    </div>
  )
}

function Feature({ id, children }: { id: string, children: ReactNode }) {
  return (
    <section className="lp-feat" id={id}>
      <div className="lp-in">{children}</div>
    </section>
  )
}

export { FeatureHead }

export function WallFeature({ copy }: { copy: Translations['wall'] }) {
  return (
    <Feature id="wall">
      <FeatureHead title={copy.title} body={copy.body} />
      <div className="lp-shot lp-shot-fade lp-develop" data-reveal>
        <picture>
          <source media="(max-width: 720px)" srcSet="/landing/gallery-m@2x.jpg" />
          <img src="/landing/gallery@2x.jpg" alt={copy.shotAlt} width={1600} height={1000} loading="lazy" />
        </picture>
      </div>
      <div className="lp-details" data-reveal>
        {copy.details.map((item, index) => (
          <div key={item.title} className="lp-rise" style={{ '--d': `${index * 80}ms` } as CSSProperties}>
            <b>{item.title}</b>
            <span>{item.body}</span>
          </div>
        ))}
      </div>
    </Feature>
  )
}

export function CanvasFeature({ copy }: { copy: Translations['canvas'] }) {
  return (
    <Feature id="wander">
      <FeatureHead title={copy.title} body={copy.body} />
      <div className="lp-shot lp-develop lp-pan" data-reveal data-scroll data-scroll-start="1" data-scroll-end="0">
        <img src="/landing/canvas@2x.jpg" alt={copy.shotAlt} width={1600} height={1000} loading="lazy" />
      </div>
    </Feature>
  )
}
