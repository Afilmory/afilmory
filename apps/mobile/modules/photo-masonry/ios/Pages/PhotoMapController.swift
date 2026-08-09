import UIKit

final class PhotoMapController: UIViewController {
  private let localization = Localization.shared
  private let onRequestSignIn: () -> Void
  private let mapView: PhotoMapView
  private var sessionObservation: AfilmorySessionObservationToken?
  private var feedObservation: PhotoFeedObservationToken?
  private var filterObservation: PhotoFeedObservationToken?
  private var feed: PhotoFeed?
  private var gallerySlug: String?
  private var displayedPhotos: [GalleryPhoto] = []

  init(onRequestSignIn: @escaping () -> Void) {
    self.onRequestSignIn = onRequestSignIn
    mapView = PhotoMapView(frame: .zero)
    super.init(nibName: nil, bundle: nil)
    configureMap()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func loadView() {
    view = mapView
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    filterObservation = PhotoFilterStore.shared.observe { [weak self] in
      self?.render()
    }
    sessionObservation = AfilmorySessionStore.shared.observe { [weak self] state in
      DispatchQueue.main.async {
        self?.handleSession(state)
      }
    }
    AfilmorySessionStore.shared.bootstrap()
  }

  private func configureMap() {
    mapView.onNativeClearFilters = {
      PhotoFilterStore.shared.clear()
    }
    mapView.onNativeRetry = { [weak self] in
      guard let slug = self?.gallerySlug else { return }
      PhotoFeedStore.shared.load(.manifest(slug), force: true)
    }
    mapView.onNativeSignIn = { [weak self] in
      self?.onRequestSignIn()
    }
    mapView.onNativePhotoPress = { [weak self] id, index in
      self?.presentPhoto(id: id, index: index)
    }
  }

  private func handleSession(_ state: AfilmorySessionState) {
    switch state {
    case .loading:
      apply(photos: [], state: .loading)
    case .signedOut, .failed:
      gallerySlug = nil
      feedObservation?.cancel()
      feedObservation = nil
      feed = nil
      PhotoFilterStore.shared.deactivateGallery()
      apply(photos: [], state: .signedOut)
    case .signedIn(let session):
      guard let workspace = session.activeWorkspace, workspace.status == "active" else {
        gallerySlug = nil
        feedObservation?.cancel()
        feedObservation = nil
        feed = nil
        PhotoFilterStore.shared.deactivateGallery()
        apply(photos: [], state: .pending)
        return
      }
      if gallerySlug != workspace.slug {
        PhotoFilterStore.shared.activateGallery(workspace.slug)
        gallerySlug = workspace.slug
        ApiEnvironmentStore.shared.activateTenant(slug: workspace.slug)
        let feed = PhotoFeedStore.shared.feed(for: .manifest(workspace.slug))
        self.feed = feed
        feedObservation?.cancel()
        feedObservation = feed.observe { [weak self] in self?.render() }
        PhotoFeedStore.shared.load(.manifest(workspace.slug))
      }
      render()
    }
  }

  private func render() {
    guard let feed else { return }
    if feed.loadState == .loading, feed.photos.isEmpty {
      apply(photos: [], state: .loading)
      return
    }
    if feed.loadState == .failed, feed.photos.isEmpty {
      apply(photos: [], state: .error)
      return
    }
    displayedPhotos = PhotoFilterEngine.apply(PhotoFilterStore.shared.filters, to: feed.photos)
    let mapPhotos = Self.mapPhotos(
      displayedPhotos,
      localization: localization
    )
    let state: PhotoMapScreenState
    if mapPhotos.isEmpty {
      state = PhotoFilterEngine.hasActiveFilters(PhotoFilterStore.shared.filters)
        ? .filteredEmpty
        : .empty
    } else {
      state = .ready
    }
    apply(photos: mapPhotos, state: state)
  }

  private func apply(photos: [MapPhoto], state: PhotoMapScreenState) {
    mapView.setPhotos(photos)
    mapView.setState(state)
    mapView.setStrings(strings(locationCount: photos.count))
  }

  private func presentPhoto(id: String, index: Int) {
    guard displayedPhotos.indices.contains(index), displayedPhotos[index].id == id else { return }
    let controller = PhotoDetailViewController(
      photos: displayedPhotos,
      initialIndex: index,
      gallerySlug: gallerySlug,
      localization: localization,
      onRequestSignIn: onRequestSignIn,
      sourceProvider: { [weak mapView] photoId in
        mapView?.transitionSourceView(for: photoId)
      }
    )
    present(controller, animated: true)
  }

  private func strings(locationCount: Int) -> PhotoMapStrings {
    PhotoMapStrings(
      clearFilters: localization.value("common.clearFilters"),
      clearSelection: localization.value("map.clearSelection"),
      clusterAccessibilityLabel: localization.value("map.cluster.accessibility"),
      emptyDescription: localization.value("map.empty.description"),
      emptyTitle: localization.value("map.empty.title"),
      errorDescription: localization.value("map.failed.description"),
      errorTitle: localization.value("map.failed.title"),
      fitAll: localization.value("map.fit"),
      filteredEmptyDescription: localization.value("map.filteredEmpty.description"),
      filteredEmptyTitle: localization.value("gallery.empty.filtered"),
      loading: localization.value("map.loading"),
      locations: localization.value("map.locations", count: locationCount),
      pendingDescription: localization.value("gallery.workspace.pending.subtitle"),
      pendingTitle: localization.value("gallery.workspace.pending.title"),
      previewDefaultDetail: localization.value("map.preview.defaultDetail"),
      retry: localization.value("common.retry"),
      signIn: localization.value("common.signIn"),
      signedOutDescription: localization.value("map.signedOut.description"),
      signedOutTitle: localization.value("map.signedOut.title"),
      title: localization.value("map.title")
    )
  }

  private static func mapPhotos(
    _ photos: [GalleryPhoto],
    localization: Localization
  ) -> [MapPhoto] {
    photos.enumerated().compactMap { index, photo in
      guard let location = location(photo) else { return nil }
      let title = photo.title.isEmpty ? photo.id : photo.title
      var item = MapPhoto()
      item.accessibilityLabel = localization.value(
        "map.marker.accessibility",
        arguments: ["title": title]
      )
      item.id = photo.id
      item.index = index
      item.latitude = location.latitude
      item.longitude = location.longitude
      item.openAccessibilityLabel = localization.value(
        "map.openPhoto",
        arguments: ["title": title]
      )
      item.subtitle = subtitle(photo, localeIdentifier: localization.language.localeIdentifier)
      item.thumbnailUrl = photo.thumbnailUrl
      item.title = title
      return item
    }
  }

  private static func location(_ photo: GalleryPhoto) -> (latitude: Double, longitude: Double)? {
    let latitude = coordinate(
      photo.exif?["GPSLatitude"] ?? photo.location?.latitude.map(JSONValue.number),
      reference: photo.exif?["GPSLatitudeRef"]?.string,
      limit: 90
    )
    let longitude = coordinate(
      photo.exif?["GPSLongitude"] ?? photo.location?.longitude.map(JSONValue.number),
      reference: photo.exif?["GPSLongitudeRef"]?.string,
      limit: 180
    )
    guard let latitude, let longitude else { return nil }
    return (latitude, longitude)
  }

  private static func coordinate(
    _ value: JSONValue?,
    reference: String?,
    limit: Double
  ) -> Double? {
    let number: Double?
    switch value {
    case .number(let value):
      number = value
    case .string(let value):
      number = Double(value.trimmingCharacters(in: .whitespacesAndNewlines))
    default:
      number = nil
    }
    guard let number, number.isFinite, abs(number) <= limit else { return nil }
    let direction = reference?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    if ["S", "SOUTH", "W", "WEST"].contains(direction), number > 0 {
      return -number
    }
    return number
  }

  private static func subtitle(_ photo: GalleryPhoto, localeIdentifier: String) -> String {
    var parts = [photo.city, photo.camera].compactMap { $0?.isEmpty == false ? $0 : nil }
    if let value = photo.dateTaken, let date = PhotoDateParser.date(value) {
      let formatter = DateFormatter()
      formatter.locale = Locale(identifier: localeIdentifier)
      formatter.dateStyle = .medium
      formatter.timeStyle = .none
      parts.append(formatter.string(from: date))
    }
    return parts.joined(separator: " · ")
  }
}
