#if DEBUG
  import Foundation

  struct FixtureUser: Sendable {
    let id: String
    let name: String
    let avatarFile: String?

    var avatarURL: String? {
      avatarFile.map { FixtureMode.mediaURL($0).absoluteString }
    }
  }

  struct FixtureUpload: Sendable {
    let daysAgo: Double
    let photoIds: [String]
  }

  struct FixtureGallery: Sendable {
    let tenantId: String
    let slug: String
    let name: String
    let description: String
    let author: FixtureUser
    let tags: [String]
    let createdAt: String
    let photoIds: [String]
    let uploads: [FixtureUpload]

    var isOwn: Bool { slug == FixtureCatalog.ownSlug }

    func photoId(for key: String) -> String {
      isOwn ? key : "\(slug)-\(key.replacingOccurrences(of: "#", with: "-v"))"
    }
  }

  final class FixtureBundleMarker {}

  final class FixtureCatalog: @unchecked Sendable {
    static let shared = FixtureCatalog()
    static let ownSlug = "innei"
    static let ownTenantId = "tenant-innei"
    static let manifestVersion = "v10"

    let epoch = Date()
    let baseOrder: [String]
    let galleries: [FixtureGallery]
    let users: [String: FixtureUser]
    private let basePhotos: [String: [String: Any]]

    private init() {
      let photos = Self.loadManifestPhotos()
      basePhotos = Dictionary(uniqueKeysWithValues: photos.compactMap { photo in
        (photo["id"] as? String).map { ($0, Self.rewritingMedia(photo)) }
      })
      baseOrder = photos.compactMap { $0["id"] as? String }
      let people = Self.people
      users = Dictionary(uniqueKeysWithValues: people.map { ($0.id, $0) })
      galleries = Self.makeGalleries(baseOrder: baseOrder, people: users)
    }

    var owner: FixtureUser { users["user-innei"]! }

    var ownGallery: FixtureGallery { galleries.first { $0.isOwn }! }

    func gallery(slug: String) -> FixtureGallery? {
      galleries.first { $0.slug == slug }
    }

    func gallery(tenantId: String) -> FixtureGallery? {
      galleries.first { $0.tenantId == tenantId }
    }

    func basePhoto(_ id: String) -> [String: Any]? {
      basePhotos[id]
    }

    func photo(_ key: String, in gallery: FixtureGallery, tags: [String]? = nil) -> [String: Any]? {
      let baseId = key.split(separator: "#").first.map(String.init) ?? key
      guard var photo = basePhotos[baseId] else { return nil }
      photo["id"] = gallery.photoId(for: key)
      if let tags {
        photo["tags"] = tags
      }
      return photo
    }

    func uploadedAt(ownIndex index: Int) -> Date {
      let hours: [Double] = [2, 9, 26, 50]
      if index < hours.count {
        return FixtureClock.ago(hours: hours[index], from: epoch)
      }
      return FixtureClock.ago(days: Double(index - 3) * 10 + 0.5, from: epoch)
    }

    func uploadedAt(_ upload: FixtureUpload, position: Int) -> Date {
      FixtureClock.ago(days: upload.daysAgo, minutes: Double(position) * 7, from: epoch)
    }

    static func mediaFile(named name: String) -> URL? {
      let bundle = Bundle(for: FixtureBundleMarker.self)
      let base = (name as NSString).deletingPathExtension
      let ext = (name as NSString).pathExtension
      for subdirectory in [nil, "Media", "Fixtures/Media"] {
        if let url = bundle.url(forResource: base, withExtension: ext, subdirectory: subdirectory) {
          return url
        }
      }
      return nil
    }

    private static func loadManifestPhotos() -> [[String: Any]] {
      let bundle = Bundle(for: FixtureBundleMarker.self)
      let url = [nil, "Payloads", "Fixtures/Payloads"].lazy
        .compactMap { bundle.url(forResource: "photos-manifest", withExtension: "json", subdirectory: $0) }
        .first
      guard let url,
            let data = try? Data(contentsOf: url),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let photos = object["data"] as? [[String: Any]]
      else { return [] }
      return photos
    }

    private static func rewritingMedia(_ photo: [String: Any]) -> [String: Any] {
      var photo = photo
      let id = photo["id"] as? String ?? ""
      photo["thumbnailUrl"] = FixtureMode.mediaURL("thumb-\(id).jpg").absoluteString
      photo["originalUrl"] = FixtureMode.mediaURL("\(id).jpg").absoluteString
      if var video = photo["video"] as? [String: Any], video["videoUrl"] != nil {
        video["videoUrl"] = FixtureMode.mediaURL("\(id).mov").absoluteString
        photo["video"] = video
      }
      return photo
    }

    private static let people: [FixtureUser] = [
      FixtureUser(id: "user-innei", name: "Innei", avatarFile: "avatar-innei.jpg"),
      FixtureUser(id: "user-lin", name: "Lin Qiao", avatarFile: "avatar-birdline.jpg"),
      FixtureUser(id: "user-xia", name: "夏至", avatarFile: "avatar-mayflowers.jpg"),
      FixtureUser(id: "user-kai", name: "Kai", avatarFile: "avatar-nightwalker.jpg"),
      FixtureUser(id: "user-mori", name: "森 Mori", avatarFile: "avatar-shanyuren.jpg"),
      FixtureUser(id: "user-noah", name: "Noah Reed", avatarFile: "avatar-harbor.jpg"),
      FixtureUser(id: "user-yun", name: "云", avatarFile: "avatar-stilllife.jpg"),
    ]

    private static func makeGalleries(baseOrder: [String], people: [String: FixtureUser]) -> [FixtureGallery] {
      galleryDefinitions(baseOrder: baseOrder, people: people).map(withArchiveRolls)
    }

    private static func withArchiveRolls(_ gallery: FixtureGallery) -> FixtureGallery {
      guard !gallery.isOwn, !gallery.photoIds.isEmpty else { return gallery }
      let ids = gallery.photoIds
      let archive = (0..<6).map { roll in
        FixtureUpload(
          daysAgo: 13.5 + Double(roll) * 3,
          photoIds: (0..<(1 + roll % 2)).map { "\(ids[(roll * 2 + $0) % ids.count])#\(roll + 1)" }
        )
      }
      return FixtureGallery(
        tenantId: gallery.tenantId, slug: gallery.slug, name: gallery.name, description: gallery.description,
        author: gallery.author, tags: gallery.tags, createdAt: gallery.createdAt,
        photoIds: gallery.photoIds + archive.flatMap(\.photoIds), uploads: gallery.uploads + archive
      )
    }

    private static func galleryDefinitions(baseOrder: [String], people: [String: FixtureUser]) -> [FixtureGallery] {
      [
        FixtureGallery(
          tenantId: ownTenantId, slug: ownSlug, name: "Innei's Afilmory",
          description: "Birds, cities and the quiet hours in between.",
          author: people["user-innei"]!, tags: ["bird", "旅鸫", "fujifilm"],
          createdAt: "2024-01-12T08:00:00.000Z", photoIds: baseOrder, uploads: []
        ),
        FixtureGallery(
          tenantId: "tenant-birdline", slug: "birdline", name: "Birdline",
          description: "Field notes on songbirds, mostly before sunrise.",
          author: people["user-lin"]!, tags: ["bird", "wildlife", "nikon"],
          createdAt: "2025-03-02T06:10:00.000Z",
          photoIds: ["DSC_7132", "DSC_6447", "DSC_5710", "DSCF4632"],
          uploads: [
            FixtureUpload(daysAgo: 1.2, photoIds: ["DSC_7132", "DSC_6447", "DSC_5710"]),
            FixtureUpload(daysAgo: 4.4, photoIds: ["DSCF4632"]),
          ]
        ),
        FixtureGallery(
          tenantId: "tenant-mayflowers", slug: "mayflowers", name: "五月花事",
          description: "一座城市的五月，花开花落。",
          author: people["user-xia"]!, tags: ["花", "spring", "fujifilm"],
          createdAt: "2025-05-01T02:00:00.000Z",
          photoIds: ["DSCF2847", "DSCF2848", "DSCF2850", "DSCF2851", "DSCF2853", "DSCF0436"],
          uploads: [
            FixtureUpload(daysAgo: 2.3, photoIds: ["DSCF2847", "DSCF2848", "DSCF2850", "DSCF2851", "DSCF2853"]),
            FixtureUpload(daysAgo: 9.1, photoIds: ["DSCF0436"]),
          ]
        ),
        FixtureGallery(
          tenantId: "tenant-nightwalker", slug: "nightwalker", name: "夜行者",
          description: "City nights, neon and rain.",
          author: people["user-kai"]!, tags: ["night", "street", "iphone"],
          createdAt: "2024-11-20T14:30:00.000Z",
          photoIds: ["IMG_20251111_002156", "IMG_1401", "IMG_5484", "IMG_5469"],
          uploads: [
            FixtureUpload(daysAgo: 0.1, photoIds: ["IMG_20251111_002156", "IMG_1401", "IMG_5484"]),
            FixtureUpload(daysAgo: 6.2, photoIds: ["IMG_5469"]),
          ]
        ),
        FixtureGallery(
          tenantId: "tenant-shanyuren", slug: "shanyuren", name: "山与人",
          description: "山里的人，人眼里的山。",
          author: people["user-mori"]!, tags: ["mountain", "travel", "fujifilm"],
          createdAt: "2025-06-18T09:00:00.000Z",
          photoIds: ["DSCF0842", "DSCF0420", "DSCF0038", "IMG_0030"],
          uploads: [
            FixtureUpload(daysAgo: 3.5, photoIds: ["DSCF0842", "DSCF0420"]),
            FixtureUpload(daysAgo: 12, photoIds: ["DSCF0038", "IMG_0030"]),
          ]
        ),
        FixtureGallery(
          tenantId: "tenant-harbor", slug: "harbor", name: "Harbor Light",
          description: "Coastal towns and the light that finds them.",
          author: people["user-noah"]!, tags: ["coast", "sony", "travel"],
          createdAt: "2024-05-03T11:00:00.000Z",
          photoIds: ["IMG_0030", "DSCF0038", "DSCF2853"],
          uploads: [FixtureUpload(daysAgo: 5.3, photoIds: ["IMG_0030", "DSCF0038", "DSCF2853"])]
        ),
        FixtureGallery(
          tenantId: "tenant-stilllife", slug: "stilllife", name: "静物札记",
          description: "桌上的光和影。",
          author: people["user-yun"]!, tags: ["still life", "film"],
          createdAt: "2025-09-09T09:09:00.000Z",
          photoIds: ["DSCF0436", "IMG_5469", "DSCF2848"],
          uploads: [FixtureUpload(daysAgo: 8, photoIds: ["DSCF0436", "IMG_5469", "DSCF2848"])]
        ),
      ]
    }
  }
#endif
