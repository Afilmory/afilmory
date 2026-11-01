import Foundation

@MainActor
final class ViewingModel {
  enum Change {
    case subscriptions
    case timeline
    case directory
  }

  enum LoadState: Equatable {
    case idle
    case loading
    case loaded
    case failed
  }

  final class Observation {
    private let cancel: @MainActor @Sendable () -> Void

    init(cancel: @escaping @MainActor @Sendable () -> Void) {
      self.cancel = cancel
    }

    deinit {
      let cancel = cancel
      MainActor.assumeIsolated { cancel() }
    }
  }

  let isVisitor: Bool
  private(set) var directory: [FeaturedGallery] = []
  private(set) var directoryState: LoadState = .idle
  private(set) var subscriptionsLoaded = false
  private(set) var query = ""
  private var pendingFollows: [String: Bool] = [:]
  private var timelineBusy = false
  private var observers: [UUID: (Change) -> Void] = [:]
  private var directoryTask: Task<Void, Never>?
  private var searchTask: Task<Void, Never>?
  private let directoryStore = GalleryDirectoryStore()
  private let subscriptionStore = GallerySubscriptionStore.shared
  private let timelineStore = GalleryTimelineStore.shared

  init(isVisitor: Bool) {
    self.isVisitor = isVisitor
  }

  var userID: String? {
    AfilmorySessionStore.shared.current().state.session?.user.id
  }

  var isSignedIn: Bool { !isVisitor && userID != nil }

  var subscriptions: [GallerySubscriptionItem] {
    isSignedIn ? subscriptionStore.subscriptions : []
  }

  var timelineEvents: [GalleryTimelineEvent] { isSignedIn ? timelineStore.events : [] }
  var timelineIsLoading: Bool { timelineBusy || timelineStore.isLoading }
  var timelineFailed: Bool { timelineStore.loadFailed }
  var timelineHasMore: Bool { timelineStore.nextCursor != nil }

  var cards: (following: [ViewingGalleryCard], discover: [ViewingGalleryCard]) {
    ViewingContent.galleryCards(subscriptions: subscriptions, directory: directory, query: query)
  }

  func isFollowing(_ id: String) -> Bool {
    pendingFollows[id] ?? subscriptionStore.isSubscribed(tenantId: id)
  }

  func isUpdatingFollow(_ id: String) -> Bool {
    pendingFollows[id] != nil
  }

  func observe(_ observer: @escaping (Change) -> Void) -> Observation {
    let id = UUID()
    observers[id] = observer
    return Observation { [weak self] in self?.observers.removeValue(forKey: id) }
  }

  func start() {
    if isSignedIn {
      Task { await refreshSubscriptions() }
      Task { await refreshTimeline() }
    }
    loadDirectory(force: false)
  }

  func refreshSubscriptions() async {
    guard let userID, !isVisitor else { return }
    await subscriptionStore.load(userId: userID, force: true)
    subscriptionsLoaded = true
    notify(.subscriptions)
  }

  func cachedHasSubscriptions() -> Bool? {
    guard let userID else { return nil }
    return subscriptionStore.cachedHasSubscriptions(userId: userID)
  }

  func refreshTimeline() async {
    guard isSignedIn else { return }
    timelineBusy = true
    notify(.timeline)
    await timelineStore.refresh(timeZone: TimeZone.current.identifier)
    timelineBusy = false
    notify(.timeline)
  }

  func loadMoreTimeline() {
    guard isSignedIn, timelineHasMore, !timelineIsLoading else { return }
    timelineBusy = true
    notify(.timeline)
    Task {
      await timelineStore.loadMore(timeZone: TimeZone.current.identifier)
      timelineBusy = false
      notify(.timeline)
    }
  }

  func loadDirectory(force: Bool) {
    if directoryTask != nil, !force { return }
    directoryTask?.cancel()
    let requested = query.trimmingCharacters(in: .whitespacesAndNewlines)
    if requested.isEmpty, directory.isEmpty, let cached = directoryStore.loadCached() {
      directory = cached
    }
    directoryState = .loading
    notify(.directory)
    directoryTask = Task { [weak self] in
      guard let self else { return }
      do {
        let fetched = try await directoryStore.fetch(query: requested, limit: 30)
        guard !Task.isCancelled else { return }
        directory = requested.isEmpty ? fetched : merged(fetched)
        directoryState = .loaded
      } catch {
        guard !Task.isCancelled else { return }
        directoryState = .failed
      }
      directoryTask = nil
      notify(.directory)
    }
  }

  func setQuery(_ text: String) {
    guard text != query else { return }
    query = text
    notify(.directory)
    searchTask?.cancel()
    searchTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(350))
      guard !Task.isCancelled else { return }
      self?.loadDirectory(force: true)
    }
  }

  @discardableResult
  func toggleFollow(_ card: ViewingGalleryCard, onError: @escaping (Error) -> Void) -> Bool {
    guard isSignedIn else { return false }
    guard !card.isOwn, pendingFollows[card.id] == nil else { return true }
    let target = !isFollowing(card.id)
    pendingFollows[card.id] = target
    if !target { timelineStore.removeEvents(tenantId: card.id) }
    notify(.subscriptions)
    notify(.timeline)
    Task { [weak self] in
      guard let self else { return }
      do {
        if target {
          try await subscriptionStore.subscribe(card.header)
          await GalleryNotificationPermissionCoordinator().requestAfterFollowIfUndecided()
        } else {
          try await subscriptionStore.unsubscribe(tenantId: card.id)
        }
      } catch {
        onError(error)
      }
      pendingFollows[card.id] = nil
      notify(.subscriptions)
      if target { await refreshTimeline() }
    }
    return true
  }

  private func merged(_ fetched: [FeaturedGallery]) -> [FeaturedGallery] {
    let known = Set(directory.map(\.id))
    return directory + fetched.filter { !known.contains($0.id) }
  }

  private func notify(_ change: Change) {
    for observer in observers.values {
      observer(change)
    }
  }
}
