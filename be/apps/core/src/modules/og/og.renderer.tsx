/** @jsxImportSource hono/jsx */
import { Buffer } from 'node:buffer'

import { Resvg } from '@resvg/resvg-js'
import type { SatoriOptions } from 'satori'
import satori from 'satori'

import type { OgTemplateProps } from './og.template'
import { OgTemplate } from './og.template'

interface RenderOgImageOptions {
  template: OgTemplateProps
  fonts: SatoriOptions['fonts']
}

export async function renderOgImage({ template, fonts }: RenderOgImageOptions): Promise<Uint8Array> {
  const svg = await satori(<OgTemplate {...template} />, {
    width: 1200,
    height: 628,
    fonts,
    embedFont: true,
  })

  const svgInput = typeof svg === 'string' ? svg : Buffer.from(svg)
  const renderer = new Resvg(svgInput, {
    fitTo: { mode: 'width', value: 1200 },
    background: 'rgba(0,0,0,0)',
  })

  return renderer.render().asPng()
}
