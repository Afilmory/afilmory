struct MasonryPhoto {
  var accessibilityLabel: String = ""
  var id: String = ""
  var url: String = ""
  var originalUrl: String = ""
  var thumbHash: String?
  var aspectRatio: Double = 1
  var width: Double = 0
  var height: Double = 0
  var livePhotoVideoUrl: String?

  var hasLivePhoto: Bool {
    guard let livePhotoVideoUrl else { return false }
    return !livePhotoVideoUrl.isEmpty
  }
}

extension MasonryPhoto {
  init(photo: GalleryPhoto) {
    self.init()
    accessibilityLabel = String(localized: "Photo \(photo.title.isEmpty ? photo.id : photo.title)")
    id = photo.id
    url = photo.thumbnailUrl
    originalUrl = photo.originalUrl
    thumbHash = photo.thumbHash
    aspectRatio = photo.aspectRatio
    width = photo.width
    height = photo.height
    livePhotoVideoUrl = photo.video?.livePhotoVideoURL
  }
}
