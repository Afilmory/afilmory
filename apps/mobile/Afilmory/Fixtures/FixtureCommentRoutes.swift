#if DEBUG
  import Foundation

  enum FixtureCommentRoutes {
    static func respond(_ request: FixtureRequest) -> FixtureResponse? {
      let slug = request.tenantSlug ?? FixtureCatalog.ownSlug
      if request.match("GET", "comments") != nil {
        guard let photoId = request.query["photoId"] else { return missingPhoto }
        let comments = request.state.read { data in
          data.comments
            .filter { $0.slug == slug && $0.photoId == photoId && $0.status == "approved" }
            .sorted { $0.createdAt < $1.createdAt }
        }
        let limit = max(request.int("limit", default: 20), 1)
        let offset = request.query["cursor"].flatMap(Int.init) ?? 0
        let page = Array(comments.dropFirst(offset).prefix(limit))
        let next = offset + page.count < comments.count ? String(offset + page.count) : nil
        return FixtureReply.json(self.page(page, request: request, nextCursor: next, studio: false))
      }
      if request.match("GET", "comments/count") != nil {
        guard let photoId = request.query["photoId"] else { return missingPhoto }
        let count = request.state.read { data in
          data.comments.filter { $0.slug == slug && $0.photoId == photoId && $0.status == "approved" }.count
        }
        return FixtureReply.json(["count": count])
      }
      if request.match("POST", "comments") != nil {
        return create(request, slug: slug)
      }
      if request.match("GET", "comments/all") != nil {
        if let denied = FixtureManifestRoutes.ownerGuard(request) { return denied }
        let status = request.query["status"]
        let comments = request.state.read { data in
          data.comments
            .filter { $0.slug == slug && (status == nil || $0.status == status) }
            .sorted { $0.createdAt > $1.createdAt }
        }
        let limit = max(request.int("limit", default: 20), 1)
        let offset = request.query["cursor"].flatMap(Int.init) ?? 0
        let page = Array(comments.dropFirst(offset).prefix(limit))
        let next = offset + page.count < comments.count ? String(offset + page.count) : nil
        return FixtureReply.json(self.page(page, request: request, nextCursor: next, studio: true))
      }
      if let captures = request.match("DELETE", "comments/:id") {
        if let denied = FixtureManifestRoutes.ownerGuard(request) { return denied }
        let removed = request.state.mutate { data -> Bool in
          let before = data.comments.count
          data.comments.removeAll { $0.id == captures[0] || $0.parentId == captures[0] }
          return data.comments.count != before
        }
        return removed ? FixtureReply.json(["deleted": true]) : commentNotFound
      }
      if let captures = request.match("POST", "comments/:id/reactions") {
        guard request.state.read(\.signedIn) else { return FixtureReply.unauthorized }
        let updated = request.state.mutate { data -> FixtureComment? in
          guard let index = data.comments.firstIndex(where: { $0.id == captures[0] }) else { return nil }
          data.comments[index].viewerLiked.toggle()
          data.comments[index].likes = max(0, data.comments[index].likes + (data.comments[index].viewerLiked ? 1 : -1))
          return data.comments[index]
        }
        guard let updated else { return commentNotFound }
        return FixtureReply.json(["item": item(updated)])
      }
      if let captures = request.match("POST", "comments/:id/reports") {
        guard request.state.read(\.signedIn) else { return FixtureReply.unauthorized }
        guard exists(request, id: captures[0]) else { return commentNotFound }
        return FixtureReply.json(["reportId": "report-\(captures[0])", "reported": true, "status": "pending"])
      }
      if let captures = request.match("POST", "comments/:id/block-author") {
        guard request.state.read(\.signedIn) else { return FixtureReply.unauthorized }
        let blocked = request.state.mutate { data -> String? in
          guard let author = data.comments.first(where: { $0.id == captures[0] })?.userId,
                author != FixtureCatalog.shared.owner.id
          else { return nil }
          data.comments.removeAll { $0.userId == author && $0.slug != FixtureCatalog.ownSlug }
          return author
        }
        guard let blocked else { return FixtureReply.error(400, "You cannot block this author", code: "INVALID_TARGET") }
        return FixtureReply.json(["blocked": true, "blockedUserId": blocked, "reported": true])
      }
      return nil
    }

    private static var missingPhoto: FixtureResponse {
      FixtureReply.error(400, "photoId is required", code: "VALIDATION_ERROR")
    }

    private static var commentNotFound: FixtureResponse {
      FixtureReply.error(404, "Comment not found", code: "NOT_FOUND")
    }

    private static func exists(_ request: FixtureRequest, id: String) -> Bool {
      request.state.read { $0.comments.contains { $0.id == id } }
    }

    private static func create(_ request: FixtureRequest, slug: String) -> FixtureResponse {
      guard request.state.read(\.signedIn) else { return FixtureReply.unauthorized }
      let content = (request.string("content") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      guard !content.isEmpty, let photoId = request.string("photoId") else {
        return FixtureReply.error(400, "Comment content is required", code: "VALIDATION_ERROR")
      }
      let parentId = request.string("parentId")
      let created = request.state.mutate { data -> FixtureComment in
        data.commentSequence += 1
        let comment = FixtureComment(
          id: "comment-new-\(data.commentSequence)",
          slug: slug,
          photoId: photoId,
          parentId: parentId,
          userId: FixtureCatalog.shared.owner.id,
          content: content,
          status: "approved",
          createdAt: Date(),
          likes: 0,
          viewerLiked: false
        )
        data.comments.append(comment)
        return comment
      }
      return FixtureReply.json(page([created], request: request, nextCursor: nil, studio: false))
    }

    private static func page(_ comments: [FixtureComment], request: FixtureRequest, nextCursor: String?, studio: Bool) -> [String: Any] {
      let all = request.state.read(\.comments)
      var relations: [String: Any] = [:]
      var userIds = Set(comments.map(\.userId))
      for comment in comments {
        guard let parentId = comment.parentId, let parent = all.first(where: { $0.id == parentId }) else { continue }
        relations[parentId] = item(parent)
        userIds.insert(parent.userId)
      }
      var users: [String: Any] = [:]
      for id in userIds {
        guard let user = FixtureCatalog.shared.users[id] else { continue }
        var record: [String: Any] = ["id": user.id, "name": user.name, "image": orNull(user.avatarURL)]
        if !studio {
          record["website"] = NSNull()
        }
        users[id] = record
      }
      return [
        "comments": comments.map(item),
        "relations": relations,
        "users": users,
        "nextCursor": orNull(nextCursor),
      ]
    }

    static func item(_ comment: FixtureComment) -> [String: Any] {
      let timestamp = FixtureClock.iso(comment.createdAt)
      return [
        "id": comment.id,
        "photoId": comment.photoId,
        "parentId": orNull(comment.parentId),
        "userId": comment.userId,
        "content": comment.content,
        "status": comment.status,
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "reactionCounts": comment.likes > 0 ? ["like": comment.likes] : [String: Int](),
        "viewerReactions": comment.viewerLiked ? ["like"] : [String](),
      ]
    }
  }
#endif
