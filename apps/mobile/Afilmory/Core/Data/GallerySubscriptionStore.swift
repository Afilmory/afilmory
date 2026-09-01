import Foundation

@MainActor
final class GallerySubscriptionStore {
  static let shared = GallerySubscriptionStore()

  typealias SubscriptionMutation = @MainActor (String) async throws -> GallerySubscriptionMutationResponse

  private(set) var subscriptions: [GallerySubscriptionItem] = []
  private var hasLoaded = false

  var hasSubscriptions: Bool { !subscriptions.isEmpty }

  func isSubscribed(tenantId: String) -> Bool {
    subscriptions.contains { $0.tenantId == tenantId }
  }

  static func requestSubscribe(_ tenantId: String) async throws -> GallerySubscriptionMutationResponse {
    try await AfilmoryAPI.shared.request(GallerySubscriptionAPI.subscribe(tenantId: tenantId))
  }

  static func requestUnsubscribe(_ tenantId: String) async throws -> GallerySubscriptionMutationResponse {
    try await AfilmoryAPI.shared.request(GallerySubscriptionAPI.unsubscribe(tenantId: tenantId))
  }

  func subscribe(
    _ gallery: GalleryHeaderModel,
    perform: SubscriptionMutation = requestSubscribe
  ) async throws {
    guard !isSubscribed(tenantId: gallery.tenantId) else { return }
    subscriptions.insert(GallerySubscriptionItem(optimistic: gallery), at: 0)
    do {
      let response = try await perform(gallery.tenantId)
      if !response.subscribed {
        remove(tenantId: gallery.tenantId)
      }
    } catch {
      remove(tenantId: gallery.tenantId)
      throw error
    }
  }

  func unsubscribe(
    tenantId: String,
    perform: SubscriptionMutation = requestUnsubscribe
  ) async throws {
    let restore = subscriptions.enumerated()
      .filter { $0.element.tenantId == tenantId }
      .map { (index: $0.offset, item: $0.element) }
    subscriptions.removeAll { $0.tenantId == tenantId }
    do {
      let response = try await perform(tenantId)
      if response.subscribed {
        rollback(restore)
      }
    } catch {
      rollback(restore)
      throw error
    }
  }

  func cachedHasSubscriptions(userId: String) -> Bool? {
    let defaults = UserDefaults.standard
    let key = Self.cacheKey(userId: userId)
    guard defaults.object(forKey: key) != nil else { return nil }
    return defaults.bool(forKey: key)
  }

  func load(userId: String, force: Bool) async {
    if !force, hasLoaded {
      return
    }
    do {
      let response: GallerySubscriptionListResponse = try await AfilmoryAPI.shared.request(
        GallerySubscriptionAPI.list()
      )
      subscriptions = response.subscriptions
      hasLoaded = true
      UserDefaults.standard.set(hasSubscriptions, forKey: Self.cacheKey(userId: userId))
    } catch {
      if isAuthorizationFailure(error) {
        return
      }
    }
  }

  func remove(tenantId: String) {
    subscriptions.removeAll { $0.tenantId == tenantId }
  }

  private func rollback(_ restore: [(index: Int, item: GallerySubscriptionItem)]) {
    for entry in restore where entry.index <= subscriptions.count {
      subscriptions.insert(entry.item, at: entry.index)
    }
  }

  private static func cacheKey(userId: String) -> String {
    "explore.hasSubscriptions.\(userId)"
  }

  private func isAuthorizationFailure(_ error: Error) -> Bool {
    if case .http(let status, _) = error as? APIError, status == 401 || status == 403 {
      return true
    }
    return false
  }
}
