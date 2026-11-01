import Foundation

struct FeaturedGalleryAuthor: Codable, Hashable, Sendable {
  let name: String
  let avatar: String?
}

struct FeaturedGallery: Codable, Hashable, Sendable {
  let id: String
  let name: String
  let slug: String
  let domain: String?
  let description: String?
  let author: FeaturedGalleryAuthor?
  let photoCount: Int
  var isSubscribed: Bool
  var isOwnGallery: Bool
  let tags: [String]
  let createdAt: String
  let lastUpload: String?
}

struct GalleryCoverPhoto: Hashable, Sendable {
  let id: String
  let thumbnailUrl: String
  let thumbHash: String?
  let aspectRatio: Double
  let isLivePhoto: Bool
}

struct FeaturedGalleriesEnvelope: Codable, Sendable {
  let galleries: [FeaturedGallery]
}
