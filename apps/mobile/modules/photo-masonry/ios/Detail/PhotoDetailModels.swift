import Foundation

struct PhotoDetailMetadata: Sendable {
  let id: String
  let title: String
  let subtitle: String
  let info: PhotoInfoSheetModel
}

struct PhotoDetailStrings {
  var close = ""
  var comments = ""
  var info = ""
  var next = ""
  var previous = ""
  var reaction = ""
  var share = ""
}

struct PhotoDetailReactionItem {
  let accessibilityLabel: String
  let count: Int
  let reaction: String
}
