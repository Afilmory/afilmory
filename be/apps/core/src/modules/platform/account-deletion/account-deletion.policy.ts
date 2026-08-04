export interface OwnerSuccessorCandidate {
  createdAt: string
  email: string
  name: string
  role: 'admin' | 'member' | 'owner'
  status: string
  userId: string
}

export function selectOwnerSuccessor(
  memberships: readonly OwnerSuccessorCandidate[],
  deletingUserId: string,
): OwnerSuccessorCandidate | null {
  return (
    memberships
      .filter(
        membership =>
          membership.userId !== deletingUserId
          && membership.status === 'active'
          && (membership.role === 'admin' || membership.role === 'member'),
      )
      .toSorted((left, right) => {
        const roleDifference = roleRank(left.role) - roleRank(right.role)
        if (roleDifference !== 0) {
          return roleDifference
        }
        const createdDifference = left.createdAt.localeCompare(right.createdAt)
        return createdDifference === 0 ? left.userId.localeCompare(right.userId) : createdDifference
      })[0] ?? null
  )
}

function roleRank(role: OwnerSuccessorCandidate['role']): number {
  return role === 'admin' ? 0 : role === 'member' ? 1 : 2
}
