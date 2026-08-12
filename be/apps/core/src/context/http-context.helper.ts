import { HttpContext } from '@tsuki-hono/common'
import type { Context } from 'hono'

/**
 * Extract client IP address from Hono context
 * Checks headers in order: cf-connecting-ip (Cloudflare), x-forwarded-for, x-real-ip, then socket remote address
 */
export function extractClientIp(context: Context): string | null {
  // Cloudflare's real client IP (highest priority)
  const cfConnectingIp = context.req.header('cf-connecting-ip')?.trim()
  if (cfConnectingIp) {
    return cfConnectingIp
  }

  // Proxy chain (x-forwarded-for may contain multiple IPs, first one is the original client)
  const forwardedFor = context.req.header('x-forwarded-for')
  if (forwardedFor) {
    const ip = forwardedFor.split(',')[0]?.trim()
    if (ip) {
      return ip
    }
  }

  // Nginx and other reverse proxies
  const realIp = context.req.header('x-real-ip')?.trim()
  if (realIp) {
    return realIp
  }

  // Fallback to socket remote address
  const { raw } = context.req
  if (raw && 'socket' in raw && raw.socket && typeof raw.socket === 'object' && 'remoteAddress' in raw.socket) {
    return (raw.socket as { remoteAddress?: string | null }).remoteAddress ?? null
  }

  return null
}

/**
 * A TLS-terminating proxy forwards the inner request as plain http, so `req.url` alone
 * under-reports HTTPS and would silently drop the Secure flag from cookies.
 */
export function isSecureRequest(context: Context): boolean {
  const forwardedProto = context.req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  if (forwardedProto) {
    return forwardedProto === 'https'
  }
  return new URL(context.req.url).protocol === 'https:'
}

/**
 * Get client IP from current HTTP context
 * Returns null if not in HTTP request context
 */
export function getClientIp(): string | null {
  try {
    const context = HttpContext.getValue('hono') as Context | undefined
    if (!context) {
      return null
    }
    return extractClientIp(context)
  }
  catch {
    return null
  }
}
