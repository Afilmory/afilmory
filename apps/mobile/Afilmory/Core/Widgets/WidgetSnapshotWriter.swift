import Foundation
import WidgetKit

actor WidgetSnapshotWriter {
  static let shared = WidgetSnapshotWriter()

  private let minimumInterval: TimeInterval = 3600
  private var lastRun: Date?

  func update(slug: String, photos: [GalleryPhoto], now: Date = Date()) async {
    guard let appGroupIdentifier = AfilmoryBuildConfiguration.appGroupIdentifier,
          let directory = WidgetSnapshotContract.directoryURL(appGroupIdentifier: appGroupIdentifier),
          let snapshotURL = WidgetSnapshotContract.snapshotURL(appGroupIdentifier: appGroupIdentifier)
    else { return }
    if let lastRun, now.timeIntervalSince(lastRun) < minimumInterval { return }

    let picks = DailyPhotoPicker.pick(photoIds: photos.map(\.id), slug: slug, startingAt: now)
    guard !picks.isEmpty else { return }
    let photosById = Dictionary(photos.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      var entries: [WidgetSnapshot.Entry] = []
      for pick in picks {
        guard let photo = photosById[pick.photoId] else { continue }
        let fileName = "\(photo.id).jpg"
        let fileURL = directory.appendingPathComponent(fileName, isDirectory: false)
        if !FileManager.default.fileExists(atPath: fileURL.path) {
          guard let source = URL(string: photo.thumbnailUrl) else { continue }
          let (data, response) = try await URLSession.shared.data(from: source)
          guard ((response as? HTTPURLResponse)?.statusCode ?? 200) < 400 else { continue }
          try data.write(to: fileURL, options: .atomic)
        }
        entries.append(
          WidgetSnapshot.Entry(
            date: pick.day,
            photoId: photo.id,
            gallerySlug: slug,
            imageFileName: fileName,
            aspectRatio: photo.aspectRatio > 0 ? photo.aspectRatio : 1
          )
        )
      }
      guard !entries.isEmpty else { return }

      let encoder = JSONEncoder()
      encoder.dateEncodingStrategy = .iso8601
      try encoder.encode(WidgetSnapshot(entries: entries)).write(to: snapshotURL, options: .atomic)
      prune(directory: directory, keeping: Set(entries.map(\.imageFileName)))
      lastRun = now
      WidgetCenter.shared.reloadAllTimelines()
    } catch {
      NSLog("[WidgetSnapshotWriter] Failed to update snapshot: %@", error.localizedDescription)
    }
  }

  private func prune(directory: URL, keeping fileNames: Set<String>) {
    let contents = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
    for name in contents where name != WidgetSnapshotContract.fileName && !fileNames.contains(name) {
      try? FileManager.default.removeItem(at: directory.appendingPathComponent(name, isDirectory: false))
    }
  }
}
