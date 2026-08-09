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
  var options: PhotoFilterOptionsRecord = .init()
}

struct ProfileStripItemRecord {
  var url: String = ""
  var thumbHash: String?
  var aspectRatio: Double = 1
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
}

struct UploadReviewItemRecord {
  var id: String = ""
  var isLivePhoto: Bool = false
}

struct UploadReviewSheetRecord {
  var items: [UploadReviewItemRecord] = []
  var initialTags: [String] = []
  var suggestedTags: [String] = []
}
