import SwiftUI
import WidgetKit

struct DailyPhotoEntry: TimelineEntry {
  let date: Date
  let imageURL: URL?
  let gallerySlug: String?
  let photoId: String?

  var deepLinkURL: URL? {
    guard let gallerySlug, let photoId else { return nil }
    return URL(string: "afilmory://photo/\(gallerySlug)/\(photoId)")
  }

  static func empty(date: Date = Date()) -> DailyPhotoEntry {
    DailyPhotoEntry(date: date, imageURL: nil, gallerySlug: nil, photoId: nil)
  }
}

enum DailyPhotoStore {
  static func entries() -> [DailyPhotoEntry] {
    guard let directory = WidgetSnapshotContract.directoryURL(),
          let snapshotURL = WidgetSnapshotContract.snapshotURL(),
          let data = try? Data(contentsOf: snapshotURL)
    else { return [] }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    guard let snapshot = try? decoder.decode(WidgetSnapshot.self, from: data) else { return [] }
    return snapshot.entries
      .sorted { $0.date < $1.date }
      .compactMap { entry in
        let fileURL = directory.appendingPathComponent(entry.imageFileName, isDirectory: false)
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        return DailyPhotoEntry(
          date: entry.date,
          imageURL: fileURL,
          gallerySlug: entry.gallerySlug,
          photoId: entry.photoId
        )
      }
  }
}

struct DailyPhotoProvider: TimelineProvider {
  func placeholder(in context: Context) -> DailyPhotoEntry {
    DailyPhotoEntry.empty()
  }

  func getSnapshot(in context: Context, completion: @escaping (DailyPhotoEntry) -> Void) {
    completion(DailyPhotoStore.entries().last(where: { $0.date <= Date() }) ?? .empty())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<DailyPhotoEntry>) -> Void) {
    let now = Date()
    let stored = DailyPhotoStore.entries()
    var entries = stored.filter { $0.date >= now }
    if let current = stored.last(where: { $0.date <= now }) {
      entries.insert(DailyPhotoEntry(
        date: now,
        imageURL: current.imageURL,
        gallerySlug: current.gallerySlug,
        photoId: current.photoId
      ), at: 0)
    }
    if entries.isEmpty {
      entries = [.empty(date: now)]
    }
    completion(Timeline(entries: entries, policy: .atEnd))
  }
}

struct DailyPhotoWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: DailyPhotoEntry

  var body: some View {
    Group {
      if let imageURL = entry.imageURL, let image = UIImage(contentsOfFile: imageURL.path) {
        photo(image)
      } else {
        DailyPhotoPlaceholderView()
      }
    }
    .widgetURL(entry.deepLinkURL)
  }

  private func photo(_ image: UIImage) -> some View {
    ZStack(alignment: .bottomLeading) {
      Color.clear
      if family == .systemMedium, let slug = entry.gallerySlug {
        Text(slug)
          .font(.caption2.weight(.semibold))
          .foregroundStyle(.white)
          .shadow(radius: 3)
          .padding(10)
      }
    }
    .containerBackground(for: .widget) {
      Image(uiImage: image)
        .resizable()
        .widgetAccentedRenderingMode(.fullColor)
        .scaledToFill()
    }
  }
}

private struct DailyPhotoPlaceholderView: View {
  var body: some View {
    VStack(spacing: 8) {
      Image(systemName: "photo.on.rectangle.angled")
        .font(.title)
        .foregroundStyle(.tint)
      Text("Open Afilmory to set up")
        .font(.caption2)
        .multilineTextAlignment(.center)
        .foregroundStyle(.secondary)
    }
    .padding(8)
    .containerBackground(for: .widget) {
      Color(uiColor: .systemBackground)
    }
  }
}

struct DailyPhotoWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "DailyPhotoWidget", provider: DailyPhotoProvider()) { entry in
      DailyPhotoWidgetView(entry: entry)
    }
    .configurationDisplayName("Daily Photo")
    .description("A photo from your gallery, refreshed every day.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
