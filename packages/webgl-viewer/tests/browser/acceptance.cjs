const assert = require('node:assert/strict')

// Browser base-RGB conversion limitations, not passing accuracy cases.
// Bounds are the observed maximum linear-P3 errors rounded up to 0.001.
// Keep the normal per-pixel tolerance unchanged and reject new/worse cases.
const baseLimits = new Map([
  ['corpus-color-10-420-limited:hdr', 0.323],
  ['corpus-color-12-420-limited:sdr', 0.056],
  ['corpus-color-12-420-limited:hdr', 1.737],
  ['corpus-color-12-420-full:sdr', 0.060],
  ['corpus-color-12-420-full:hdr', 1.863],
  ['corpus-color-12-444-limited:hdr', 0.305],
  ['corpus-color-12-444-full:hdr', 0.299],
  ['corpus-ramp-12-444-limited:hdr', 0.146],
])

function passes(comparison, label) {
  assert.ok(comparison && Number.isFinite(comparison.maxError), `${label}: missing/nonfinite comparison`)
  assert.equal(comparison.mismatchedPixels, 0, label)
}

module.exports = function acceptance(reports, { strictNative = false } = {}) {
  assert.ok(reports.length > 0, 'No rendering results')
  const limitations = []
  let referenceDifferences = 0
  for (const report of reports) {
    const label = `${report.primary}:${report.hdr ? 'hdr' : 'sdr'}`
    if (report.stages) {
      const stages = report.stages
      passes(stages.uploadedFormula, `${label}: GPU formula`)
      passes(stages.nativeModelVsLibrary, `${label}: independent reference model`)
      passes(stages.gainOnlyEffect, `${label}: gain precision`)
      if (stages.bitmapVsUploaded) {
        passes(stages.bitmapVsUploaded, `${label}: base upload`)
      }
      const matched = stages.independentMatched
      assert.ok(Number.isFinite(matched.maxError), `${label}: nonfinite matched reference`)
      if (matched.mismatchedPixels > 0) {
        const bound = baseLimits.get(label)
        assert.ok(bound !== undefined, `${label}: new base conversion difference`)
        assert.ok(matched.maxError <= bound, `${label}: base conversion regression (${matched.maxError} > ${bound})`)
        assert.ok(stages.baseOnlyEffect.mismatchedPixels > 0, `${label}: difference no longer isolated to base`)
        limitations.push({ case: label, maxError: matched.maxError, bound, reason: 'browser-base-rgb-conversion' })
      }
    }
    else if (report.primary.startsWith('corpus-')) {
      assert.fail(`${label}: missing independent stage controls`)
    }
    if (report.baseline) {
      passes(report.baseline.gpuFormulaControl, `${label}: paired GPU formula`)
      passes(report.baseline.pixelCenterReference, `${label}: paired decoded planes`)
    }
    if (report.srgbBaseReference) {
      passes(report.srgbBaseReference, `${label}: sRGB/ICC decoded planes`)
    }
    if (report.mismatchedPixels > 0) {
      referenceDifferences++
      // Original fixtures/fallbacks still require native agreement when there
      // is no independent reconstruction to explain a policy difference.
      assert.ok(!strictNative && (report.stages || report.baseline || report.srgbBaseReference), `${label}: native reference differs`)
    }
  }
  return { status: limitations.length ? 'passed-with-known-limitations' : 'passed', referenceDifferences, limitations }
}
