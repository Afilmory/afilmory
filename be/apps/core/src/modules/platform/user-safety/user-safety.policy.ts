export function canTargetUser(actorUserId: string, targetUserId: string): boolean {
  return actorUserId.length > 0 && targetUserId.length > 0 && actorUserId !== targetUserId
}

export function excludeBlockedAuthors<T>(
  records: T[],
  blockedUserIds: ReadonlySet<string>,
  author: (record: T) => string | null | undefined,
): T[] {
  if (blockedUserIds.size === 0) {
    return records
  }
  return records.filter((record) => {
    const authorId = author(record)
    return !authorId || !blockedUserIds.has(authorId)
  })
}
