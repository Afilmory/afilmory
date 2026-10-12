/// <reference types="node" />
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { SatoriOptions } from 'satori'
import { describe, expect, it } from 'vitest'

import { renderOgImage } from './og.renderer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../../..')
const assetDir = path.join(repoRoot, 'be/apps/core/src/modules/content/og/assets')

const JPEG_MAGIC = Buffer.from([0xFF, 0xD8, 0xFF])
const PNG_MAGIC = Buffer.from('89504E470D0A1A0A', 'hex')

async function loadFonts(): Promise<SatoriOptions['fonts']> {
  const [geist, harmony] = await Promise.all([
    readFile(path.join(assetDir, 'Geist-Medium.ttf')),
    readFile(path.join(assetDir, 'HarmonyOS_Sans_SC_Medium.ttf')),
  ])

  return [
    { name: 'Geist', data: geist, style: 'normal', weight: 400 },
    { name: 'HarmonyOS Sans SC', data: harmony, style: 'normal', weight: 400 },
  ]
}

/**
 * Walk the JPEG marker segments to find SOF0 and read its dimensions.
 * A fixed offset does not work: variable-length segments (quantisation and
 * Huffman tables) precede SOF0, so its position shifts with the encoder.
 */
function readJpegDimensions(image: Buffer): { width: number, height: number } {
  let offset = 2

  while (offset < image.length) {
    if (image[offset] !== 0xFF) {
      throw new Error(`Malformed JPEG: expected marker at offset ${offset}`)
    }

    const marker = image[offset + 1]
    const segmentLength = image.readUInt16BE(offset + 2)

    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 (0xC4/0xC8/0xCC are not SOF).
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return {
        height: image.readUInt16BE(offset + 5),
        width: image.readUInt16BE(offset + 7),
      }
    }

    offset += 2 + segmentLength
  }

  throw new Error('Malformed JPEG: no SOF segment found')
}

async function renderTitleCard(): Promise<Buffer> {
  const rendered = await renderOgImage({
    template: {
      photoTitle: '20261002 MGT06931',
      siteName: 'Photo Gallery',
      tags: ['landscape'],
      formattedDate: 'Oct 2, 2026',
      exifInfo: { focalLength: '35mm', aperture: 'f/2.8', iso: 100, shutterSpeed: '1/250s', camera: 'FUJIFILM X-T5' },
      thumbnailSrc: null,
      photoDimensions: { width: 8485, height: 5657 },
      accentColor: '#007bff',
    },
    fonts: await loadFonts(),
  })

  return Buffer.from(rendered)
}

describe('renderOgImage', () => {
  it('encodes the card as JPEG rather than PNG', async () => {
    const image = await renderTitleCard()

    expect(image.subarray(0, 3).equals(JPEG_MAGIC)).toBe(true)
    expect(image.subarray(0, 8).equals(PNG_MAGIC)).toBe(false)
  })

  it('keeps the 1200x628 OG dimensions', async () => {
    const image = await renderTitleCard()

    expect(readJpegDimensions(image)).toEqual({ width: 1200, height: 628 })
  })

  it('stays well under the PNG size it replaces', async () => {
    const image = await renderTitleCard()

    // A PNG of the same card is ~550KB; JPEG must be an order of magnitude smaller.
    expect(image.byteLength).toBeLessThan(200 * 1024)
  })
})
