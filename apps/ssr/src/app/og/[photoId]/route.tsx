import { hostname } from 'node:os'
import process from 'node:process'

import type { NextRequest } from 'next/server'

import { photoLoader } from '~/lib/photo-loader'

function getDefaultCoreApiBase(): string {
  // In Docker, HOSTNAME is set to the container ID, and localhost may not resolve correctly (IPv6 issues).
  // Use os.hostname() which is resolvable within the Docker network.
  const isDocker = process.env.HOSTNAME && /^[a-f0-9]{12,64}$/.test(process.env.HOSTNAME)
  const host = isDocker ? hostname() : 'localhost'
  return `http://${host}:3000`
}

const CORE_API_BASE
  = process.env.CORE_API_URL
    ?? process.env.NEXT_PUBLIC_CORE_API_URL
    ?? process.env.API_BASE_URL
    ?? getDefaultCoreApiBase()

const FORWARDED_HEADER_KEYS = ['cookie', 'authorization', 'x-forwarded-host', 'x-forwarded-proto', 'host']

function buildBackendUrl(photoId: string): string {
  const base = CORE_API_BASE.endsWith('/') ? CORE_API_BASE.slice(0, -1) : CORE_API_BASE
  return `${base}/og/${encodeURIComponent(photoId)}`
}

function buildForwardHeaders(request: NextRequest): Headers {
  const headers = new Headers()

  for (const key of FORWARDED_HEADER_KEYS) {
    const value = request.headers.get(key)
    if (value) {
      headers.set(key, value)
    }
  }

  const hostHeader = request.headers.get('host')
  if (!headers.has('x-forwarded-host') && hostHeader) {
    headers.set('x-forwarded-host', hostHeader)
  }

  if (!headers.has('x-forwarded-proto')) {
    headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''))
  }

  headers.set('accept', 'image/png,image/*;q=0.9,*/*;q=0.8')
  return headers
}

export const revalidate = 0

function fallbackToThumbnail(request: NextRequest, photoId: string): Response {
  const photo = photoLoader.getPhoto(photoId)

  if (!photo?.thumbnailUrl) {
    return new Response('Not Found', { status: 404 })
  }

  const thumbnailUrl = new URL(photo.thumbnailUrl, request.nextUrl).toString()
  return Response.redirect(thumbnailUrl, 302)
}

export const GET = async (request: NextRequest, { params }: { params: Promise<{ photoId: string }> }) => {
  const { photoId } = await params
  const targetUrl = buildBackendUrl(photoId)

  let response: Response
  try {
    response = await fetch(targetUrl, {
      headers: buildForwardHeaders(request),
    })
  }
  catch {
    // The core API is not deployed next to the SSR app (e.g. Vercel-only
    // deployments), so /og has nothing to proxy to. Serve the thumbnail
    // instead of bubbling a 500 into every og:image meta tag. #248
    return fallbackToThumbnail(request, photoId)
  }

  if (response.status >= 500) {
    return fallbackToThumbnail(request, photoId)
  }

  if (!response.ok) {
    return new Response(await response.text(), {
      status: response.status,
      headers: response.headers,
    })
  }

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  })
}
