import type { ReactNode } from 'react'

import type { Translations } from '../i18n'

function FeatureHead({ title, body }: { title: [string, string], body: string }) {
  return (
    <div className="lp-feat-head">
      <h2>
        {title[0]}
        <br />
        {title[1]}
      </h2>
      <p>{body}</p>
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

export function WallFeature({ copy }: { copy: Translations['wall'] }) {
  return (
    <Feature id="wall">
      <FeatureHead title={copy.title} body={copy.body} />
      <div className="lp-shot lp-shot-fade">
        <picture>
          <source media="(max-width: 720px)" srcSet="/landing/gallery-m.jpg" />
          <img src="/landing/gallery.jpg" alt={copy.shotAlt} width={1600} height={1000} loading="lazy" />
        </picture>
      </div>
      <div className="lp-details">
        {copy.details.map(item => (
          <div key={item.title}>
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
      <div className="lp-shot">
        <img src="/landing/canvas.jpg" alt={copy.shotAlt} width={1600} height={1000} loading="lazy" />
      </div>
    </Feature>
  )
}
