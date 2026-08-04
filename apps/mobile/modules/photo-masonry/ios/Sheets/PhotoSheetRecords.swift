import ExpoModulesCore
import CoreGraphics
import Foundation

struct PresentationAnchorRecord: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 0
  @Field var height: Double = 0

  var rect: CGRect {
    CGRect(x: x, y: y, width: width, height: height)
  }
}

struct PhotoInfoRowRecord: Record, Identifiable {
  @Field var id: String = ""
  @Field var label: String = ""
  @Field var value: String = ""
}

struct PhotoInfoSectionRecord: Record, Identifiable {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var summary: String?
  @Field var rows: [PhotoInfoRowRecord] = []
}

struct PhotoInfoGearRecord: Record {
  @Field var model: String = ""
  @Field var formatBadge: String?
  @Field var styleBadge: String?
  @Field var lens: String?
  @Field var rating: Int = 0
  @Field var specs: [String] = []
  @Field var tone: String?
  @Field var exposure: [String] = []
}

struct PhotoMapLocationRecord: Record {
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0
}

struct PhotoInfoLocalizationRecord: Record {
  @Field var done: String = ""
  @Field var histogram: String = ""
  @Field var histogramAccessibilityLabel: String = ""
  @Field var histogramFailure: String = ""
  @Field var mapAccessibilityLabel: String = ""
  @Field var ratingLabel: String = ""
  @Field var tags: String = ""
  @Field var title: String = ""
}

struct PhotoInfoSheetRecord: Record {
  @Field var gear: PhotoInfoGearRecord = .init()
  @Field var description: String?
  @Field var histogramUrl: String?
  @Field var sections: [PhotoInfoSectionRecord] = []
  @Field var tags: [String] = []
  @Field var place: String?
  @Field var mapLocation: PhotoMapLocationRecord?
  @Field var emptyMessage: String?
  @Field var localization: PhotoInfoLocalizationRecord = .init()
}

extension PhotoInfoSheetRecord {
  static func decode(json: String, appContext: AppContext) -> PhotoInfoSheetRecord? {
    guard let data = json.data(using: .utf8),
          let jsonObject = try? JSONSerialization.jsonObject(with: data),
          let dictionary = normalizeJSONValue(jsonObject) as? [String: Any]
    else { return nil }

    return try? PhotoInfoSheetRecord(from: dictionary, appContext: appContext)
  }

  private static func normalizeJSONValue(_ value: Any) -> Any? {
    if value is NSNull {
      return nil
    }
    if let dictionary = value as? [String: Any] {
      return dictionary.reduce(into: [String: Any]()) { result, element in
        if let normalized = normalizeJSONValue(element.value) {
          result[element.key] = normalized
        }
      }
    }
    if let array = value as? [Any] {
      return array.compactMap(normalizeJSONValue)
    }
    return value
  }
}

struct PhotoFilterDatePresetRecord: Record, Identifiable {
  @Field var label: String = ""
  @Field var value: String = ""

  var id: String { value }
}

struct PhotoFilterLocalizationRecord: Record {
  @Field var all: String = ""
  @Field var any: String = ""
  @Field var anyDate: String = ""
  @Field var anyRating: String = ""
  @Field var camera: String = ""
  @Field var cancel: String = ""
  @Field var customRange: String = ""
  @Field var date: String = ""
  @Field var datePresets: [PhotoFilterDatePresetRecord] = []
  @Field var done: String = ""
  @Field var from: String = ""
  @Field var lens: String = ""
  @Field var match: String = ""
  @Field var minimumRating: String = ""
  @Field var notSelected: String = ""
  @Field var range: String = ""
  @Field var rating: String = ""
  @Field var ratingOptions: [String] = []
  @Field var reset: String = ""
  @Field var selected: String = ""
  @Field var tags: String = ""
  @Field var title: String = ""
  @Field var to: String = ""
}

struct PhotoFilterOptionRecord: Record, Identifiable {
  @Field var value: String = ""
  @Field var count: Int = 0

  var id: String { value }
}

struct PhotoFilterOptionsRecord: Record {
  @Field var tags: [PhotoFilterOptionRecord] = []
  @Field var cameras: [PhotoFilterOptionRecord] = []
  @Field var lenses: [PhotoFilterOptionRecord] = []
  @Field var ratedCount: Int = 0
}

struct PhotoFiltersRecord: Record {
  @Field var tags: [String] = []
  @Field var tagMode: String = "any"
  @Field var datePreset: String?
  @Field var dateFrom: String?
  @Field var dateTo: String?
  @Field var cameras: [String] = []
  @Field var lenses: [String] = []
  @Field var minRating: Int?
}

struct PhotoFilterSheetRequest: Record {
  @Field var anchor: PresentationAnchorRecord?
  @Field var filters: PhotoFiltersRecord = .init()
  @Field var localization: PhotoFilterLocalizationRecord = .init()
  @Field var options: PhotoFilterOptionsRecord = .init()
}

struct ProfileStripItemRecord: Record {
  @Field var url: String = ""
  @Field var thumbHash: String?
  @Field var aspectRatio: Double = 1
}

struct ProfileLocalizationRecord: Record {
  @Field var accountSettings: String = ""
  @Field var cacheCleared: String = ""
  @Field var cancel: String = ""
  @Field var clearCache: String = ""
  @Field var done: String = ""
  @Field var deleteAccount: String = ""
  @Field var openWeb: String = ""
  @Field var signOut: String = ""
  @Field var signOutConfirmTitle: String = ""
  @Field var sponsorDescription: String = ""
  @Field var sponsorFailedMessage: String = ""
  @Field var sponsorFailedTitle: String = ""
  @Field var sponsorPending: String = ""
  @Field var sponsorThanks: String = ""
  @Field var sponsorTitle: String = ""
  @Field var sponsorUnavailable: String = ""
}

struct ProfileSheetRecord: Record {
  @Field var anchor: PresentationAnchorRecord?
  @Field var userName: String = ""
  @Field var avatarUrl: String = ""
  @Field var avatarInitial: String = ""
  @Field var tenantLine: String = ""
  @Field var webUrl: String = ""
  @Field var statsLine: String = ""
  @Field var strip: [ProfileStripItemRecord] = []
  @Field var localization: ProfileLocalizationRecord = .init()
}

struct UploadReviewItemRecord: Record {
  @Field var id: String = ""
  @Field var isLivePhoto: Bool = false
}

struct UploadReviewLocalizationRecord: Record {
  @Field var addMore: String = ""
  @Field var cancel: String = ""
  @Field var remove: String = ""
  @Field var startOne: String = ""
  @Field var startOther: String = ""
  @Field var summaryOne: String = ""
  @Field var summaryOther: String = ""
  @Field var tagsLabel: String = ""
  @Field var tagsPlaceholder: String = ""
  @Field var title: String = ""

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

struct UploadReviewSheetRecord: Record {
  @Field var items: [UploadReviewItemRecord] = []
  @Field var initialTags: [String] = []
  @Field var suggestedTags: [String] = []
  @Field var localization: UploadReviewLocalizationRecord = .init()
}
