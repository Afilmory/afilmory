import Foundation

@MainActor
final class ExhibitionFeed {
  enum State: Equatable {
    case loading
    case loaded
    case failed
    case unavailable
  }

  struct Snapshot: Equatable {
    var photos: [GalleryPhoto] = []
    var state: State = .loading
  }

  var onChange: ((Snapshot) -> Void)?
  private(set) var snapshot = Snapshot()
  private(set) var slug: String?

  private let source: ExhibitionSource
  private var feed: PhotoFeed?
  private var feedObservation: PhotoFeedObservationToken?
  private var sessionObservation: AfilmorySessionObservationToken?
  private var syncObservation: NSObjectProtocol?
  private var syncSucceeded: Bool?

  init(source: ExhibitionSource) {
    self.source = source
  }

  var isOwnGallery: Bool {
    guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state else { return false }
    return session.activeWorkspace?.slug == slug && slug != nil
  }

  var ownWorkspaceName: String? {
    guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state else { return nil }
    return session.activeWorkspace?.name
  }

  func start() {
    syncObservation = NotificationCenter.default.addObserver(
      forName: PhotoSyncEngine.didFinishSync, object: nil, queue: .main
    ) { [weak self] note in
      let slug = note.userInfo?["slug"] as? String
      let succeeded = note.userInfo?["succeeded"] as? Bool
      MainActor.assumeIsolated {
        guard let self, slug == self.slug else { return }
        self.syncSucceeded = succeeded
        self.render()
      }
    }
    switch source {
    case .own:
      sessionObservation = AfilmorySessionStore.shared.observe { [weak self] _ in
        Task { @MainActor in self?.resolveOwnWorkspace() }
      }
      resolveOwnWorkspace()
    case .gallery(let slug, _):
      bind(slug: slug)
    }
  }

  func reload() {
    guard let slug else { return }
    syncSucceeded = nil
    render()
    PhotoFeedStore.shared.load(.manifest(slug), force: true)
  }

  private func resolveOwnWorkspace() {
    guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state,
          session.hasUsableWorkspace,
          let workspace = session.activeWorkspace
    else {
      unbind()
      publish(Snapshot(photos: [], state: .unavailable))
      return
    }
    guard slug != workspace.slug else { return }
    ApiEnvironmentStore.shared.activateTenant(slug: workspace.slug)
    PhotoFilterStore.shared.activateGallery(workspace.slug)
    bind(slug: workspace.slug)
  }

  private func bind(slug: String) {
    unbind()
    self.slug = slug
    syncSucceeded = nil
    let feed = PhotoFeedStore.shared.feed(for: .manifest(slug))
    self.feed = feed
    feedObservation = feed.observe { [weak self] in self?.render() }
    PhotoFeedStore.shared.load(.manifest(slug))
    render()
  }

  private func unbind() {
    feedObservation?.cancel()
    feedObservation = nil
    feed = nil
    slug = nil
  }

  private func render() {
    guard let feed else { return }
    let state: State
    if !feed.photos.isEmpty {
      state = .loaded
    } else if feed.loadState == .failed || syncSucceeded == false {
      state = .failed
    } else if syncSucceeded == true {
      state = .loaded
    } else {
      state = .loading
    }
    publish(Snapshot(photos: ExhibitionLibrary.chronological(feed.photos), state: state))
  }

  private func publish(_ next: Snapshot) {
    guard next != snapshot else { return }
    snapshot = next
    onChange?(next)
  }
}
