import type { NextRequest } from 'next/server'

const CORE_API_BASE =
  process.env.CORE_API_URL ??
  process.env.NEXT_PUBLIC_CORE_API_URL ??
  process.env.API_BASE_URL ??
  'http://localhost:3000'

const FORWARDED_HEADER_KEYS = [
  'cookie',
  'authorization',
  'x-tenant-id',
  'x-tenant-slug',
  'x-forwarded-host',
  'x-forwarded-proto',
  'host',
]

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

export const GET = async (request: NextRequest, { params }: { params: Promise<{ photoId: string }> }) => {
  const { photoId } = await params
  const targetUrl = buildBackendUrl(photoId)

  const response = await fetch(targetUrl, {
    headers: buildForwardHeaders(request),
  })

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
