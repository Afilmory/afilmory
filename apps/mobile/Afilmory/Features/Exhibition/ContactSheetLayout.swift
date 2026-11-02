import CoreGraphics
import Foundation

struct ContactSheetFrame: Equatable, Sendable {
  let photoID: String
  let number: Int
  let width: CGFloat
}

struct ContactSheetGroup: Equatable, Sendable {
  static let undatedKey = "undated"

  let key: String
  let title: String
  let year: Int?
  let level: ContactSheetLevel
  let frames: [ContactSheetFrame]

  var showsYearDividers: Bool { level == .day || level == .month }

  var stripWidth: CGFloat {
    let widths = frames.map(\.width).reduce(0, +)
    let gaps = ContactSheetLayout.frameGap * CGFloat(max(0, frames.count - 1))
    return widths + gaps + ContactSheetLayout.stripPadding * 2
  }
}

enum ContactSheetBlock: Equatable, Sendable {
  case year(Int)
  case row([ContactSheetGroup])

  var dividerYear: Int? {
    if case .year(let year) = self { return year }
    return nil
  }

  var groups: [ContactSheetGroup]? {
    if case .row(let groups) = self { return groups }
    return nil
  }

  func height(level: ContactSheetLevel) -> CGFloat {
    switch self {
    case .year: ContactSheetLayout.yearHeight
    case .row: ContactSheetLayout.rowHeight(for: level)
    }
  }
}

struct ContactSheetPlacement: Equatable, Sendable {
  static let spanning = -1

  let block: ContactSheetBlock
  let lane: Int
}

enum ContactSheetLayout {
  static let frameGap: CGFloat = 3
  static let stripPadding: CGFloat = 5
  static let groupGap: CGFloat = 10
  static let blockSpacing: CGFloat = 14
  static let yearHeight: CGFloat = 28
  static let groupLabelHeight: CGFloat = 13
  static let labelGap: CGFloat = 6
  static let frameNumberHeight: CGFloat = 11

  static func frameHeight(for level: ContactSheetLevel) -> CGFloat {
    switch level {
    case .day: 72
    case .month: 56
    case .year: 40
    case .infinity: 0
    }
  }

  static func rowHeight(for level: ContactSheetLevel) -> CGFloat {
    groupLabelHeight + labelGap + frameNumberHeight * 2 + frameHeight(for: level)
  }

  static func groups(
    photos: [GalleryPhoto],
    level: ContactSheetLevel,
    numbers: [String: Int]? = nil
  ) -> [ContactSheetGroup] {
    guard level != .infinity else { return [] }
    let height = frameHeight(for: level)
    var order: [String] = []
    var buckets: [String: (title: String, year: Int?, frames: [ContactSheetFrame])] = [:]
    for (position, photo) in photos.enumerated() {
      let stamp = ExhibitFormat.localDateTime(for: photo)
      let identity: (key: String, title: String) = stamp.map { key(for: $0, level: level) } ?? (ContactSheetGroup.undatedKey, "")
      let frame = ContactSheetFrame(
        photoID: photo.id,
        number: numbers?[photo.id] ?? position + 1,
        width: max(12, (height * CGFloat(photo.aspectRatio)).rounded())
      )
      if buckets[identity.key] == nil {
        order.append(identity.key)
        buckets[identity.key] = (identity.title, stamp?.year, [])
      }
      buckets[identity.key]?.frames.append(frame)
    }
    let dated = order.filter { $0 != ContactSheetGroup.undatedKey }
    let sortedKeys = dated + order.filter { $0 == ContactSheetGroup.undatedKey }
    return sortedKeys.compactMap { key in
      buckets[key].map { ContactSheetGroup(key: key, title: $0.title, year: $0.year, level: level, frames: $0.frames) }
    }
  }

  static func pack(groups: [ContactSheetGroup], laneWidths: [CGFloat]) -> [ContactSheetPlacement] {
    guard laneWidths.count > 1 else {
      return pack(groups: groups, width: laneWidths.first ?? 0).map {
        ContactSheetPlacement(block: $0, lane: $0.dividerYear == nil ? 0 : ContactSheetPlacement.spanning)
      }
    }
    let showsYears = groups.first?.showsYearDividers ?? false
    var placements: [ContactSheetPlacement] = []
    var row: [ContactSheetGroup] = []
    var rowWidth: CGFloat = 0
    var lane = 0
    var lastYear: Int?
    func flush() {
      guard !row.isEmpty else { return }
      placements.append(ContactSheetPlacement(block: .row(row), lane: lane))
      row = []
      rowWidth = 0
      lane = (lane + 1) % laneWidths.count
    }
    for group in groups {
      if showsYears, let year = group.year, year != lastYear {
        flush()
        placements.append(ContactSheetPlacement(block: .year(year), lane: ContactSheetPlacement.spanning))
        lane = 0
        lastYear = year
      }
      let stripWidth = group.stripWidth
      if !row.isEmpty, rowWidth + groupGap + stripWidth <= laneWidths[lane] {
        row.append(group)
        rowWidth += groupGap + stripWidth
      } else {
        flush()
        row = [group]
        rowWidth = stripWidth
      }
    }
    flush()
    return placements
  }

  static func pack(groups: [ContactSheetGroup], width: CGFloat) -> [ContactSheetBlock] {
    let showsYears = groups.first?.showsYearDividers ?? false
    var blocks: [ContactSheetBlock] = []
    var row: [ContactSheetGroup] = []
    var rowWidth: CGFloat = 0
    var lastYear: Int?
    func flush() {
      guard !row.isEmpty else { return }
      blocks.append(.row(row))
      row = []
      rowWidth = 0
    }
    for group in groups {
      if showsYears, let year = group.year, year != lastYear {
        flush()
        blocks.append(.year(year))
        lastYear = year
      }
      let stripWidth = group.stripWidth
      if !row.isEmpty, rowWidth + groupGap + stripWidth <= width {
        row.append(group)
        rowWidth += groupGap + stripWidth
      } else {
        flush()
        row = [group]
        rowWidth = stripWidth
      }
    }
    flush()
    return blocks
  }

  private static func key(for stamp: ExhibitFormat.LocalDateTime, level: ContactSheetLevel) -> (key: String, title: String) {
    switch level {
    case .day, .infinity:
      (stamp.date, stamp.day)
    case .month:
      (String(format: "%04d.%02d", stamp.year, stamp.month), String(format: "%04d.%02d", stamp.year, stamp.month))
    case .year:
      (String(stamp.year), String(stamp.year))
    }
  }
}
