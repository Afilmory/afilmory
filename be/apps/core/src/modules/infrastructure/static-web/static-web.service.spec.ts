import 'reflect-metadata'

import { runInNewContext } from 'node:vm'

import { HttpContext } from '@tsuki-hono/common'
import { Hono } from 'hono'
import { DOMParser } from 'linkedom'
import { describe, expect, it } from 'vitest'

import { StaticWebService } from './static-web.service'

const template = '<!doctype html><html><head><title>Gallery</title><script id="config"></script><script id="manifest"></script></head><body></body></html>'
const payload = '</script><script>window.injected = true</script>'

async function render(siteOverrides = {}, photoOverrides = {}) {
  const siteConfig = {
    name: 'Gallery',
    title: 'Gallery',
    description: 'A photo gallery',
    url: 'https://gallery.example.test',
    author: { name: 'Photographer' },
    ...siteOverrides,
  }
  const manifest = { version: 'v10', data: [{ id: 'photo', title: 'Photo', ...photoOverrides }] }
  const service = new StaticWebService(
    { getManifest: async () => manifest } as never,
    { getSiteConfig: async () => siteConfig } as never,
    { getStaticAssetHost: async () => null } as never,
  )
  const app = new Hono()
  app.get('/', context => HttpContext.run(context, async () => context.html(
    await service.transformIndexHtml(template, {
      absolutePath: '/static/web/index.html',
      relativePath: 'index.html',
      stats: { mtime: new Date(0), size: template.length },
    }),
  )))
  const response = await app.request('https://gallery.example.test/')
  return new DOMParser().parseFromString(await response.text(), 'text/html')
}

function readInjectedData(document: ReturnType<DOMParser['parseFromString']>) {
  const window: Record<string, unknown> = {}
  for (const script of document.querySelectorAll('script')) {
    runInNewContext(script.textContent!, { window })
  }
  return window
}

describe('gallery inline data isolation', () => {
  it.each(['title', 'description'])('keeps a script terminator in site.%s as data', async (field) => {
    const document = await render({ [field]: payload })

    expect(document.querySelectorAll('script')).toHaveLength(2)
    expect(readInjectedData(document).__SITE_CONFIG__).toMatchObject({ [field]: payload })
  })

  it('keeps photo metadata script terminators as manifest data', async () => {
    const document = await render({}, {
      title: payload,
      description: '</ScRiPt><script>window.injected = true</script>',
      exif: { ImageDescription: payload },
    })

    expect(document.querySelectorAll('script')).toHaveLength(2)
    expect(readInjectedData(document).__MANIFEST__).toMatchObject({
      data: [{ title: payload, exif: { ImageDescription: payload } }],
    })
  })

  it('preserves Unicode, quotes, HTML characters and script-like comments', async () => {
    const title = '相册 "quotes" & < > \\ \n\u2028\u2029 <!-- <script> escaped'
    const document = await render({ title })

    expect(document.querySelectorAll('script')).toHaveLength(2)
    expect(readInjectedData(document).__SITE_CONFIG__).toMatchObject({ title })
  })
})
