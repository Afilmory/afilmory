import CoreGraphics
import Foundation

struct ExhibitionContent {
  let all: [GalleryPhoto]
  let shown: [GalleryPhoto]
  let numbers: [String: Int]
  let filters: PhotoFilters
  let level: ContactSheetLevel
  let groups: [ContactSheetGroup]
  let blocks: [ContactSheetBlock]
  let placements: [ContactSheetPlacement]
  let map: ExhibitionMapModel

  init(all: [GalleryPhoto], filters: PhotoFilters, level requested: ContactSheetLevel, width: CGFloat) {
    self.init(all: all, filters: filters, level: requested, laneWidths: [width])
  }

  init(all: [GalleryPhoto], filters: PhotoFilters, level requested: ContactSheetLevel, laneWidths: [CGFloat]) {
    self.all = all
    self.filters = filters
    numbers = ExhibitionLibrary.numbering(all)
    shown = ExhibitionOpener.pool(photos: all, filters: filters)
    map = ExhibitionMapModel(photos: shown)
    level = requested == .infinity && !map.hasLocations ? .day : requested
    groups = ContactSheetLayout.groups(photos: shown, level: level, numbers: numbers)
    placements = ContactSheetLayout.pack(groups: groups, laneWidths: laneWidths)
    blocks = placements.map(\.block)
  }

  var isFiltered: Bool { PhotoFilterEngine.hasActiveFilters(filters) }

  var availableLevels: [ContactSheetLevel] {
    map.hasLocations ? ContactSheetLevel.allCases : [.day, .month, .year]
  }

  func number(of photoID: String) -> Int {
    numbers[photoID] ?? 0
  }

  func photo(_ id: String) -> GalleryPhoto? {
    shown.first { $0.id == id } ?? all.first { $0.id == id }
  }

  func blockIndex(containing photoID: String) -> Int? {
    blocks.firstIndex { block in
      block.groups?.contains { group in group.frames.contains { $0.photoID == photoID } } ?? false
    }
  }

  func caption() -> String {
    let frames = shown.count
    switch level {
    case .day:
      return String(localized: "\(frames) frames · \(groups.count) days · cut by capture day")
    case .month:
      return String(localized: "\(frames) frames · \(groups.count) months")
    case .year:
      return String(localized: "\(frames) frames · \(groups.count) years")
    case .infinity:
      return String(localized: "∞ · located photos laid out on the map")
    }
  }
}
