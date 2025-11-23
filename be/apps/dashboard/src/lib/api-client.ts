import { $fetch } from 'ofetch'

import { getAccessDenied, setAccessDenied } from '~/atoms/access-denied'
import { withLanguageHeader } from '~/lib/request-language'

export const coreApiBaseURL = import.meta.env.VITE_APP_CORE_API_URL || '/api'

export const coreApi = $fetch.create({
  baseURL: coreApiBaseURL,
  credentials: 'include',
  onRequest({ options }) {
    options.headers = withLanguageHeader(options.headers)
  },
  onResponseError({ response }) {
    if (response?.status !== 403) {
      return
    }

    const current = getAccessDenied()
    const detail = (response._data as { message?: string } | undefined)?.message ?? current?.reason ?? null
    setAccessDenied({
      active: true,
      status: 403,
      path: window.location.pathname,
      scope: current?.scope ?? 'api',
      reason: detail,
      source: 'api',
      timestamp: Date.now(),
    })
  },
})
