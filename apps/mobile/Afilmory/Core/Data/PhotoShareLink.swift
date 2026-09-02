import UIKit

enum PhotoShareLink {
  static func url(photoId: String, galleryOrigin: URL) -> URL? {
    let id = photoId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return nil }
    return galleryOrigin.appending(path: "photos").appending(path: id)
  }

  static func url(photoId: String, gallerySlug: String?) -> URL? {
    guard let gallerySlug,
          let origin = try? ApiEnvironmentStore.shared.galleryOrigin(slug: gallerySlug)
    else { return nil }
    return url(photoId: photoId, galleryOrigin: origin)
  }
}

enum PhotoShareActivity {
  static func present(
    photoId: String,
    gallerySlug: String?,
    originalUrl: String? = nil,
    placeholderImage: UIImage? = nil,
    from presenter: UIViewController,
    sourceView: UIView? = nil,
    barButtonItem: UIBarButtonItem? = nil
  ) {
    guard let url = PhotoShareLink.url(photoId: photoId, gallerySlug: gallerySlug) else { return }
    var items: [Any] = [url]
    if let originalUrl, let original = URL(string: originalUrl) {
      items.insert(PhotoOriginalActivityItem(url: original, placeholder: placeholderImage ?? UIImage()), at: 0)
    }
    let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
    if let barButtonItem {
      controller.popoverPresentationController?.barButtonItem = barButtonItem
    } else if let sourceView {
      controller.popoverPresentationController?.sourceView = sourceView
      controller.popoverPresentationController?.sourceRect = sourceView.bounds
    }
    presenter.present(controller, animated: true)
  }
}

// The placeholder is what makes the sheet offer Save Image before the original
// has been fetched; `item` runs on the provider's own operation thread.
private final class PhotoOriginalActivityItem: UIActivityItemProvider, @unchecked Sendable {
  private let url: URL

  init(url: URL, placeholder: UIImage) {
    self.url = url
    super.init(placeholderItem: placeholder)
  }

  override var item: Any {
    (try? Data(contentsOf: url)).flatMap(UIImage.init(data:)) ?? placeholderItem ?? url
  }
}
