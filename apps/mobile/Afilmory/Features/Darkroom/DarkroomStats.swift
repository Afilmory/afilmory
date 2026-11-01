import Foundation

struct DarkroomStats: Equatable, Sendable {
  let frames: Int
  let megabytes: Int
  let bodies: Int

  init(frames: Int, megabytes: Int, bodies: Int) {
    self.frames = frames
    self.megabytes = megabytes
    self.bodies = bodies
  }

  init(overview: StudioDashboardStats?, photos: [GalleryPhoto]) {
    frames = overview?.totalPhotos ?? photos.count
    let bytes = overview.map { Double($0.totalStorageBytes) } ?? photos.reduce(0) { $0 + ($1.size ?? 0) }
    megabytes = Int((bytes / 1_000_000).rounded())
    var cameras = Set<String>()
    for photo in photos {
      guard let camera = ExhibitFormat.camera(for: photo)?.trimmingCharacters(in: .whitespacesAndNewlines),
            !camera.isEmpty
      else { continue }
      cameras.insert(camera.lowercased())
    }
    bodies = cameras.count
  }

  static func pendingRepliesDetail(count: Int, hasMore: Bool) -> String {
    hasMore ? String(localized: "\(count)+ pending") : String(localized: "\(count) pending")
  }
}
