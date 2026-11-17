import { useEffect, useState } from 'react'

import type { Translations } from '../i18n'
import { APP_STORE_URL, DOCKER_COMMAND, GITHUB_URL, SELF_HOST_URL } from '../lib/links'
import { FeatureHead } from './Features'
import { IconApple, IconCopy } from './icons'

const PROVIDERS = ['S3', 'Backblaze B2', 'GitHub', 'Eagle', 'Local']

function CopyCommand({ copy }: { copy: Translations['ways']['selfHost'] }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = setTimeout(setCopied, 1600, false)
    return () => clearTimeout(timer)
  }, [copied])

  const onCopy = () => {
    navigator.clipboard.writeText(DOCKER_COMMAND).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <div className="lp-term">
      <code>{DOCKER_COMMAND}</code>
      <button type="button" onClick={onCopy} aria-label={copy.copyLabel}>
        <IconCopy className="lp-icon-sm" />
        <span>{copied ? copy.copied : copy.copy}</span>
      </button>
    </div>
  )
}

export function Ways({ copy }: { copy: Translations['ways'] }) {
  return (
    <section className="lp-feat">
      <div className="lp-in">
        <FeatureHead title={copy.title} body={copy.body} />
        <div className="lp-ways" data-reveal>
          <div className="lp-way lp-way-phone lp-rise">
            <h3>{copy.iphone.title}</h3>
            <p>{copy.iphone.body}</p>
            <div className="lp-way-act">
              <a className="lp-cap lp-cap-glass" href={APP_STORE_URL} target="_blank" rel="noreferrer">
                <IconApple className="lp-icon" />
                App Store
              </a>
            </div>
            <div className="lp-phone" data-scroll data-scroll-start="1" data-scroll-end="0.4">
              <div className="lp-phone-screen">
                <img
                  src="/landing/ios-exhibition.webp"
                  alt={copy.iphone.shotAlt}
                  width={600}
                  height={1304}
                  loading="lazy"
                />
              </div>
            </div>
          </div>
          <div className="lp-way lp-rise" style={{ '--d': '100ms' } as React.CSSProperties}>
            <h3>{copy.selfHost.title}</h3>
            <p>{copy.selfHost.body}</p>
            <CopyCommand copy={copy.selfHost} />
            <div className="lp-providers">
              {PROVIDERS.map(name => (
                <span key={name}>{name}</span>
              ))}
            </div>
            <div className="lp-way-act">
              <a className="lp-more" href={SELF_HOST_URL} target="_blank" rel="noreferrer">
                {`${copy.selfHost.guide} →`}
              </a>
              <a className="lp-more" href={GITHUB_URL} target="_blank" rel="noreferrer">
                GitHub →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
