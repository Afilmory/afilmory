import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { buildGalleryPushAPNsPayload, selectGalleryPushPreview } from './gallery-push.payload'

const notification = {
  body: 'Just published a new photo.',
  eventId: 'event-1',
  galleryName: 'Street',
  gallerySlug: 'street',
  photoCount: 1,
  title: 'Street',
}

describe('selectGalleryPushPreview', () => {
  it('picks the last item that has a public https thumbnail', () => {
    expect(
      selectGalleryPushPreview([
        { photoId: 'a', thumbnailUrl: 'https://cdn.example/a.jpg' },
        { photoId: 'b', thumbnailUrl: '/thumbnails/b.jpg' },
        { photoId: 'c', thumbnailUrl: 'https://cdn.example/c.jpg' },
      ]),
    ).toEqual({
      imageUrl: 'https://cdn.example/c.jpg',
      photoId: 'c',
    })
  })

  it('walks backward past http, relative, and empty thumbnails', () => {
    expect(
      selectGalleryPushPreview([
        { photoId: 'a', thumbnailUrl: 'https://cdn.example/a.jpg' },
        { photoId: 'b', thumbnailUrl: 'http://cdn.example/b.jpg' },
        { photoId: null, thumbnailUrl: 'https://cdn.example/c.jpg' },
        { photoId: 'd', thumbnailUrl: '  ' },
      ]),
    ).toEqual({
      imageUrl: 'https://cdn.example/a.jpg',
      photoId: 'a',
    })
  })

  it('keeps signed query strings on the thumbnail url', () => {
    expect(
      selectGalleryPushPreview([
        {
          photoId: 'a',
          thumbnailUrl: 'https://cdn.example/t.jpg?X-Amz-Signature=abc%2Fdef&foo=1',
        },
      ]),
    ).toEqual({
      imageUrl: 'https://cdn.example/t.jpg?X-Amz-Signature=abc%2Fdef&foo=1',
      photoId: 'a',
    })
  })

  it('returns null when no published photo has a public https thumbnail', () => {
    expect(
      selectGalleryPushPreview([
        { photoId: 'a', thumbnailUrl: 'http://cdn.example/a.jpg' },
        { photoId: 'b', thumbnailUrl: '/thumbnails/b.jpg' },
      ]),
    ).toBeNull()
  })
})

describe('buildGalleryPushAPNsPayload', () => {
  it('keeps the existing text payload when there is no image', () => {
    expect(buildGalleryPushAPNsPayload(notification)).toEqual({
      aps: {
        'alert': {
          body: 'Just published a new photo.',
          title: 'Street',
        },
        'sound': 'default',
        'thread-id': 'gallery:street',
      },
      eventId: 'event-1',
      galleryName: 'Street',
      gallerySlug: 'street',
      photoCount: 1,
      route: 'gallery',
    })
  })

  it('adds mutable-content, the owner avatar, and the https thumbnail', () => {
    expect(
      buildGalleryPushAPNsPayload({
        ...notification,
        avatarUrl: 'https://cdn.example/me.jpg',
        imageUrl: 'https://cdn.example/t.jpg',
        photoId: 'DSC_1',
      }),
    ).toEqual({
      aps: {
        'alert': {
          body: 'Just published a new photo.',
          title: 'Street',
        },
        'mutable-content': 1,
        'sound': 'default',
        'thread-id': 'gallery:street',
      },
      avatarUrl: 'https://cdn.example/me.jpg',
      eventId: 'event-1',
      galleryName: 'Street',
      gallerySlug: 'street',
      imageUrl: 'https://cdn.example/t.jpg',
      photoCount: 1,
      photoId: 'DSC_1',
      route: 'gallery',
    })
  })

  it('adds mutable-content when only the owner avatar is present', () => {
    expect(
      buildGalleryPushAPNsPayload({
        ...notification,
        avatarUrl: 'https://cdn.example/me.jpg',
      }),
    ).toMatchObject({
      aps: { 'mutable-content': 1 },
      avatarUrl: 'https://cdn.example/me.jpg',
    })
  })

  it('drops the image when the payload would exceed the APNs size limit', () => {
    const payload = buildGalleryPushAPNsPayload({
      ...notification,
      imageUrl: `https://cdn.example/${'a'.repeat(5000)}.jpg`,
      photoId: 'DSC_1',
    })

    expect(payload).toMatchObject({
      photoId: 'DSC_1',
      route: 'gallery',
    })
    expect(payload).not.toHaveProperty('imageUrl')
    expect(payload.aps).not.toHaveProperty('mutable-content')
    expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBeLessThanOrEqual(4096)
  })

  it('keeps the owner avatar when the thumbnail would exceed the APNs size limit', () => {
    const payload = buildGalleryPushAPNsPayload({
      ...notification,
      avatarUrl: 'https://cdn.example/me.jpg',
      imageUrl: `https://cdn.example/${'a'.repeat(5000)}.jpg`,
      photoId: 'DSC_1',
    })

    expect(payload).toMatchObject({
      avatarUrl: 'https://cdn.example/me.jpg',
      photoId: 'DSC_1',
    })
    expect(payload).not.toHaveProperty('imageUrl')
    expect(payload.aps).toMatchObject({ 'mutable-content': 1 })
  })

  it('ignores a non-https image url', () => {
    const payload = buildGalleryPushAPNsPayload({
      ...notification,
      imageUrl: 'http://cdn.example/t.jpg',
      photoId: 'DSC_1',
    })

    expect(payload).not.toHaveProperty('imageUrl')
    expect(payload.aps).not.toHaveProperty('mutable-content')
    expect(payload).toMatchObject({ photoId: 'DSC_1' })
  })

  it('ignores a non-https owner avatar url', () => {
    const payload = buildGalleryPushAPNsPayload({
      ...notification,
      avatarUrl: 'http://cdn.example/me.jpg',
      photoId: 'DSC_1',
    })

    expect(payload).not.toHaveProperty('avatarUrl')
    expect(payload.aps).not.toHaveProperty('mutable-content')
    expect(payload).toMatchObject({ photoId: 'DSC_1' })
  })
})
