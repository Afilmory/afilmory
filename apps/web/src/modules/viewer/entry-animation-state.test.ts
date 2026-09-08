import assert from 'node:assert/strict'

import { it } from 'vitest'

import {
  getProgressiveImageVisualReady,
  isThumbnailElementVisuallyReady,
  resolvePhotoViewerEntryState,
  shouldHideCurrentViewerImage,
} from './entry-animation-state'

it('resolvePhotoViewerEntryState mounts the heavy image stage immediately when there is no trigger element', () => {
  const state = resolvePhotoViewerEntryState({
    hasTransitionTrigger: false,
    isCurrentImageVisualReady: false,
    isEntryTransitionActive: false,
    isOpen: true,
    isViewerContentVisible: false,
  })

  assert.deepEqual(state, {
    shouldMountImageStage: true,
    shouldShowEntryImageCatchup: false,
  })
})

it('resolvePhotoViewerEntryState keeps the lightweight catch-up layer hidden before the viewer stage is ready to hand off', () => {
  const state = resolvePhotoViewerEntryState({
    hasTransitionTrigger: true,
    isCurrentImageVisualReady: false,
    isEntryTransitionActive: true,
    isOpen: true,
    isViewerContentVisible: false,
  })

  assert.deepEqual(state, {
    shouldMountImageStage: false,
    shouldShowEntryImageCatchup: false,
  })
})

it('resolvePhotoViewerEntryState shows the lightweight catch-up layer only during the late entry handoff while the viewer stage is visible', () => {
  const state = resolvePhotoViewerEntryState({
    hasTransitionTrigger: true,
    isCurrentImageVisualReady: false,
    isEntryTransitionActive: true,
    isOpen: true,
    isViewerContentVisible: true,
  })

  assert.deepEqual(state, {
    shouldMountImageStage: true,
    shouldShowEntryImageCatchup: true,
  })
})

it('resolvePhotoViewerEntryState drops the catch-up layer once the stage is visible and the current image is ready', () => {
  const state = resolvePhotoViewerEntryState({
    hasTransitionTrigger: true,
    isCurrentImageVisualReady: true,
    isEntryTransitionActive: false,
    isOpen: true,
    isViewerContentVisible: true,
  })

  assert.deepEqual(state, {
    shouldMountImageStage: true,
    shouldShowEntryImageCatchup: false,
  })
})

it('getProgressiveImageVisualReady treats a loaded thumbnail as enough to complete the entry handoff before the high-res layer renders', () => {
  assert.equal(
    getProgressiveImageVisualReady({
      isHighResImageRendered: false,
      isThumbnailLoaded: true,
      thumbnailSrc: '/thumb.jpg',
    }),
    true,
  )
})

it('getProgressiveImageVisualReady falls back to the high-res render state when there is no thumbnail', () => {
  assert.equal(
    getProgressiveImageVisualReady({
      isHighResImageRendered: true,
      isThumbnailLoaded: false,
      thumbnailSrc: undefined,
    }),
    true,
  )
  assert.equal(
    getProgressiveImageVisualReady({
      isHighResImageRendered: false,
      isThumbnailLoaded: false,
      thumbnailSrc: undefined,
    }),
    false,
  )
})

it('isThumbnailElementVisuallyReady treats a thumbnail with resolved dimensions as ready even before the browser flips complete', () => {
  assert.equal(
    isThumbnailElementVisuallyReady({
      currentSrc: 'https://zeta.ichr.me/gallery/thumbnails/20260404-SGL_3042.jpg',
      naturalWidth: 600,
      src: 'https://zeta.ichr.me/gallery/thumbnails/20260404-SGL_3042.jpg',
      thumbnailSrc: 'https://zeta.ichr.me/gallery/thumbnails/20260404-SGL_3042.jpg',
    }),
    true,
  )

  assert.equal(
    isThumbnailElementVisuallyReady({
      currentSrc: 'https://zeta.ichr.me/gallery/thumbnails/20260404-SGL_3042.jpg',
      naturalWidth: 0,
      src: 'https://zeta.ichr.me/gallery/thumbnails/20260404-SGL_3042.jpg',
      thumbnailSrc: 'https://zeta.ichr.me/gallery/thumbnails/20260404-SGL_3042.jpg',
    }),
    false,
  )
})

it('shouldHideCurrentViewerImage keeps the real current slide hidden only while the catch-up layer owns the handoff', () => {
  assert.equal(
    shouldHideCurrentViewerImage({
      isCurrentImage: true,
      isEntryImageCatchupVisible: true,
    }),
    true,
  )

  assert.equal(
    shouldHideCurrentViewerImage({
      isCurrentImage: true,
      isEntryImageCatchupVisible: false,
    }),
    false,
  )

  assert.equal(
    shouldHideCurrentViewerImage({
      isCurrentImage: false,
      isEntryImageCatchupVisible: true,
    }),
    false,
  )
})
