import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FetchError } from 'ofetch'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useSetAuthUser } from '~/atoms/auth'
import { AUTH_SESSION_QUERY_KEY, fetchSession } from '~/modules/auth/api/session'

import { signInAuth } from '../auth-client'

export interface LoginRequest {
  email: string
  password: string
  rememberMe?: boolean
}

export function useLogin() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setAuthUser = useSetAuthUser()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loginMutation = useMutation({
    mutationFn: async (data: LoginRequest) => {
      const rememberMe = data.rememberMe ?? true

      await signInAuth.email({
        email: data.email,
        password: data.password,
        rememberMe,
      })

      return await queryClient.fetchQuery({
        queryKey: AUTH_SESSION_QUERY_KEY,
        queryFn: fetchSession,
      })
    },
    onSuccess: (session) => {
      // Update cache and atom
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, session)
      setAuthUser(session.user)
      setErrorMessage(null)
      const destination = session.user.role === 'superadmin' ? '/superadmin/settings' : '/'
      navigate(destination, { replace: true })
    },
    onError: (error: Error) => {
      if (error instanceof FetchError) {
        const status = error.statusCode ?? error.response?.status
        const serverMessage = (error.data as any)?.message
        switch (status) {
          case 401: {
            setErrorMessage(serverMessage || 'Invalid email or password')
            break
          }
          case 403: {
            setErrorMessage(serverMessage || 'Access denied')
            break
          }
          case 429: {
            setErrorMessage('Too many attempts. Please try again later')
            break
          }
          default: {
            setErrorMessage(serverMessage || error.message || 'Login failed. Please try again')
          }
        }
      } else {
        setErrorMessage('An unexpected error occurred. Please try again')
      }
    },
  })

  const clearError = () => setErrorMessage(null)

  return {
    login: loginMutation.mutate,
    isLoading: loginMutation.isPending,
    error: errorMessage,
    clearError,
  }
}
