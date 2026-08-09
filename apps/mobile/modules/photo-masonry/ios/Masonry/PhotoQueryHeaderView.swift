import SDWebImage
import UIKit

enum PhotoQueryConstraint: Equatable, Hashable {
  case query
  case tag(String)
  case date
  case camera(String)
  case lens(String)
  case rating
}

struct PhotoQueryHeaderPhoto: Equatable {
  let id: String
  let url: String
  let thumbHash: String?
}

struct PhotoQueryHeaderChip: Equatable, Identifiable {
  let id: String
  let title: String
  let constraint: PhotoQueryConstraint
}

struct PhotoQueryHeaderModel: Equatable {
  let resultText: String
  let headline: String
  let editTitle: String
  let editAccessibilityLabel: String
  let clearTitle: String
  let clearAccessibilityLabel: String
  let photos: [PhotoQueryHeaderPhoto]
  let chips: [PhotoQueryHeaderChip]
}

struct PhotoQueryHeaderLayoutMetrics: Equatable {
  let cardHeight: CGFloat
  let horizontalInset: CGFloat
  let topSpacing: CGFloat
  let bottomSpacing: CGFloat

  var reservedHeight: CGFloat {
    topSpacing + cardHeight + bottomSpacing
  }
}

final class PhotoQueryHeaderView: UIView {
  var onEdit: (() -> Void)?
  var onClear: (() -> Void)?
  var onRemoveConstraint: ((PhotoQueryConstraint) -> Void)?

  private let surfaceView = UIView()
  private let imageGridView = UIView()
  private let overlayView = UIView()
  private let verticalGradientLayer = CAGradientLayer()
  private let radialGradientLayer = CAGradientLayer()
  private let resultLabel = UILabel()
  private let headlineLabel = UILabel()
  private let editButton = UIButton(type: .system)
  private let clearButton = UIButton(type: .system)
  private let actionsStack = UIStackView()
  private let chipScrollView = UIScrollView()
  private let chipStack = UIStackView()
  private var imageViews: [UIImageView] = []
  private var model: PhotoQueryHeaderModel?

  // The staggered order avoids placing the same repeated result in a strict checkerboard
  // when a narrow search returns fewer photos than the twelve-cell Web composition.
  private static let imageOrder = [0, 5, 2, 7, 9, 4, 11, 6, 8, 3, 10, 1]
  private static let imageCrops = [
    CGRect(x: 0, y: 0, width: 1, height: 1),
    CGRect(x: 0.04, y: 0, width: 0.92, height: 1),
    CGRect(x: 0, y: 0.04, width: 1, height: 0.92),
    CGRect(x: 0.06, y: 0.04, width: 0.88, height: 0.92),
  ]

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    layer.shadowColor = UIColor.black.cgColor
    layer.shadowOffset = CGSize(width: 0, height: 12)
    layer.shadowOpacity = 0.32
    layer.shadowRadius = 22

    surfaceView.clipsToBounds = true
    surfaceView.layer.cornerCurve = .continuous
    surfaceView.backgroundColor = .black
    addSubview(surfaceView)

    surfaceView.addSubview(imageGridView)
    configureImageGrid()

    overlayView.isUserInteractionEnabled = false
    surfaceView.addSubview(overlayView)

    verticalGradientLayer.colors = [
      UIColor.black.withAlphaComponent(0.62).cgColor,
      UIColor.black.withAlphaComponent(0.80).cgColor,
      UIColor.black.withAlphaComponent(0.94).cgColor,
    ]
    verticalGradientLayer.locations = [0, 0.52, 1]
    overlayView.layer.addSublayer(verticalGradientLayer)

    radialGradientLayer.type = .radial
    radialGradientLayer.startPoint = CGPoint(x: 0.5, y: 0.45)
    radialGradientLayer.endPoint = CGPoint(x: 1, y: 1)
    radialGradientLayer.colors = [
      UIColor.white.withAlphaComponent(0.11).cgColor,
      UIColor.clear.cgColor,
    ]
    radialGradientLayer.locations = [0, 0.72]
    overlayView.layer.addSublayer(radialGradientLayer)

