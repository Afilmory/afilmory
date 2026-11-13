import assert from 'node:assert/strict'

import { it } from 'vitest'

import type { PhotoManifest } from '~/types/photo'

import { liveVideoSource } from './live-video-source'

const photo = (video: PhotoManifest['video']) => ({ originalUrl: '/photos/a.jpg', video }) as PhotoManifest

it('a photo without video has nothing to play', () => {
  assert.equal(liveVideoSource(photo(undefined)), null)
})

it('a live photo plays its companion video file', () => {
  assert.deepEqual(liveVideoSource(photo({ type: 'live-photo', videoUrl: '/photos/a.mov', s3Key: 'a.mov' })), {
    type: 'live-photo',
    videoUrl: '/photos/a.mov',
  })
})

it('a motion photo plays the video embedded in the original image', () => {
  assert.deepEqual(liveVideoSource(photo({ type: 'motion-photo', offset: 10, size: 20, presentationTimestamp: 3 })), {
    type: 'motion-photo',
    imageUrl: '/photos/a.jpg',
    offset: 10,
    size: 20,
    presentationTimestamp: 3,
  })
})
