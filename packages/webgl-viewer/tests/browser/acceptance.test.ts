import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { it } from 'vitest'

const require = createRequire(import.meta.url)
const acceptance = require('./acceptance.cjs')

const good = () => ({ maxError: 0, mismatchedPixels: 0 })
function report(primary = 'corpus-color-12-420-full') {
  return {
    primary,
    hdr: false,
    mismatchedPixels: 2,
    stages: {
      uploadedFormula: good(),
      nativeModelVsLibrary: good(),
      gainOnlyEffect: good(),
      independentMatched: good(),
      baseOnlyEffect: good(),
    },
  }
}

it('accepts explained native policy differences but preserves strict comparison', () => {
  assert.equal(acceptance([report()]).referenceDifferences, 1)
  assert.throws(() => acceptance([report()], { strictNative: true }), /native reference/)
})

it('reports bounded base limitations without calling their accuracy passed', () => {
  const input = report()
  input.stages.independentMatched = { maxError: 0.0596, mismatchedPixels: 48 }
  input.stages.baseOnlyEffect = input.stages.independentMatched
  const result = acceptance([input])
  assert.equal(result.status, 'passed-with-known-limitations')
  assert.equal(result.limitations.length, 1)
  input.stages.independentMatched.maxError = 0.061
  assert.throws(() => acceptance([input]), /regression/)
  input.primary = 'corpus-new-recipe'
  assert.throws(() => acceptance([input]), /new base/)
})

it('never exempts shader or gain errors as known base limitations', () => {
  for (const key of ['uploadedFormula', 'nativeModelVsLibrary', 'gainOnlyEffect'] as const) {
    const input = report()
    input.stages[key] = { maxError: 0.5, mismatchedPixels: 1 }
    assert.throws(() => acceptance([input]))
  }
})

it('rejects missing controls, nonfinite data and unexplained native failures', () => {
  assert.throws(() => acceptance([]), /No rendering/)
  assert.throws(() => acceptance([{ primary: 'corpus-missing' }]), /missing independent/)
  assert.throws(() => acceptance([{ primary: 'transform-r1', mismatchedPixels: 1 }]), /native reference/)
  const input = report()
  input.stages.independentMatched.maxError = Number.NaN
  assert.throws(() => acceptance([input]), /nonfinite/)
})
