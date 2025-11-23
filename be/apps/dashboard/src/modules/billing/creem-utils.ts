export function buildCheckoutSuccessUrl(tenantSlug: string | null): string {
  const { origin, pathname, search, hash, protocol, hostname, port } = window.location
  const defaultUrl = `${origin}${pathname}${search}${hash}`
  const isLocalSubdomain = hostname !== 'localhost' && hostname.endsWith('.localhost')

  if (!isLocalSubdomain) {
    return defaultUrl
  }

  const redirectOrigin = `${protocol}//localhost${port ? `:${port}` : ''}`
  const redirectUrl = new URL('/creem-redirect.html', redirectOrigin)
  redirectUrl.searchParams.set('redirect', defaultUrl)
  if (tenantSlug) {
    redirectUrl.searchParams.set('tenant', tenantSlug)
  }
  return redirectUrl.toString()
}
