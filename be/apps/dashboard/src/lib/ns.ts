const ns = 'app'
export const getStorageNS = (key: string) => `${ns}:${key}`

export function clearStorage() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(ns)) {
      localStorage.removeItem(key)
    }
  }
}
