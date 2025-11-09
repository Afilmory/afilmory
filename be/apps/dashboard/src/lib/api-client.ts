import { $fetch } from 'ofetch'

export const coreApiBaseURL = import.meta.env.VITE_APP_API_BASE?.replace(/\/$/, '') || '/api'

export const coreApi = $fetch.create({
  baseURL: coreApiBaseURL,
  credentials: 'include',
})
