import { clearNativeSession, registerNativeSession } from '@/native/afilmorySession'

let authCookie: string | null = null

export function getAuthCookie(): string | null {
  return authCookie
}

export function adoptAuthCookie(cookie: string | null): void {
  authCookie = cookie
}

export function setAuthCookie(cookie: string | null): void {
  authCookie = cookie
  if (cookie) {
    registerNativeSession(cookie)
  }
  else {
    clearNativeSession()
  }
}
