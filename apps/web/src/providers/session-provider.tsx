import { useQuery } from '@tanstack/react-query'
import { useSetAtom } from 'jotai'
import { useEffect } from 'react'

import { sessionMembershipAtom, sessionUserAtom } from '~/atoms/session'
import { authApi } from '~/lib/api/auth'

export function SessionProvider() {
  const setSessionUser = useSetAtom(sessionUserAtom)
  const setSessionMembership = useSetAtom(sessionMembershipAtom)

  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: authApi.getSession,
  })

  useEffect(() => {
    if (sessionQuery.data?.user) {
      setSessionUser(sessionQuery.data.user)
      setSessionMembership(sessionQuery.data.requestedMembership ?? null)
    }
    else if (sessionQuery.data === null) {
      setSessionUser(null)
      setSessionMembership(null)
    }
  }, [sessionQuery.data, setSessionMembership, setSessionUser])

  return null
}
