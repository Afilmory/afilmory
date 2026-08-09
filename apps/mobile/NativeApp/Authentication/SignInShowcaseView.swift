import SDWebImage
import SwiftUI

private struct ShowcaseCoverRequest: Encodable {
  let limit: Int
  let sort: String
}

private struct ShowcaseColumn: Identifiable {
  struct Item: Identifiable {
    let id: String
    let photo: GalleryCoverPhoto
    let height: CGFloat
  }

  let id: Int
  let contentHeight: CGFloat
  let duration: TimeInterval
  let items: [Item]
  let width: CGFloat
}

struct SignInShowcaseView: View {
  private static let columnCount = 3
  private static let gap: CGFloat = 6

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var photos: [GalleryCoverPhoto] = []

  var body: some View {
    GeometryReader { geometry in
      let columns = buildColumns(size: geometry.size)
      if columns.isEmpty {
        LinearGradient(
          colors: [Color(uiColor: .secondarySystemBackground), Color(uiColor: .systemBackground)],
          startPoint: .top,
          endPoint: .bottom
        )
      } else {
        HStack(alignment: .top, spacing: Self.gap) {
          ForEach(columns) { column in
            ShowcaseColumnView(column: column, animated: !reduceMotion)
          }
        }
        .clipped()
      }
    }
    .allowsHitTesting(false)
    .task {
      guard photos.isEmpty else { return }
      photos = (try? await Self.loadPhotos()) ?? []
    }
  }

  private func buildColumns(size: CGSize) -> [ShowcaseColumn] {
    guard !photos.isEmpty, size.width > 0, size.height > 0 else { return [] }
    let width = (size.width - Self.gap * CGFloat(Self.columnCount - 1)) / CGFloat(Self.columnCount)
    let assigned = (0..<Self.columnCount).map { column in
      photos.enumerated().compactMap { index, photo in index % Self.columnCount == column ? photo : nil }
    }
    let durations: [TimeInterval] = [80, 100, 90]

    return assigned.enumerated().compactMap { columnIndex, columnPhotos in
      guard !columnPhotos.isEmpty else { return nil }
      var contentHeight: CGFloat = 0
      var items: [ShowcaseColumn.Item] = []
      var repetition = 0
      while contentHeight < size.height * 2, items.count < 60 {
        for photo in columnPhotos {
          let ratio = photo.aspectRatio > 0 ? photo.aspectRatio : 1
          let height = width / ratio
          items.append(
            ShowcaseColumn.Item(
              id: "\(photo.id):\(repetition)",
              photo: photo,
              height: height
            )
          )
          contentHeight += height + Self.gap
        }
        repetition += 1
      }
      return ShowcaseColumn(
        id: columnIndex,
        contentHeight: contentHeight,
        duration: durations[columnIndex % durations.count],
        items: items,
        width: width
      )
    }
  }

  private static func loadPhotos() async throws -> [GalleryCoverPhoto] {
    let directory: FeaturedGalleriesEnvelope = try await AfilmoryAPI.shared.request(
      APIEndpoint(baseURL: .platform, path: "gallery-directory")
    )
    let galleries = Array(directory.galleries.prefix(4))
    let batches = await withTaskGroup(of: (Int, [GalleryCoverPhoto]).self) { group in
      for (index, gallery) in galleries.enumerated() {
        group.addTask {
          do {
            let apiBase = try ApiEnvironmentStore.shared.galleryAPIBaseURL(slug: gallery.slug)
            let response: ManifestEnvelope = try await AfilmoryAPI.shared.request(
              APIEndpoint(
                baseURL: .explicit(apiBase.absoluteString),
                path: "manifest/photos/search",
                method: .post,
                body: try APIEndpoint.jsonBody(ShowcaseCoverRequest(limit: 8, sort: "desc"))
              )
            )
            let covers = response.data.compactMap { photo -> GalleryCoverPhoto? in
              guard let thumbnailURL = photo.thumbnailUrl?.trimmingToNil else { return nil }
              let width = photo.width ?? 0
              let height = photo.height ?? 0
              return GalleryCoverPhoto(
                id: photo.id,
                thumbnailUrl: thumbnailURL,
                thumbHash: photo.thumbHash,
                aspectRatio: photo.aspectRatio ?? (width > 0 && height > 0 ? width / height : 1),
                isLivePhoto: photo.video?.object?["type"]?.string == "live-photo"
              )
            }
            return (index, covers)
          } catch {
            return (index, [])
          }
        }
      }
      var result: [(Int, [GalleryCoverPhoto])] = []
      for await batch in group {
        result.append(batch)
      }
      return result.sorted { $0.0 < $1.0 }.map(\.1)
    }

    var pool: [GalleryCoverPhoto] = []
    for index in 0..<8 where pool.count < 24 {
      for batch in batches where batch.indices.contains(index) {
        pool.append(batch[index])
        if pool.count == 24 { break }
      }
    }
    return pool
  }
}

