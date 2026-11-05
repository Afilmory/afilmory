import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { it } from 'vitest'

import { extractJPEGGainMap } from './jpeg-gainmap'

it('preserves pre-refactor JPEG matrix ICC metadata and D50 transforms exactly', async () => {
  const bytes = readFileSync(new URL('./fixtures/gainmap-icc.jpg', import.meta.url))
  const result = extractJPEGGainMap(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length))
  assert.ok(result)
  const { base, gain, ...actual } = result
  const expected = JSON.parse(readFileSync(new URL('./fixtures/jpeg-icc-reference.json', import.meta.url), 'utf8'))
  assert.deepEqual(actual, expected)
  assert.ok(new TextDecoder().decode(await base.arrayBuffer()).includes('ICC_PROFILE'))
  assert.ok(!new TextDecoder().decode(await gain.arrayBuffer()).includes('ICC_PROFILE'))
})
