import Foundation

struct ViewingRollChapter: Hashable, Sendable {
  let day: String
  let monthDay: String
  let year: String
  let rolls: [GalleryTimelineEvent]
}

struct ViewingGalleryCard: Hashable, Sendable {
  let id: String
  let slug: String
  let name: String
  let authorName: String?
  let avatarURL: String?
  let photoCount: Int
  let lastUpload: String?
  let domain: String?
  let isSubscribed: Bool
  let isOwn: Bool
  let covers: [GalleryCoverPhoto]?

  var header: GalleryHeaderModel {
    GalleryHeaderModel(
      tenantId: id,
      name: name,
      slug: slug,
      authorName: authorName,
      authorAvatar: avatarURL,
      photoCount: photoCount,
      lastUpload: lastUpload,
      domain: domain
    )
  }
}

extension GalleryCoverPhoto {
  init(preview: GalleryPhotoPreview) {
    self.init(
      id: preview.id,
      thumbnailUrl: preview.thumbnailUrl,
      thumbHash: preview.thumbHash,
      aspectRatio: preview.aspectRatio > 0 ? preview.aspectRatio : preview.width / max(preview.height, 1),
      isLivePhoto: preview.isLivePhoto
    )
  }

  init(photo: GalleryPhoto) {
    self.init(
      id: photo.id,
      thumbnailUrl: photo.thumbnailUrl,
      thumbHash: photo.thumbHash,
      aspectRatio: photo.aspectRatio,
      isLivePhoto: photo.video?.livePhotoVideoURL != nil
    )
  }
}

enum ViewingContent {
  static let galleryCoverLimit = 5

  static func chapters(from events: [GalleryTimelineEvent]) -> [ViewingRollChapter] {
    let grouped = Dictionary(grouping: events, by: \.day)
    return grouped.keys.sorted(by: >).map { day in
      let rolls = (grouped[day] ?? []).sorted { $0.latestAt > $1.latestAt }
      let parts = day.split(separator: "-")
      guard parts.count == 3, parts[0].count == 4 else {
        return ViewingRollChapter(day: day, monthDay: day, year: "", rolls: rolls)
      }
      return ViewingRollChapter(day: day, monthDay: "\(parts[1]).\(parts[2])", year: String(parts[0]), rolls: rolls)
    }
  }

  static func timeOfDay(latestAt: String, timeZone: TimeZone = .current) -> ExhibitFormat.TimeOfDay? {
    guard let date = parse(latestAt) else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    return ExhibitFormat.timeOfDay(hour: calendar.component(.hour, from: date))
  }

  static func latestDate(_ timestamp: String?, timeZone: TimeZone = .current) -> String? {
    guard let timestamp, let date = parse(timestamp) else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    guard let year = parts.year, let month = parts.month, let day = parts.day else { return nil }
    return String(format: "%04d.%02d.%02d", year, month, day)
  }

  static func rollMeta(_ event: GalleryTimelineEvent) -> String {
    let frames = max(event.totalCount, event.photos.count)
    let developed = String(localized: "Developed \(frames) frames")
    guard let time = timeOfDay(latestAt: event.latestAt) else { return developed }
    return "\(developed) · \(time.localizedName)"
  }

  static func galleryMeta(_ card: ViewingGalleryCard) -> String {
    let frames = String(localized: "\(card.photoCount) frames")
    guard let date = latestDate(card.lastUpload) else { return frames }
    return "\(frames) · \(String(localized: "latest \(date)"))"
  }

  static func matches(_ header: GalleryHeaderModel, query: String) -> Bool {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !needle.isEmpty else { return true }
    return [header.name, header.slug, header.authorName ?? ""].contains {
      $0.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) != nil
    }
  }

  static func galleryCards(
    subscriptions: [GallerySubscriptionItem],
    directory: [FeaturedGallery],
    query: String
  ) -> (following: [ViewingGalleryCard], discover: [ViewingGalleryCard]) {
    let followed = Set(subscriptions.map(\.tenantId))
    let following = subscriptions.map(card(subscription:)).filter { matches($0.header, query: query) }
    let discover = directory
      .filter { !followed.contains($0.id) && !$0.isOwnGallery }
      .map { card(featured: $0) }
      .filter { matches($0.header, query: query) }
    return (following, discover)
  }

  private static func card(subscription: GallerySubscriptionItem) -> ViewingGalleryCard {
    let gallery = subscription.gallery
    return ViewingGalleryCard(
      id: subscription.tenantId,
      slug: gallery.slug,
      name: gallery.name,
      authorName: gallery.author?.name.trimmingToNil,
      avatarURL: gallery.author?.avatar?.trimmingToNil,
      photoCount: gallery.photoCount,
      lastUpload: gallery.lastUpload.trimmingToNil,
      domain: gallery.domain?.trimmingToNil,
      isSubscribed: true,
      isOwn: false,
      covers: subscription.recentPhotos.isEmpty
        ? nil
        : subscription.recentPhotos.prefix(galleryCoverLimit).map(GalleryCoverPhoto.init(preview:))
    )
  }

  private static func card(featured: FeaturedGallery) -> ViewingGalleryCard {
    ViewingGalleryCard(
      id: featured.id,
      slug: featured.slug,
      name: featured.name,
      authorName: featured.author?.name.trimmingToNil,
      avatarURL: featured.author?.avatar?.trimmingToNil,
      photoCount: featured.photoCount,
      lastUpload: featured.lastUpload?.trimmingToNil,
      domain: featured.domain?.trimmingToNil,
      isSubscribed: false,
      isOwn: featured.isOwnGallery,
      covers: nil
    )
  }

  private static func parse(_ timestamp: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: timestamp) { return date }
    return ISO8601DateFormatter().date(from: timestamp)
  }
}
