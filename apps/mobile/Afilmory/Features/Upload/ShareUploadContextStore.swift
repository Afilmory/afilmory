import Foundation

struct ShareUploadContextSnapshot: Codable {
  let tenantBaseURL: String
  let workspaceID: String
  let workspaceName: String
  var suggestedTags: [String]
  var updatedAt: Date
}

enum ShareUploadContract {
  static let contextKey = "share-upload.context.v1"
  static let inboxDirectory = "share-upload/inbox"
  static let receiptDirectory = "share-upload/receipts"

  static var containerURL: URL? {
    guard let appGroupIdentifier = AfilmoryBuildConfiguration.appGroupIdentifier else { return nil }
    return FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupIdentifier
    )
  }
}

enum ShareUploadContextStore {
  static func update(session: AfilmorySession) {
    guard let workspace = session.activeWorkspace,
          workspace.status == "active",
          let membership = session.activeMembership,
          membership.status == "active",
          membership.role == "admin" || membership.role == "owner",
          let tenantBaseURL = try? ApiEnvironmentStore.shared
            .galleryAPIBaseURL(slug: workspace.slug)
            .absoluteString
    else {
      clear()
      return
    }

    let previous = load()
    let snapshot = ShareUploadContextSnapshot(
      tenantBaseURL: tenantBaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")),
      workspaceID: workspace.id,
      workspaceName: workspace.name,
      suggestedTags: previous?.workspaceID == workspace.id ? previous?.suggestedTags ?? [] : [],
      updatedAt: .now
    )
    save(snapshot)
  }

  static func updateSuggestedTags(_ values: [String]) {
    guard var snapshot = load() else { return }
    var seen = Set<String>()
    snapshot.suggestedTags = values.compactMap { value in
      let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !normalized.isEmpty, seen.insert(normalized).inserted else { return nil }
      return normalized
    }.prefix(64).map { $0 }
    snapshot.updatedAt = .now
    save(snapshot)
  }

  static func load() -> ShareUploadContextSnapshot? {
    guard let data = defaults?.data(forKey: ShareUploadContract.contextKey) else { return nil }
    return try? JSONDecoder().decode(ShareUploadContextSnapshot.self, from: data)
  }

  static func clear() {
    defaults?.removeObject(forKey: ShareUploadContract.contextKey)
  }

  private static var defaults: UserDefaults? {
    guard let appGroupIdentifier = AfilmoryBuildConfiguration.appGroupIdentifier else { return nil }
    return UserDefaults(suiteName: appGroupIdentifier)
  }

  private static func save(_ snapshot: ShareUploadContextSnapshot) {
    guard let data = try? JSONEncoder().encode(snapshot) else { return }
    defaults?.set(data, forKey: ShareUploadContract.contextKey)
  }
}