    resultLabel.font = .systemFont(ofSize: 11, weight: .semibold)
    resultLabel.textAlignment = .center
    resultLabel.numberOfLines = 1
    surfaceView.addSubview(resultLabel)

    headlineLabel.font = .systemFont(ofSize: 30, weight: .semibold)
    headlineLabel.textAlignment = .center
    headlineLabel.textColor = .white
    headlineLabel.numberOfLines = 2
    headlineLabel.adjustsFontSizeToFitWidth = true
    headlineLabel.minimumScaleFactor = 0.76
    surfaceView.addSubview(headlineLabel)

    configureActionButton(editButton, imageName: "pencil")
    editButton.accessibilityIdentifier = "photo-query-edit"
    editButton.addTarget(self, action: #selector(handleEdit), for: .touchUpInside)

    configureActionButton(clearButton, imageName: "xmark")
    clearButton.accessibilityIdentifier = "photo-query-clear"
    clearButton.addTarget(self, action: #selector(handleClear), for: .touchUpInside)

    actionsStack.axis = .horizontal
    actionsStack.alignment = .fill
    actionsStack.distribution = .fill
    actionsStack.spacing = 10
    actionsStack.addArrangedSubview(editButton)
    actionsStack.addArrangedSubview(clearButton)
    surfaceView.addSubview(actionsStack)

    chipScrollView.showsHorizontalScrollIndicator = false
    chipScrollView.alwaysBounceHorizontal = false
    surfaceView.addSubview(chipScrollView)

    chipStack.axis = .horizontal
    chipStack.alignment = .fill
    chipStack.spacing = 8
    chipScrollView.addSubview(chipStack)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  static func layoutMetrics(for width: CGFloat) -> PhotoQueryHeaderLayoutMetrics {
    if width >= 700 {
      return PhotoQueryHeaderLayoutMetrics(
        cardHeight: 320,
        horizontalInset: 24,
        topSpacing: 20,
        bottomSpacing: 24
      )
    }
    return PhotoQueryHeaderLayoutMetrics(
      cardHeight: 292,
      horizontalInset: 16,
      topSpacing: 12,
      bottomSpacing: 16
    )
  }

  func configure(_ model: PhotoQueryHeaderModel) {
    guard self.model != model else { return }
    self.model = model
    resultLabel.attributedText = NSAttributedString(
      string: model.resultText.uppercased(),
      attributes: [
        .foregroundColor: UIColor.white.withAlphaComponent(0.58),
        .kern: 2.2,
      ]
    )
    headlineLabel.text = model.headline
    updateActionButton(editButton, title: model.editTitle)
    editButton.accessibilityLabel = model.editAccessibilityLabel
    updateActionButton(clearButton, title: model.clearTitle)
    clearButton.accessibilityLabel = model.clearAccessibilityLabel
    updateImages(model.photos)
    updateChips(model.chips)
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let isWide = bounds.width >= 700
    let cornerRadius: CGFloat = isWide ? 28 : 22
    surfaceView.frame = bounds
    surfaceView.layer.cornerRadius = cornerRadius
    surfaceView.layer.borderColor = UIColor.white.withAlphaComponent(0.10).cgColor
    surfaceView.layer.borderWidth = 1 / max(traitCollection.displayScale, 1)
    layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: cornerRadius).cgPath

    imageGridView.frame = bounds
    layoutImageGrid()
    overlayView.frame = bounds
    verticalGradientLayer.frame = overlayView.bounds
    radialGradientLayer.frame = overlayView.bounds

    let horizontalInset: CGFloat = isWide ? 42 : 24
    let resultTop: CGFloat = isWide ? 64 : 50
    resultLabel.frame = CGRect(
      x: horizontalInset,
      y: resultTop,
      width: max(bounds.width - horizontalInset * 2, 0),
      height: 18
    )

    let hasChips = !chipScrollView.isHidden
    let headlineTop = resultLabel.frame.maxY + (isWide ? 16 : 12)
    let headlineHeight: CGFloat = isWide ? 82 : 68
    headlineLabel.font = .systemFont(ofSize: isWide ? 38 : 30, weight: .semibold)
    headlineLabel.frame = CGRect(
      x: horizontalInset,
      y: headlineTop,
      width: max(bounds.width - horizontalInset * 2, 0),
      height: headlineHeight
    )

    if hasChips {
      let chipY = headlineLabel.frame.maxY + (isWide ? 18 : 12)
      chipScrollView.frame = CGRect(
        x: horizontalInset,
        y: chipY,
        width: max(bounds.width - horizontalInset * 2, 0),
        height: 34
      )
      layoutChips()
    } else {
      chipScrollView.frame = .zero
      chipStack.frame = .zero
      chipScrollView.contentSize = .zero
    }

    let actionHeight: CGFloat = 44
    let editWidth = editButton.sizeThatFits(
      CGSize(width: bounds.width, height: actionHeight)
    ).width
    let clearWidth = clearButton.sizeThatFits(
      CGSize(width: bounds.width, height: actionHeight)
    ).width
    let naturalWidth = editWidth + actionsStack.spacing + clearWidth
    let actionWidth = min(naturalWidth, max(bounds.width - horizontalInset * 2, 0))
    actionsStack.frame = CGRect(
      x: (bounds.width - actionWidth) / 2,
      y: bounds.height - (isWide ? 24 : 18) - actionHeight,
      width: actionWidth,
      height: actionHeight
    )
  }

  private func configureImageGrid() {
    for index in 0..<12 {
      let imageView = UIImageView()
      imageView.backgroundColor = UIColor(
        white: index.isMultiple(of: 2) ? 0.075 : 0.045,
        alpha: 1
      )
      imageView.contentMode = .scaleAspectFill
      imageView.clipsToBounds = true
      imageView.isAccessibilityElement = false
      imageView.layer.contentsRect = Self.imageCrops[index % Self.imageCrops.count]
      imageView.sd_imageTransition = .fade(duration: 0.18)
      imageGridView.addSubview(imageView)
      imageViews.append(imageView)
    }
  }

  private func layoutImageGrid() {
    let visibleImageViews = imageViews.filter { !$0.isHidden }
    guard !visibleImageViews.isEmpty else { return }
    let columns = visibleImageViews.count == 1 ? 1 : visibleImageViews.count == 6 ? 3 : 4
    let rows = Int(ceil(Double(visibleImageViews.count) / Double(columns)))
    let gap: CGFloat = 2
    let tileWidth = (imageGridView.bounds.width - CGFloat(columns - 1) * gap) / CGFloat(columns)
    let tileHeight = (imageGridView.bounds.height - CGFloat(rows - 1) * gap) / CGFloat(rows)
    for (index, imageView) in visibleImageViews.enumerated() {
      let column = index % columns
      let row = index / columns
      imageView.frame = CGRect(
        x: CGFloat(column) * (tileWidth + gap),
        y: CGFloat(row) * (tileHeight + gap),
        width: tileWidth,
        height: tileHeight
      ).integral
    }
  }

  private func configureActionButton(_ button: UIButton, imageName: String) {
    var configuration = AdaptiveGlass.buttonConfiguration()
    configuration.baseForegroundColor = .white
    configuration.buttonSize = .medium
    configuration.cornerStyle = .capsule
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 14)
    configuration.image = UIImage(systemName: imageName)
    configuration.imagePadding = 7
    configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 12, weight: .semibold)
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
      var outgoing = incoming
      outgoing.font = .systemFont(ofSize: 14, weight: .medium)
      return outgoing
    }
    button.configuration = configuration
  }

  private func updateActionButton(_ button: UIButton, title: String) {
    var configuration = button.configuration
    configuration?.title = title
    button.configuration = configuration
  }

  private func updateImages(_ photos: [PhotoQueryHeaderPhoto]) {
    let visibleImageCount: Int
    switch photos.count {
    case 0:
      visibleImageCount = 0
    case 1:
      visibleImageCount = 1
    case 2...5:
      visibleImageCount = 6
    default:
      visibleImageCount = 12
    }

    for (index, imageView) in imageViews.enumerated() {
      imageView.sd_cancelCurrentImageLoad()
      imageView.image = nil
      imageView.isHidden = index >= visibleImageCount
      guard index < visibleImageCount, !photos.isEmpty else { continue }
      let orderedIndex = visibleImageCount == 6
        ? index % photos.count
        : Self.imageOrder[index] % photos.count
      let photo = photos[orderedIndex]
      imageView.sd_setImage(
        with: URL(string: photo.url),
        placeholderImage: ThumbHashCache.image(forHex: photo.thumbHash),
        options: [.retryFailed]
      )
    }
  }

  private func updateChips(_ chips: [PhotoQueryHeaderChip]) {
    for view in chipStack.arrangedSubviews {
      chipStack.removeArrangedSubview(view)
      view.removeFromSuperview()
    }

    // A query-only result already uses the query as its headline. Repeating it as the
    // sole chip adds no information and makes the narrow layout appear duplicated.
    let visibleChips: [PhotoQueryHeaderChip]
    if chips.count == 1, chips.first?.constraint == .query {
      visibleChips = []
    } else {
      visibleChips = chips
    }

    chipScrollView.isHidden = visibleChips.isEmpty
    for chip in visibleChips {
      var configuration = UIButton.Configuration.plain()
      configuration.baseForegroundColor = UIColor.white.withAlphaComponent(0.92)
      configuration.cornerStyle = .capsule
      configuration.contentInsets = NSDirectionalEdgeInsets(top: 7, leading: 12, bottom: 7, trailing: 10)
      configuration.title = chip.title
      configuration.titleLineBreakMode = .byClipping
      configuration.image = UIImage(systemName: "xmark")
      configuration.imagePlacement = .trailing
      configuration.imagePadding = 6
      configuration.background.backgroundColor = UIColor.white.withAlphaComponent(0.09)
      configuration.background.strokeColor = UIColor.white.withAlphaComponent(0.12)
      configuration.background.strokeWidth = 1 / max(traitCollection.displayScale, 1)
      configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 9, weight: .bold)
      configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
        var outgoing = incoming
        outgoing.font = .systemFont(ofSize: 14, weight: .medium)
        return outgoing
      }
      let button = UIButton(configuration: configuration)
      button.titleLabel?.numberOfLines = 1
      button.titleLabel?.lineBreakMode = .byClipping
      button.setContentHuggingPriority(.required, for: .horizontal)
      button.setContentCompressionResistancePriority(.required, for: .horizontal)
      button.accessibilityIdentifier = "photo-query-chip-\(chip.id)"
      button.addAction(UIAction { [weak self] _ in
        self?.onRemoveConstraint?(chip.constraint)
      }, for: .touchUpInside)
      chipStack.addArrangedSubview(button)
    }
  }

  private func layoutChips() {
    let chipWidth = chipStack.arrangedSubviews.reduce(CGFloat.zero) { result, view in
      result + view.intrinsicContentSize.width
    } + CGFloat(max(chipStack.arrangedSubviews.count - 1, 0)) * chipStack.spacing
    let contentWidth = max(chipWidth, chipScrollView.bounds.width)
    chipStack.frame = CGRect(
      x: max((chipScrollView.bounds.width - chipWidth) / 2, 0),
      y: 0,
      width: chipWidth,
      height: chipScrollView.bounds.height
    )
    chipScrollView.contentSize = CGSize(width: contentWidth, height: chipScrollView.bounds.height)
    chipScrollView.alwaysBounceHorizontal = chipWidth > chipScrollView.bounds.width
  }

  @objc private func handleEdit() {
    onEdit?()
  }

  @objc private func handleClear() {
    onClear?()
  }
}
