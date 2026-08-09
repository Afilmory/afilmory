import CoreGraphics
import Foundation

struct PresentationAnchorRecord {
  var x: Double = 0
  var y: Double = 0
  var width: Double = 0
  var height: Double = 0

  var rect: CGRect {
    CGRect(x: x, y: y, width: width, height: height)
  }
}

struct PhotoInfoLocalizationRecord: Decodable {
  let done: String
  let histogram: String
  let histogramAccessibilityLabel: String
  let histogramFailure: String
  let mapAccessibilityLabel: String
  let ratingLabel: String
  let tags: String
  let title: String

  init() {
    done = ""
    histogram = ""
    histogramAccessibilityLabel = ""
    histogramFailure = ""
    mapAccessibilityLabel = ""
    ratingLabel = ""
    tags = ""
    title = ""
  }
}

struct PhotoInfoSheetRecord: Decodable {
  let gear: PhotoInfoGear
  let description: String?
  let histogramUrl: String?
  let sections: [PhotoInfoSection]
  let tags: [String]
  let place: String?
  let mapLocation: PhotoInfoMapLocation?
  let emptyMessage: String?
  let localization: PhotoInfoLocalizationRecord

  init() {
    gear = PhotoInfoGear(
      model: "",
      formatBadge: nil,
      styleBadge: nil,
      lens: nil,
      rating: 0,
      specs: [],
      tone: nil,
      exposure: []
    )
    description = nil
    histogramUrl = nil
    sections = []
    tags = []
    place = nil
    mapLocation = nil
    emptyMessage = nil
    localization = PhotoInfoLocalizationRecord()
  }
}

extension PhotoInfoSheetRecord {
  static func decode(json: String) -> PhotoInfoSheetRecord? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(PhotoInfoSheetRecord.self, from: data)
  }
}

struct PhotoFilterDatePresetRecord: Identifiable {
  var label: String = ""
  var value: String = ""

  var id: String { value }
}

struct PhotoFilterLocalizationRecord {
  var all: String = ""
  var any: String = ""
  var anyDate: String = ""
  var anyRating: String = ""
  var camera: String = ""
  var cancel: String = ""
  var customRange: String = ""
  var date: String = ""
  var datePresets: [PhotoFilterDatePresetRecord] = []
  var done: String = ""
  var from: String = ""
  var lens: String = ""
  var match: String = ""
  var minimumRating: String = ""
  var notSelected: String = ""
  var range: String = ""
  var rating: String = ""
  var ratingOptions: [String] = []
  var reset: String = ""
  var search: String = ""
  var searchPlaceholder: String = ""
  var selected: String = ""
  var tags: String = ""
  var title: String = ""
  var to: String = ""
}

struct PhotoFilterOptionRecord: Identifiable {
  var value: String = ""
  var count: Int = 0

  var id: String { value }
}

struct PhotoFilterOptionsRecord {
  var tags: [PhotoFilterOptionRecord] = []
  var cameras: [PhotoFilterOptionRecord] = []
  var lenses: [PhotoFilterOptionRecord] = []
  var ratedCount: Int = 0
}

struct PhotoFiltersRecord {
  var query: String = ""
  var tags: [String] = []
  var tagMode: String = "any"
  var datePreset: String?
  var dateFrom: String?
  var dateTo: String?
  var cameras: [String] = []
  var lenses: [String] = []
  var minRating: Int?
}

struct PhotoFilterSheetRequest {
  var anchor: PresentationAnchorRecord?
  var filters: PhotoFiltersRecord = .init()
  var localization: PhotoFilterLocalizationRecord = .init()
  var options: PhotoFilterOptionsRecord = .init()
}

struct ProfileStripItemRecord {
  var url: String = ""
  var thumbHash: String?
  var aspectRatio: Double = 1
}

struct ProfileLocalizationRecord {
  var accountSettings: String = ""
  var cacheCleared: String = ""
  var cancel: String = ""
  var clearCache: String = ""
  var done: String = ""
  var deleteAccount: String = ""
  var openWeb: String = ""
  var signOut: String = ""
  var signOutConfirmTitle: String = ""
  var sponsorDescription: String = ""
  var sponsorFailedMessage: String = ""
  var sponsorFailedTitle: String = ""
  var sponsorPending: String = ""
  var sponsorThanks: String = ""
  var sponsorTitle: String = ""
  var sponsorUnavailable: String = ""
}

struct ProfileSheetRecord {
  var anchor: PresentationAnchorRecord?
  var userName: String = ""
  var avatarUrl: String = ""
  var avatarInitial: String = ""
  var tenantLine: String = ""
  var webUrl: String = ""
  var statsLine: String = ""
  var strip: [ProfileStripItemRecord] = []
  var localization: ProfileLocalizationRecord = .init()
}

struct UploadReviewItemRecord {
  var id: String = ""
  var isLivePhoto: Bool = false
}

struct UploadReviewLocalizationRecord {
  var addMore: String = ""
  var cancel: String = ""
  var remove: String = ""
  var startOne: String = ""
  var startOther: String = ""
  var summaryOne: String = ""
  var summaryOther: String = ""
  var tagsLabel: String = ""
  var tagsPlaceholder: String = ""
  var title: String = ""

  func start(count: Int) -> String {
    template(count == 1 ? startOne : startOther, count: count)
  }

  func summary(count: Int) -> String {
    template(count == 1 ? summaryOne : summaryOther, count: count)
  }

  // Item count changes as the user removes thumbnails, so JS hands over raw
  // {count} templates instead of pre-rendered strings.
  private func template(_ value: String, count: Int) -> String {
    value.replacingOccurrences(of: "{count}", with: String(count))
  }
}

struct UploadReviewSheetRecord {
  var items: [UploadReviewItemRecord] = []
  var initialTags: [String] = []
  var suggestedTags: [String] = []
  var localization: UploadReviewLocalizationRecord = .init()
}
