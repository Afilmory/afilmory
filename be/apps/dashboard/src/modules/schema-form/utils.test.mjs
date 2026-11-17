import assert from 'node:assert/strict'

import test from 'vitest'

import {
  normalizeColorPickerValue,
  parseMultiSelectValue,
  updateMultiSelectValue,
} from './utils.ts'

test('normalizes valid colors for the browser color control', () => {
  assert.equal(normalizeColorPickerValue('#12abEF'), '#12ABEF')
  assert.equal(normalizeColorPickerValue('#12abEF80'), '#12ABEF')
  assert.equal(normalizeColorPickerValue('invalid'), '#86C9AE')
})

test('parses only unique string options from multi-select storage', () => {
  assert.deepEqual(parseMultiSelectValue('["maplibre","maplibre",7]'), ['maplibre'])
  assert.deepEqual(parseMultiSelectValue('{"provider":"maplibre"}'), [])
  assert.deepEqual(parseMultiSelectValue('invalid'), [])
})

test('updates multi-select storage without discarding existing options', () => {
  assert.equal(updateMultiSelectValue('["maplibre"]', 'custom', true), '["maplibre","custom"]')
  assert.equal(updateMultiSelectValue('["maplibre","custom"]', 'maplibre', false), '["custom"]')
})
