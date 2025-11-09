import { coreApi } from '~/lib/api-client'

import type { SessionResponse } from './session'

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse extends SessionResponse {
  message?: string
}

/**
 * Login with email and password using better-auth
 * @param data - Login credentials with email and password
 * @returns Session response with user and session data
 */
export async function login(data: LoginRequest): Promise<LoginResponse> {
  // better-auth returns Response object, we need to parse it
  const response = await coreApi<Response>('/auth/sign-in/email', {
    method: 'POST',
    body: data,
  })

  // Parse the response body if it's a Response object
  if (response instanceof Response) {
    const result = await response.json()
    return result as LoginResponse
  }

  // If it's already parsed, return as is
  return response as LoginResponse
}
