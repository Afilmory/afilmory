import SDWebImage
import UIKit

final class MosaicView: UIView {
  static let gap: CGFloat = 3

  var onSelect: ((GalleryCoverPhoto) -> Void)?

  private var tiles: [MosaicTileView] = []
  private var covers: [GalleryCoverPhoto] = []
  private var layout = MosaicLayout(aspectRatios: [], width: 0)

  override init(frame: CGRect) {
    super.init(frame: frame)
    clipsToBounds = true
    layer.cornerRadius = AFRadius.mosaic
    layer.cornerCurve = .continuous
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  static func layout(for covers: [GalleryCoverPhoto], width: CGFloat) -> MosaicLayout {
    MosaicLayout(aspectRatios: covers.map { CGFloat($0.aspectRatio) }, width: width, gap: gap)
  }

  func configure(covers: [GalleryCoverPhoto], totalCount: Int? = nil, width: CGFloat) {
    let ratios = covers.map { CGFloat($0.aspectRatio) }
    let hidden = max(0, (totalCount ?? covers.count) - covers.count)
    layout = MosaicLayout(aspectRatios: ratios, width: width, gap: Self.gap)
    self.covers = Array(covers.prefix(layout.tiles.count))
    while tiles.count < layout.tiles.count {
      let tile = MosaicTileView()
      tile.addAction(UIAction { [weak self, weak tile] _ in
        guard let self, let tile, let index = self.tiles.firstIndex(of: tile), self.covers.indices.contains(index) else { return }
        self.onSelect?(self.covers[index])
      }, for: .touchUpInside)
      addSubview(tile)
      tiles.append(tile)
    }
    let overflow = layout.overflow + hidden
    for (index, tile) in tiles.enumerated() {
      guard index < layout.tiles.count else {
        tile.isHidden = true
        tile.reset()
        continue
      }
      tile.isHidden = false
      tile.frame = layout.tiles[index]
      let isLast = index == layout.tiles.count - 1
      tile.configure(self.covers[index], position: index + 1, overflow: isLast ? overflow : 0)
    }
    invalidateIntrinsicContentSize()
  }

  override var intrinsicContentSize: CGSize {
    layout.size
  }

  func sourceView(for photoID: String) -> UIView? {
    guard let index = covers.firstIndex(where: { $0.id == photoID }), tiles.indices.contains(index) else { return nil }
    return tiles[index].imageView
  }
}

final class MosaicTileView: UIControl {
  let imageView = UIImageView()
  private let overflowLabel = AFLabel.exhibit(size: 22)
  private let scrim = UIView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.backgroundColor = AFColor.filmBase
    imageView.isUserInteractionEnabled = false
    scrim.backgroundColor = AFColor.ground.withAlphaComponent(0.62)
    scrim.isUserInteractionEnabled = false
    overflowLabel.textAlignment = .center
    overflowLabel.translatesAutoresizingMaskIntoConstraints = true
    for view in [imageView, scrim, overflowLabel] as [UIView] {
      view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      addSubview(view)
    }
    isAccessibilityElement = true
    accessibilityTraits = [.button, .image]
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    for view in [imageView, scrim, overflowLabel] as [UIView] {
      view.frame = bounds
    }
  }

  override var isHighlighted: Bool {
    didSet { alpha = isHighlighted ? 0.82 : 1 }
  }

  func configure(_ cover: GalleryCoverPhoto, position: Int, overflow: Int) {
    scrim.isHidden = overflow == 0
    overflowLabel.isHidden = overflow == 0
    overflowLabel.text = "+\(overflow)"
    accessibilityLabel = String(localized: "View photo \(position)")
    accessibilityValue = overflow > 0 ? String(localized: "\(overflow) more photos") : nil
    load(cover)
  }

  func reset() {
    imageView.sd_cancelCurrentImageLoad()
    imageView.image = nil
  }

  private func load(_ cover: GalleryCoverPhoto) {
    imageView.sd_cancelCurrentImageLoad()
    imageView.image = ThumbHashCache.image(forHex: cover.thumbHash)
    let scale = window?.windowScene?.screen.scale ?? traitCollection.displayScale
    let pixelSize = CGSize(width: max(bounds.width, 80) * scale, height: max(bounds.height, 80) * scale)
    imageView.sd_setImage(
      with: URL(string: cover.thumbnailUrl),
      placeholderImage: imageView.image,
      options: [.retryFailed, .avoidAutoSetImage],
      context: [.imageThumbnailPixelSize: NSValue(cgSize: pixelSize)],
      progress: nil
    ) { [weak self] image, _, _, _ in
      guard let self, let image else { return }
      UIView.transition(with: imageView, duration: 0.22, options: [.transitionCrossDissolve, .allowUserInteraction]) {
        self.imageView.image = image
      }
    }
  }
}
