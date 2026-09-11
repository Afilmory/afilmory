import assert from 'node:assert/strict'

import type { PickedExif } from '@afilmory/builder'
import { describe, it } from 'vitest'

import { convertExifGPSToDecimal } from './map-utils'

// GPSAltitude is exiftool's *composite* tag: exiftool has already applied
// GPSAltitudeRef to the raw value, so the sign on the number is the source of
// truth. GPSAltitudeRef itself is stored as a number `0 | 1` for entries that
// went through the v9→v10 manifest migration and as exiftool's original
// `'Above Sea Level' | 'Below Sea Level'` string for everything ingested since,
// so it must never be used to re-derive the sign.
const withGps = (gps: Record<string, unknown>): PickedExif =>
  ({
    GPSLatitude: 24.42675,
    GPSLatitudeRef: 'N',
    GPSLongitude: 115.16005,
    GPSLongitudeRef: 'E',
    ...gps,
  }) as unknown as PickedExif

describe('convertExifGPSToDecimal altitude sign', () => {
  it('keeps an above-sea-level photo positive when the reference is a string', () => {
    const result = convertExifGPSToDecimal(withGps({ GPSAltitude: 47.1, GPSAltitudeRef: 'Above Sea Level' }))

    assert.equal(result?.altitude, 47.1)
    assert.equal(result?.altitudeRef, 'Above Sea Level')
  })

  it('keeps an above-sea-level photo positive when the reference is the migrated number', () => {
    const result = convertExifGPSToDecimal(withGps({ GPSAltitude: 47.1, GPSAltitudeRef: 0 }))

    assert.equal(result?.altitude, 47.1)
  })

  it('does not re-negate a below-sea-level photo whose value is already signed', () => {
    const result = convertExifGPSToDecimal(withGps({ GPSAltitude: -0.8933000096, GPSAltitudeRef: 'Below Sea Level' }))

    assert.equal(result?.altitude, -0.8933000096)
    assert.equal(result?.altitudeRef, 'Below Sea Level')
  })

  it('does not re-negate a below-sea-level photo with a migrated numeric reference', () => {
    const result = convertExifGPSToDecimal(withGps({ GPSAltitude: -5.385563266, GPSAltitudeRef: 1 }))

    assert.equal(result?.altitude, -5.385563266)
  })

  it('treats a missing reference as above sea level without flipping the sign', () => {
    // Several cameras (e.g. Panasonic) never write GPSAltitudeRef, so exiftool
    // reports the unsigned magnitude and the direction is unrecoverable.
    const result = convertExifGPSToDecimal(withGps({ GPSAltitude: 47.1 }))

    assert.equal(result?.altitude, 47.1)
    assert.equal(result?.altitudeRef, 'Above Sea Level')
  })

  it('keeps a zero altitude instead of dropping it', () => {
    const result = convertExifGPSToDecimal(withGps({ GPSAltitude: 0, GPSAltitudeRef: 0 }))

    assert.equal(result?.altitude, 0)
  })
})
