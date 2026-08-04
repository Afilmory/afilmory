import * as SecureStore from 'expo-secure-store'

export const AUTH_STORAGE_PREFIX = 'afilmory'
export const AUTH_COOKIE_PREFIX = 'afilmory-global'

const HYDRATED_KEYS = [`${AUTH_STORAGE_PREFIX}_cookie`, `${AUTH_STORAGE_PREFIX}_session_data`]

const cache = new Map<string, string>()

// @better-auth/expo reads storage synchronously (its getCookie and OAuth-state
// paths call getItem directly), but SecureStore's synchronous getItem/setItem
// throw `A required entitlement isn't present` on simulator builds. Reads are
// served from memory, hydrated once at boot; writes go to the keychain async.
const hydration: Promise<void> = Promise.all(
  HYDRATED_KEYS.map(async (key) => {
    const value = await SecureStore.getItemAsync(key).catch(() => null)
    if (value !== null) {
      cache.set(key, value)
    }
  }),
).then(() => {})

export function waitForAuthStorage(): Promise<void> {
  return hydration
}

export async function clearAuthStorage(): Promise<void> {
  for (const key of HYDRATED_KEYS) {
    cache.delete(key)
  }
  await Promise.all(HYDRATED_KEYS.map(key => SecureStore.deleteItemAsync(key).catch(() => {})))
}

export const authStorage = {
  getItem(key: string): string | null {
    return cache.get(key) ?? null
  },
  setItem(key: string, value: string): void {
    cache.set(key, value)
    void SecureStore.setItemAsync(key, value).catch(() => {})
  },
  removeItem(key: string): void {
    cache.delete(key)
    void SecureStore.deleteItemAsync(key).catch(() => {})
  },
}
