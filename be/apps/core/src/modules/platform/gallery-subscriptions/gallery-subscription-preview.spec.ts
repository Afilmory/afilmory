import { describe, expect, it } from 'vitest'

import { toGalleryPhotoPreview } from './gallery-subscription-preview'

const base = {
  id: 'p1',
  title: '',
  dateTaken: '',
  tags: [],
  keywords: [],
  regions: [],
  description: '',
  originalUrl: 'https://img.test/o.jpg',
  format: 'jpg',
  thumbnailUrl: 'https://img.test/t.jpg',
  thumbHash: 'abcd',
  width: 200,
  height: 100,
  aspectRatio: 2,
  s3Key: 'k',
  lastModified: '',
  size: 1,
  exif: null,
  toneAnalysis: null,
  location: null,
}

describe('toGalleryPhotoPreview', () => {
  it('returns null when the thumbnail is missing', () => {
    expect(
      toGalleryPhotoPreview({
        photoId: 'p1',
        syncedAt: '2026-08-19T00:00:00.000Z',
        manifest: { ...base, thumbnailUrl: '   ' },
      }),
    ).toBeNull()
    expect(
      toGalleryPhotoPreview({
        photoId: 'p1',
        syncedAt: '2026-08-19T00:00:00.000Z',
        manifest: null,
      }),
    ).toBeNull()
  })

  it('maps live photos from manifest.video.type', () => {
    const preview = toGalleryPhotoPreview({
      photoId: 'live-1',
      syncedAt: '2026-08-19T00:00:00.000Z',
      manifest: {
        ...base,
        video: { type: 'live-photo', videoUrl: 'https://img.test/v.mov', s3Key: 'v' },
      },
    })
    expect(preview).toMatchObject({
      id: 'live-1',
      thumbnailUrl: 'https://img.test/t.jpg',
      thumbHash: 'abcd',
      width: 200,
      height: 100,
      aspectRatio: 2,
      isLivePhoto: true,
      syncedAt: '2026-08-19T00:00:00.000Z',
    })
  })

  it('treats motion photos as stills', () => {
    const preview = toGalleryPhotoPreview({
      photoId: 'p1',
      syncedAt: '2026-08-19T00:00:00.000Z',
      manifest: { ...base, video: { type: 'motion-photo', offset: 12 } },
    })
    expect(preview?.isLivePhoto).toBe(false)
  })
})
