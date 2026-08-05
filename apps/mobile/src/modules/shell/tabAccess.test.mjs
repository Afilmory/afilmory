import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

import { getAvailableTabNames, getDefaultTabPath, shouldShowTabBar } from './tabAccess.ts'

test('exposes only Explore and enters it by default while signed out', () => {
  assert.deepEqual(getAvailableTabNames('signedOut'), ['explore'])
  assert.equal(getDefaultTabPath('signedOut'), '/explore')
  assert.equal(shouldShowTabBar('signedOut'), false)
})

test('restores the complete tab set after authentication', () => {
  assert.deepEqual(getAvailableTabNames('signedIn'), ['photos', 'map', 'explore', 'studio'])
  assert.equal(getDefaultTabPath('signedIn'), '/photos')
  assert.equal(shouldShowTabBar('signedIn'), true)
})

test('does not expose navigation while authentication is loading', () => {
  assert.deepEqual(getAvailableTabNames('loading'), [])
  assert.equal(getDefaultTabPath('loading'), null)
  assert.equal(shouldShowTabBar('loading'), false)
})

test('falls back to the visitor surface when the session cannot be resolved', () => {
  assert.deepEqual(getAvailableTabNames('failed'), ['explore'])
  assert.equal(getDefaultTabPath('failed'), '/explore')
  assert.equal(shouldShowTabBar('failed'), false)
})
