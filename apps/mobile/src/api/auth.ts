let authCookie: string | null = null

export function getAuthCookie(): string | null {
  return authCookie
}

export function setAuthCookie(cookie: string | null): void {
  authCookie = cookie
}
