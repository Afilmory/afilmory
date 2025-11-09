import { DOMParser } from 'linkedom'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { injectConfigToDocument } from '~/lib/injectable'

const host = 'http://localhost:13333'
export const handler = async (req: NextRequest) => {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse(null, { status: 404 })
  }

  if (req.nextUrl.pathname.startsWith('/thumbnails') || req.nextUrl.pathname.startsWith('/photos')) {
    return proxyAssets(req)
  }

  return proxyIndexHtml()
}

async function proxyAssets(req: NextRequest) {
  const url = new URL(req.url)
  const { pathname } = url
  const response = await fetch(host + pathname)
  return new NextResponse(response.body, {
    headers: response.headers,
  })
}

async function proxyIndexHtml() {
  const htmlText = await fetch(host).then((res) => res.text())

  const parser = new DOMParser()
  const document = parser.parseFromString(htmlText, 'text/html')

  const scripts = document.querySelectorAll('script') as NodeListOf<HTMLScriptElement>

  scripts.forEach((script) => {
    if (script.src.startsWith('/')) {
      script.src = replaceUrl(script.src, host)
    }
  })

  const links = document.head.querySelectorAll('link')
  links.forEach((link) => {
    if (link.href.startsWith('/')) {
      link.href = replaceUrl(link.href, host)
    }
  })

  const injectScripts = document.querySelectorAll('script[type="module"]')
  injectScripts.forEach((script) => {
    script.innerHTML = script.innerHTML
      .replace('/@vite-plugin-checker-runtime', `${host}/@vite-plugin-checker-runtime`)
      .replace('/@react-refresh', `${host}/@react-refresh`)
  })

  injectConfigToDocument(document)

  return new NextResponse(document.documentElement.outerHTML, {
    headers: { 'Content-Type': 'text/html' },
  })
}
const replaceUrl = (url: string, host: string) => {
  return new URL(url.startsWith('http') ? new URL(url).pathname : url, new URL(host)).toString()
}
