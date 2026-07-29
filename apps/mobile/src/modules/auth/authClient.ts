import { expoClient } from '@better-auth/expo/client'
import { createAuthClient } from 'better-auth/react'
import * as SecureStore from 'expo-secure-store'

import { API_BASE_URL } from '@/api/client'

export const authClient = createAuthClient({
  baseURL: `${API_BASE_URL}/auth`,
  plugins: [
    expoClient({
      scheme: 'afilmory',
      storagePrefix: 'afilmory',
      storage: SecureStore,
    }),
  ],
})
