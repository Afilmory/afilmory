const rawBase = (import.meta.env.PUBLIC_API_URL as string | undefined) ?? '/api'

export const API_BASE = rawBase.replace(/\/$/, '')

export interface TenantSlugCheckResponse {
  ok?: boolean
  message?: string
  code?: number
  next_url?: string
  nextUrl?: string
  redirect_url?: string
  redirectUrl?: string
}

export async function checkTenantSlug(slug: string): Promise<TenantSlugCheckResponse> {
  const response = await fetch(`${API_BASE}/tenant/check-slug`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug }),
  })

  let payload: TenantSlugCheckResponse | null = null
  try {
    payload = (await response.json()) as TenantSlugCheckResponse
  }
  catch {
    payload = null
  }

  if (!response.ok) {
    return {
      ok: false,
      message: payload?.message,
      code: response.status,
    }
  }

  return payload ?? { ok: false }
}

export interface FeaturedGallery {
  id: string
  name: string
  slug: string
  domain: string | null
  description: string | null
  author: { name: string, avatar: string | null } | null
  photoCount: number
  tags: string[]
  lastUpload: string
}

export async function fetchFeaturedGalleries(): Promise<FeaturedGallery[]> {
  const response = await fetch(`${API_BASE}/gallery-directory`, {
    method: 'GET',
    headers: { 'content-type': 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`gallery-directory ${response.status}`)
  }
  const payload = (await response.json()) as { galleries?: FeaturedGallery[] }
  return payload.galleries ?? []
}

export function galleryPublicUrl(gallery: FeaturedGallery): string {
  if (gallery.domain) {
    const host = gallery.domain.replace(/^https?:\/\//, '')
    return `https://${host}`
  }
  return `https://${gallery.slug}.afilmory.art`
}

export function tenantLoginUrl(slug: string): string {
  return `https://${slug}.afilmory.art/platform/login`
}
