/** @jsxImportSource hono/jsx */
/** @jsxRuntime automatic */
import { Buffer } from 'node:buffer'

import { Resvg } from '@resvg/resvg-js'
import type { SatoriOptions } from 'satori'
import satori from 'satori'
import sharp from 'sharp'

import type { HomepageOgTemplateProps, OgTemplateProps } from './og.template'
import { HomepageOgTemplate, OgTemplate } from './og.template'
import { get_icon_code, load_emoji } from './tweemoji'

export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 628
export const OG_IMAGE_MIME_TYPE = 'image/jpeg'
export const OG_IMAGE_FILE_EXTENSION = 'jpg'

const OG_IMAGE_JPEG_QUALITY = 88

/**
 * Encode the rendered SVG as a JPEG.
 *
 * The card is photo-heavy, so JPEG is ~8x smaller than the PNG that resvg emits
 * (550KB -> ~60KB for a 1200x628 card). `pixels` gives us raw RGBA, which avoids
 * a pointless PNG encode/decode round trip. The template's background is an
 * opaque gradient, so dropping the (fully opaque) alpha channel is lossless here.
 */
async function encodeJpeg(renderer: Resvg): Promise<Uint8Array> {
  const image = renderer.render()

  return sharp(image.pixels, {
    raw: {
      width: image.width,
      height: image.height,
      channels: 4,
    },
  })
    .jpeg({ quality: OG_IMAGE_JPEG_QUALITY, mozjpeg: true })
    .toBuffer()
}

interface RenderOgImageOptions {
  template: OgTemplateProps
  fonts: SatoriOptions['fonts']
}

export async function renderOgImage({ template, fonts }: RenderOgImageOptions): Promise<Uint8Array> {
  const svg = await satori(<OgTemplate {...template} />, {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    fonts,
    embedFont: true,
  })

  const svgInput = typeof svg === 'string' ? svg : Buffer.from(svg)
  const renderer = new Resvg(svgInput, {
    fitTo: { mode: 'width', value: OG_IMAGE_WIDTH },
    background: 'rgba(0,0,0,0)',
  })

  return encodeJpeg(renderer)
}

interface RenderHomepageOgImageOptions {
  template: HomepageOgTemplateProps
  fonts: SatoriOptions['fonts']
}

export async function renderHomepageOgImage({ template, fonts }: RenderHomepageOgImageOptions): Promise<Uint8Array> {
  const svg = await satori(<HomepageOgTemplate {...template} />, {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    fonts,
    embedFont: true,
    async loadAdditionalAsset(code, segment) {
      if (code === 'emoji' && segment) {
        return `data:image/svg+xml;base64,${btoa(await load_emoji(get_icon_code(segment)))}`
      }
      return ''
    },
  })

  const svgInput = typeof svg === 'string' ? svg : Buffer.from(svg)
  const renderer = new Resvg(svgInput, {
    fitTo: { mode: 'width', value: OG_IMAGE_WIDTH },
    background: 'rgba(0,0,0,0)',
  })

  return encodeJpeg(renderer)
}
