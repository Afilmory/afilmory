import assert from 'node:assert/strict'

import { it } from 'vitest'

import type { CanvasPhoto } from '../types'
import { availableArrangements, groupPhotos, MAX_ISLANDS } from './grouping'

const photo = (id: string, patch: Partial<CanvasPhoto> = {}): CanvasPhoto => ({
  id,
  aspectRatio: 1.5,
  thumbnailUrl: `/thumbnails/${id}.jpg`,
  thumbHash: null,
  dateTaken: '2025-05-10T08:00:00.000Z',
  camera: null,
  tags: [],
  place: null,
  ...patch,
})

const summary = (groups: ReturnType<typeof groupPhotos>) =>
  groups.map(group => [group.kind, group.label, group.photoIndexes])

it('month groups keep the order in which months first appear', () => {
  const photos = [
    photo('a', { dateTaken: '2026-07-25T10:00:00Z' }),
    photo('b', { dateTaken: '2025-05-10T10:00:00Z' }),
    photo('c', { dateTaken: '2026-07-19T10:00:00Z' }),
    photo('d', { dateTaken: '2024-01-12T10:00:00Z' }),
  ]
  assert.deepEqual(summary(groupPhotos(photos, 'month')), [
    ['value', '2026 · 07', [0, 2]],
    ['value', '2025 · 05', [1]],
    ['value', '2024 · 01', [3]],
  ])
})

it('camera groups are ordered by photo count, largest first', () => {
  const photos = [
    photo('a', { camera: 'Apple iPhone 16' }),
    photo('b', { camera: 'FUJIFILM X-T5' }),
    photo('c', { camera: 'FUJIFILM X-T5' }),
  ]
  assert.deepEqual(summary(groupPhotos(photos, 'camera')), [
    ['value', 'FUJIFILM X-T5', [1, 2]],
    ['value', 'Apple iPhone 16', [0]],
  ])
})

it('a photo with two tags appears in both tag groups', () => {
  const photos = [photo('a', { tags: ['bird', 'park'] }), photo('b', { tags: ['bird'] })]
  assert.deepEqual(summary(groupPhotos(photos, 'tag')), [
    ['value', 'bird', [0, 1]],
    ['value', 'park', [0]],
  ])
})

it('photos without data form one missing group placed last', () => {
  const photos = [photo('a'), photo('b', { place: 'Tokyo' }), photo('c')]
  assert.deepEqual(summary(groupPhotos(photos, 'location')), [
    ['value', 'Tokyo', [1]],
    ['missing', '', [0, 2]],
  ])
})

it('a photo with an unparseable date goes to the missing month group', () => {
  const photos = [photo('a', { dateTaken: '' }), photo('b')]
  assert.deepEqual(summary(groupPhotos(photos, 'month')), [
    ['value', '2025 · 05', [1]],
    ['missing', '', [0]],
  ])
})

it('more groups than the island cap keeps the largest and merges the rest into other', () => {
  const photos: CanvasPhoto[] = []
  for (let i = 0; i < 70; i++) {
    for (let n = 0; n <= 70 - i; n++) {
      photos.push(photo(`p${i}-${n}`, { camera: `Camera ${i}` }))
    }
  }
  const groups = groupPhotos(photos, 'camera')
  assert.equal(groups.length, MAX_ISLANDS)
  assert.equal(MAX_ISLANDS, 60)
  assert.deepEqual(
    groups.slice(0, 59).map(group => group.label),
    Array.from({ length: 59 }, (_, i) => `Camera ${i}`),
  )
  const other = groups[59]
  assert.equal(other.kind, 'other')
  assert.equal(
    other.photoIndexes.length,
    [...Array.from({ length: 11 }).keys()].reduce((sum, k) => sum + (70 - (59 + k) + 1), 0),
  )
})

it('other sits before missing and the total stays within the cap', () => {
  const photos: CanvasPhoto[] = [photo('none')]
  for (let i = 0; i < 70; i++) {
    photos.push(photo(`p${i}`, { camera: `Camera ${i}` }))
  }
  const groups = groupPhotos(photos, 'camera')
  assert.equal(groups.length, MAX_ISLANDS)
  assert.deepEqual(
    groups.slice(-2).map(group => group.kind),
    ['other', 'missing'],
  )
})

it('a photo in several merged tags is listed once in other', () => {
  const photos: CanvasPhoto[] = []
  for (let i = 0; i < 59; i++) {
    photos.push(photo(`a${i}`, { tags: [`big ${i}`] }), photo(`b${i}`, { tags: [`big ${i}`] }))
  }
  photos.push(photo('multi', { tags: ['small 1', 'small 2'] }))
  const other = groupPhotos(photos, 'tag').find(group => group.kind === 'other')
  assert.deepEqual(other?.photoIndexes, [118])
})

it('more than sixty months fall back to grouping by year', () => {
  const photos: CanvasPhoto[] = []
  for (let year = 2025; year >= 2019; year--) {
    for (let month = 12; month >= 1; month--) {
      photos.push(photo(`${year}-${month}`, { dateTaken: `${year}-${String(month).padStart(2, '0')}-03T00:00:00Z` }))
    }
  }
  const groups = groupPhotos(photos, 'month')
  assert.deepEqual(
    groups.map(group => group.label),
    ['2025', '2024', '2023', '2022', '2021', '2020', '2019'],
  )
  assert.equal(groups[0].photoIndexes.length, 12)
})

it('availableArrangements hides dimensions no photo has data for', () => {
  assert.deepEqual(availableArrangements([photo('a'), photo('b', { tags: ['bird'] })]), ['wall', 'month', 'tag'])
  assert.deepEqual(availableArrangements([photo('a', { camera: 'X', place: 'Tokyo', tags: ['t'] })]), [
    'wall',
    'month',
    'camera',
    'tag',
    'location',
  ])
  assert.deepEqual(availableArrangements([photo('a', { dateTaken: 'nope' })]), ['wall'])
})
