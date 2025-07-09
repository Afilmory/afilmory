import { DOMParser } from 'linkedom'
import type { NextRequest } from 'next/server'

import { injectConfigToDocument } from '~/lib/injectable'

export const GET = async (req: NextRequest) => {
  if (process.env.NODE_ENV === 'development') {
    return import('./[...all]/dev').then((m) => m.handler(req))
  }
  const indexHtml = await import('../index.html').then((m) => m.default)
  const document = new DOMParser().parseFromString(indexHtml, 'text/html')
  injectConfigToDocument(document)
  return new Response(document.documentElement.outerHTML, {
    headers: {
      'Content-Type': 'text/html',
      'X-SSR': '1',
    },
  })
}
