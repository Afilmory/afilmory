import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'

import type { Translations } from '../i18n'
import type { FeaturedGallery } from '../lib/api'
import { fetchFeaturedGalleries, galleryPublicUrl } from '../lib/api'
import { trackPointer } from '../lib/motion'
import { FeatureHead } from './Features'

const VISIBLE = 6

function hostOf(gallery: FeaturedGallery) {
  return galleryPublicUrl(gallery).replace(/^https:\/\//, '')
}

function GalleryCard({
  gallery,
  photosLabel,
  index,
}: {
  gallery: FeaturedGallery
  photosLabel: string
  index: number
}) {
  const initial = (gallery.author?.name ?? gallery.name).slice(0, 1)
  return (
    <a
      className="lp-gallery lp-rise"
      style={{ '--d': `${index * 70}ms` } as CSSProperties}
      href={galleryPublicUrl(gallery)}
      target="_blank"
      rel="noreferrer"
      onPointerMove={trackPointer}
    >
      <div className="lp-gallery-who">
        <span className="lp-avatar">
          {gallery.author?.avatar ? <img src={gallery.author.avatar} alt="" loading="lazy" /> : initial}
        </span>
        <div className="lp-gallery-name">
          <h3>{gallery.name}</h3>
          <span>{hostOf(gallery)}</span>
        </div>
      </div>
      <p className="lp-gallery-desc">{gallery.description}</p>
      <div className="lp-gallery-foot">
        <span>
          <b>{gallery.photoCount}</b>
          {` ${photosLabel}`}
        </span>
        <span className="lp-gallery-tags">{gallery.tags.slice(0, 3).join(' · ')}</span>
      </div>
    </a>
  )
}

export function Discover({ copy }: { copy: Translations['discover'] }) {
  const [galleries, setGalleries] = useState<FeaturedGallery[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    fetchFeaturedGalleries()
      .then((list) => {
        if (!cancelled) {
          setGalleries(list.slice(0, VISIBLE))
          setState('ready')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const status
    = state === 'loading' ? copy.loading : state === 'error' ? copy.error : galleries.length === 0 ? copy.empty : null

  return (
    <section className="lp-feat" id="visit">
      <div className="lp-in">
        <FeatureHead title={[copy.title]} />
        {status ? (
          <p className="lp-status">{status}</p>
        ) : (
          <div className="lp-rail" data-reveal>
            {galleries.map((gallery, index) => (
              <GalleryCard key={gallery.id} gallery={gallery} photosLabel={copy.photos} index={index} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
