import { ofetch } from 'ofetch'

import { getAuthCookie } from './auth'

export const API_BASE_URL = 'https://api.afilmory.art/api'
export const SAAS_BASE_DOMAIN = 'afilmory.art'

export const apiClient = ofetch.create({
  baseURL: API_BASE_URL,
  onRequest({ options }) {
    const cookie = getAuthCookie()
    if (cookie) {
      options.headers.set('Cookie', cookie)
    }
  },
})
