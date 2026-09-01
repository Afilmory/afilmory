import Foundation

@MainActor
final class GallerySubscriptionStore {
  static let shared = GallerySubscriptionStore()

  private(set) var subscriptions: [GallerySubscriptionItem] = []
  private var pendingSubscribedTenantIds: Set<String> = []

  var hasSubscriptions: Bool { !subscriptions.isEmpty }

  func isSubscribed(tenantId: String) -> Bool {
    pendingSubscribedTenantIds.contains(tenantId)
      || subscriptions.contains { $0.tenantId == tenantId }
  }

  func subscribe(tenantId: String) async throws {
    guard !isSubscribed(tenantId: tenantId) else { return }
    pendingSubscribedTenantIds.insert(tenantId)
    do {
      let response: GallerySubscriptionMutationResponse = try await AfilmoryAPI.shared.request(
        GallerySubscriptionAPI.subscribe(tenantId: tenantId)
      )
      if !response.subscribed {
        pendingSubscribedTenantIds.remove(tenantId)
      }
    } catch {
      pendingSubscribedTenantIds.remove(tenantId)
      throw error
    }
  }

  func unsubscribe(tenantId: String) async throws {
    let removed = subscriptions.filter { $0.tenantId == tenantId }
    let wasPending = pendingSubscribedTenantIds.contains(tenantId)
    pendingSubscribedTenantIds.remove(tenantId)
    subscriptions.removeAll { $0.tenantId == tenantId }
    func rollback() {
      subscriptions.append(contentsOf: removed)
      if wasPending {
        pendingSubscribedTenantIds.insert(tenantId)
      }
    }
    do {
      let response: GallerySubscriptionMutationResponse = try await AfilmoryAPI.shared.request(
        GallerySubscriptionAPI.unsubscribe(tenantId: tenantId)
      )
      if response.subscribed {
        rollback()
      }
    } catch {
      rollback()
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
    if !force, !subscriptions.isEmpty {
      return
    }
    do {
      let response: GallerySubscriptionListResponse = try await AfilmoryAPI.shared.request(
        GallerySubscriptionAPI.list()
      )
      subscriptions = response.subscriptions
      pendingSubscribedTenantIds.removeAll()
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
