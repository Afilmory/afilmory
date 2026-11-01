import Foundation

enum ExhibitionOpener {
  typealias RandomIndex = @Sendable (Int) -> Int

  static let systemRandom: RandomIndex = { Int.random(in: 0..<max(1, $0)) }

  static func pool(photos: [GalleryPhoto], filters: PhotoFilters) -> [GalleryPhoto] {
    PhotoFilterEngine.hasActiveFilters(filters) ? PhotoFilterEngine.apply(filters, to: photos) : photos
  }

  static func pick(
    from pool: [GalleryPhoto],
    excluding currentID: String?,
    randomIndex: RandomIndex = systemRandom
  ) -> GalleryPhoto? {
    let candidates = pool.count > 1 ? pool.filter { $0.id != currentID } : pool
    guard !candidates.isEmpty else { return nil }
    let index = randomIndex(candidates.count)
    return candidates[min(max(index, 0), candidates.count - 1)]
  }

  static func resolve(
    currentID: String?,
    pool: [GalleryPhoto],
    randomIndex: RandomIndex = systemRandom
  ) -> GalleryPhoto? {
    if let currentID, let current = pool.first(where: { $0.id == currentID }) {
      return current
    }
    return pick(from: pool, excluding: nil, randomIndex: randomIndex)
  }

  static func latest(in photos: [GalleryPhoto]) -> GalleryPhoto? {
    ExhibitionLibrary.chronological(photos).first
  }
}

enum ExhibitionLibrary {
  static func chronological(_ photos: [GalleryPhoto]) -> [GalleryPhoto] {
    let keyed = photos.enumerated().map { offset, photo in
      (offset: offset, photo: photo, key: sortKey(photo))
    }
    return keyed.sorted { lhs, rhs in
      switch (lhs.key, rhs.key) {
      case let (left?, right?) where left != right: return left > right
      case (.some, nil): return true
      case (nil, .some): return false
      default: return lhs.offset < rhs.offset
      }
    }.map(\.photo)
  }

  static func numbering(_ chronological: [GalleryPhoto]) -> [String: Int] {
    Dictionary(chronological.enumerated().map { ($1.id, $0 + 1) }, uniquingKeysWith: { first, _ in first })
  }

  private static func sortKey(_ photo: GalleryPhoto) -> String? {
    guard let stamp = ExhibitFormat.localDateTime(for: photo) else { return nil }
    return String(format: "%04d%02d%02d%02d%02d", stamp.year, stamp.month, stamp.dayOfMonth, stamp.hour, stamp.minute)
      + (photo.dateTaken ?? "")
  }
}
