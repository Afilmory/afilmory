import SDWebImage
import UIKit

struct GalleryFilmstripItem: Hashable, Sendable {
  let aspectRatio: Double
  let id: String
  let isLivePhoto: Bool
  let thumbHash: String?
  let thumbnailUrl: String

  init(cover: GalleryCoverPhoto) {
    aspectRatio = cover.aspectRatio
    id = cover.id
    isLivePhoto = cover.isLivePhoto
    thumbHash = cover.thumbHash
    thumbnailUrl = cover.thumbnailUrl
  }

  init(preview: GalleryPhotoPreview) {
    aspectRatio = preview.aspectRatio
    id = preview.id
    isLivePhoto = preview.isLivePhoto
    thumbHash = preview.thumbHash
    thumbnailUrl = preview.thumbnailUrl
  }
}

final class GalleryFilmstripView: UIView {
  static let itemHeight: CGFloat = 116
  static let itemWidth: CGFloat = 92
  static let itemSpacing: CGFloat = 5

  private let scrollView = UIScrollView()
  private var tiles: [GalleryFilmstripTile] = []
  private var onSelect: ((String) -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    scrollView.alwaysBounceHorizontal = false
    scrollView.isDirectionalLockEnabled = true
    scrollView.scrollsToTop = false
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.showsVerticalScrollIndicator = false
    addSubview(scrollView)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    scrollView.frame = bounds
    var x: CGFloat = 0
    for tile in tiles {
      tile.frame = CGRect(x: x, y: 0, width: Self.itemWidth, height: Self.itemHeight)
      x += Self.itemWidth + Self.itemSpacing
    }
    let contentWidth = max(0, x - Self.itemSpacing)
    scrollView.contentSize = CGSize(width: contentWidth, height: bounds.height)
    scrollView.isScrollEnabled = contentWidth > bounds.width + 0.5
  }

  func configure(items: [GalleryFilmstripItem], onSelect: ((String) -> Void)?) {
    self.onSelect = onSelect
    isUserInteractionEnabled = onSelect != nil && !items.isEmpty
    while tiles.count > items.count {
      tiles.removeLast().removeFromSuperview()
    }
    while tiles.count < items.count {
      let tile = GalleryFilmstripTile()
      tile.addAction(UIAction { [weak self, weak tile] _ in
        guard let id = tile?.photoID else { return }
        self?.onSelect?(id)
      }, for: .touchUpInside)
      scrollView.addSubview(tile)
      tiles.append(tile)
    }
    for (index, item) in items.enumerated() {
      tiles[index].configure(item)
    }
    setNeedsLayout()
  }

  func prepareForReuse() {
    onSelect = nil
    tiles.forEach { $0.prepareForReuse() }
  }

  func transitionSourceView(for photoID: String) -> UIView? {
    tiles.first(where: { $0.photoID == photoID })?.transitionSourceView
  }
}

private final class GalleryFilmstripTile: UIButton {
  private let photoView = UIImageView()
  private let liveBadge = UIImageView()
  private(set) var photoID: String?

  var transitionSourceView: UIView {
    photoView
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    clipsToBounds = true
    layer.cornerCurve = .continuous
    layer.cornerRadius = 8
    backgroundColor = .tertiarySystemFill
    photoView.contentMode = .scaleAspectFill
    photoView.clipsToBounds = true
    photoView.isUserInteractionEnabled = false
    photoView.sd_imageTransition = .fade(duration: 0.2)
    addSubview(photoView)
    liveBadge.image = LivePhotoBadgeArtwork.overContent
    liveBadge.contentMode = .center
    liveBadge.isHidden = true
    liveBadge.isUserInteractionEnabled = false
    addSubview(liveBadge)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    photoView.frame = bounds
    let badgeSize = liveBadge.image?.size ?? CGSize(width: 24, height: 24)
    liveBadge.frame = CGRect(origin: CGPoint(x: 6, y: 6), size: badgeSize)
  }

  func configure(_ item: GalleryFilmstripItem) {
    photoID = item.id
    liveBadge.isHidden = !item.isLivePhoto
    photoView.sd_setImage(
      with: URL(string: item.thumbnailUrl),
      placeholderImage: ThumbHashCache.image(forHex: item.thumbHash),
      options: [.retryFailed]
    )
  }

  func prepareForReuse() {
    photoID = nil
    photoView.sd_cancelCurrentImageLoad()
    photoView.image = nil
    liveBadge.isHidden = true
  }
}
