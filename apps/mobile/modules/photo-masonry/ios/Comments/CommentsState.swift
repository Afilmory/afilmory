import Foundation

enum CommentsState {
  static func mergePage(
    _ current: CommentCollection,
    page: CommentPage,
    replacing: Bool = false
  ) -> CommentCollection {
    var comments = replacing ? [] : current.comments
    var positions = Dictionary(uniqueKeysWithValues: comments.enumerated().map { ($1.id, $0) })

    for incoming in page.comments {
      if let position = positions[incoming.id] {
        let existing = comments[position]
        var replacement = incoming
        replacement.clientId = existing.clientId
        replacement.deliveryState = existing.deliveryState
        comments[position] = replacement
      } else {
        positions[incoming.id] = comments.count
        comments.append(incoming)
      }
    }
    return CommentCollection(
      comments: comments,
      relations: replacing ? page.relations : current.relations.merging(page.relations) { _, next in next },
      users: replacing ? page.users : current.users.merging(page.users) { _, next in next }
    )
  }

  static func settleOptimisticComment(
    _ current: CommentCollection,
    clientId: String,
    page: CommentPage
  ) -> CommentCollection {
    var remaining = current
    remaining.comments.removeAll { $0.clientId == clientId }
    var page = page
    if !page.comments.isEmpty {
      page.comments[0].clientId = clientId
      page.comments[0].deliveryState = .sent
    }
    return mergePage(remaining, page: page)
  }

  static func removeFailedOptimisticComment(
    _ current: CommentCollection,
    clientId: String
  ) -> CommentCollection {
    var next = current
    next.comments.removeAll { $0.clientId == clientId }
    return next
  }

  static func toggleLocalReaction(
    _ comment: CommentItem,
    reaction: String = "like"
  ) -> CommentItem {
    var next = comment
    let active = next.viewerReactions.contains(reaction)
    let count = next.reactionCounts[reaction] ?? 0
    next.reactionCounts[reaction] = max(0, count + (active ? -1 : 1))
    if active {
      next.viewerReactions.removeAll { $0 == reaction }
    } else {
      next.viewerReactions.append(reaction)
    }
    return next
  }

  static func removingAuthor(
    _ current: CommentCollection,
    userId: String
  ) -> CommentCollection {
    var next = current
    next.comments.removeAll { $0.userId == userId }
    next.relations = next.relations.filter { $0.value.userId != userId }
    next.users.removeValue(forKey: userId)
    return next
  }

  static func advanceCursor(
    current: String?,
    page: CommentPage,
    replacing: Bool
  ) -> String? {
    if replacing || !page.comments.isEmpty {
      return page.nextCursor
    }
    return current
  }
}