private struct ShowcaseColumnView: View {
  private struct AnimationKey: Hashable {
    let animated: Bool
    let contentHeight: CGFloat
    let duration: TimeInterval
  }

  let column: ShowcaseColumn
  let animated: Bool

  @State private var translation: CGFloat = 0

  var body: some View {
    VStack(spacing: 6) {
      content
      if animated {
        content
      }
    }
    .offset(y: translation)
    .frame(width: column.width, alignment: .top)
    .task(id: animationKey) {
      var transaction = Transaction()
      transaction.disablesAnimations = true
      withTransaction(transaction) {
        translation = 0
      }

      guard animated, column.contentHeight > 0 else { return }
      await Task.yield()
      guard !Task.isCancelled else { return }
      withAnimation(.linear(duration: column.duration).repeatForever(autoreverses: false)) {
        translation = -column.contentHeight
      }
    }
  }

  private var animationKey: AnimationKey {
    AnimationKey(
      animated: animated,
      contentHeight: column.contentHeight,
      duration: column.duration
    )
  }

  private var content: some View {
    VStack(spacing: 6) {
      ForEach(column.items) { item in
        ShowcaseRemoteImage(
          url: URL(string: item.photo.thumbnailUrl),
          thumbHash: item.photo.thumbHash,
          displaySize: CGSize(width: column.width, height: item.height)
        )
          .frame(width: column.width, height: item.height)
          .background(Color(uiColor: .secondarySystemBackground))
          .clipShape(.rect(cornerRadius: 6, style: .continuous))
      }
    }
  }
}

private struct ShowcaseRemoteImage: UIViewRepresentable {
  let url: URL?
  let thumbHash: String?
  let displaySize: CGSize

  func makeUIView(context _: Context) -> ShowcaseCrossfadeImageView {
    ShowcaseCrossfadeImageView()
  }

  func updateUIView(_ view: ShowcaseCrossfadeImageView, context _: Context) {
    view.setImage(
      url: url,
      placeholder: ThumbHashCache.image(forHex: thumbHash),
      displaySize: displaySize
    )
  }

  static func dismantleUIView(_ view: ShowcaseCrossfadeImageView, coordinator _: Void) {
    view.cancelLoad()
  }
}

private final class ShowcaseCrossfadeImageView: UIView {
  private let placeholderView = UIImageView()
  private let imageView = UIImageView()
  private var representedPixelSize = CGSize.zero
  private var representedURL: URL?
  private var requestVersion = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    clipsToBounds = true
    isAccessibilityElement = false
    for view in [placeholderView, imageView] {
      view.contentMode = .scaleAspectFill
      view.clipsToBounds = true
      addSubview(view)
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    placeholderView.frame = bounds
    imageView.frame = bounds
  }

  func setImage(url: URL?, placeholder: UIImage?, displaySize: CGSize) {
    let scale = max(traitCollection.displayScale, 1)
    let pixelSize = CGSize(
      width: ceil(max(displaySize.width, 1) * scale),
      height: ceil(max(displaySize.height, 1) * scale)
    )
    guard representedURL != url || representedPixelSize != pixelSize else {
      if imageView.image == nil {
        placeholderView.image = placeholder
      }
      return
    }

    representedURL = url
    representedPixelSize = pixelSize
    requestVersion &+= 1
    let currentRequestVersion = requestVersion
    imageView.sd_cancelCurrentImageLoad()
    placeholderView.image = placeholder
    placeholderView.alpha = 1
    imageView.image = nil
    imageView.alpha = 0

    guard let url else { return }
    imageView.sd_setImage(
      with: url,
      placeholderImage: nil,
      options: [.retryFailed, .scaleDownLargeImages],
      context: [.imageThumbnailPixelSize: NSValue(cgSize: pixelSize)],
      progress: nil,
      completed: { [weak self] image, _, _, completedURL in
        guard let self,
              currentRequestVersion == self.requestVersion,
              completedURL == self.representedURL,
              image != nil
        else { return }
        self.imageView.alpha = 0
        UIView.animate(
          withDuration: 0.2,
          delay: 0,
          options: [.beginFromCurrentState, .allowUserInteraction, .curveEaseOut]
        ) {
          self.imageView.alpha = 1
        }
      }
    )
  }

  func cancelLoad() {
    requestVersion &+= 1
    representedURL = nil
    representedPixelSize = .zero
    imageView.sd_cancelCurrentImageLoad()
    placeholderView.image = nil
    imageView.image = nil
  }
}
