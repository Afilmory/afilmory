import UIKit

final class PhotoDetailToolbar: UIToolbar {
  var onShare: (() -> Void)?
  var onInfo: (() -> Void)?
  var onComments: (() -> Void)?
  var onReactions: (() -> Void)?

  private static let commentsAccessibilityIdentifier = "photo-detail-comments"
  private static let reactionsAccessibilityIdentifier = "photo-detail-reactions"
  // The face.smiling family is drawn the wrong way round: the base symbol is the
  // solid glyph and `.fill` is the outlined one.
  private static let reactionsActiveSymbol = "face.smiling"
  private static let reactionsInactiveSymbol = "face.smiling.fill"

  private let shareItem = UIBarButtonItem(image: UIImage(systemName: "square.and.arrow.up"), style: .plain, target: nil, action: nil)
  private let infoItem = UIBarButtonItem(image: UIImage(systemName: "info.circle"), style: .plain, target: nil, action: nil)
  private let commentsItem = UIBarButtonItem(image: UIImage(systemName: "bubble.left"), style: .plain, target: nil, action: nil)
  private let reactionsItem = UIBarButtonItem(
    image: UIImage(systemName: PhotoDetailToolbar.reactionsInactiveSymbol),
    style: .plain,
    target: nil,
    action: nil
  )
  private let commentBadge = PhotoDetailCommentBadge()

  private var socialActionsEnabled = true

  var shareBarButtonItem: UIBarButtonItem { shareItem }

  override init(frame: CGRect) {
    super.init(frame: frame)

    // The backdrop is always black; without this the glass bar items resolve
    // against the ambient trait and wash out.
    overrideUserInterfaceStyle = .dark
    tintColor = .white

    shareItem.accessibilityIdentifier = "photo-detail-share"
    infoItem.accessibilityIdentifier = "photo-detail-info"
    commentsItem.accessibilityIdentifier = Self.commentsAccessibilityIdentifier
    reactionsItem.accessibilityIdentifier = Self.reactionsAccessibilityIdentifier

    let appearance = UIToolbarAppearance()
    appearance.configureWithTransparentBackground()
    standardAppearance = appearance
    scrollEdgeAppearance = appearance

    shareItem.primaryAction = UIAction { [weak self] _ in self?.onShare?() }
    infoItem.primaryAction = UIAction { [weak self] _ in self?.onInfo?() }
    commentsItem.primaryAction = UIAction { [weak self] _ in self?.onComments?() }
    reactionsItem.primaryAction = UIAction { [weak self] _ in self?.onReactions?() }

    addSubview(commentBadge)
    updateItems()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    layoutCommentBadge()
  }

  func setSocialActionsEnabled(_ enabled: Bool) {
    guard enabled != socialActionsEnabled else { return }
    socialActionsEnabled = enabled
    updateItems()
  }

  func setInfoActive(_ active: Bool) {
    applySelection(active, to: infoItem)
    infoItem.image = UIImage(systemName: active ? "info.circle.fill" : "info.circle")
  }

  func setReactionsActive(_ active: Bool) {
    applySelection(active, to: reactionsItem)
    reactionsItem.image = UIImage(
      systemName: active ? Self.reactionsActiveSymbol : Self.reactionsInactiveSymbol
    )
  }

  // `isSelected` carries the prominent glass fill; the trait is set alongside it so
  // the state is announced and not only drawn.
  private func applySelection(_ selected: Bool, to item: UIBarButtonItem) {
    item.isSelected = selected
    if selected {
      item.accessibilityTraits.insert(.selected)
    } else {
      item.accessibilityTraits.remove(.selected)
    }
  }

  func setCommentCount(_ count: Int) {
    commentBadge.count = count
    setNeedsLayout()
  }

  func setShareAccessibilityLabel(_ label: String) {
    shareItem.accessibilityLabel = label
  }

  func setInfoAccessibilityLabel(_ label: String) {
    infoItem.accessibilityLabel = label
  }

  func setCommentsAccessibilityLabel(_ label: String) {
    commentsItem.accessibilityLabel = label
  }

  func setReactionsAccessibilityLabel(_ label: String) {
    reactionsItem.accessibilityLabel = label
  }

  // UIKit exposes no view for a plain UIBarButtonItem; the identifier it forwards
  // onto its backing button is the only public handle on the item's geometry.
  // Anything positioning itself against the bar must measure this, not the bar's
  // own frame: the glass circles overflow well above `sizeThatFits`'s height.
  func reactionsItemFrame(in view: UIView) -> CGRect? {
    guard socialActionsEnabled,
          let itemView = firstDescendant(withAccessibilityIdentifier: Self.reactionsAccessibilityIdentifier)
    else { return nil }
    return itemView.convert(itemView.bounds, to: view)
  }

  private func firstDescendant(withAccessibilityIdentifier identifier: String) -> UIView? {
    var queue = subviews
    while !queue.isEmpty {
      let candidate = queue.removeFirst()
      if candidate.accessibilityIdentifier == identifier {
        return candidate
      }
      queue.append(contentsOf: candidate.subviews)
    }
    return nil
  }

  // Bar items have no badge API, so the badge is an overlay pinned to the item's
  // own glass circle at 45°, read back from the laid-out item rather than guessed.
  private func layoutCommentBadge() {
    guard socialActionsEnabled,
          !commentBadge.isHidden,
          let itemView = firstDescendant(withAccessibilityIdentifier: Self.commentsAccessibilityIdentifier)
    else {
      commentBadge.isHidden = true
      return
    }

    let itemFrame = itemView.convert(itemView.bounds, to: self)
    let diagonal = min(itemFrame.width, itemFrame.height) / 2 / CGFloat(2).squareRoot()
    let anchor = CGPoint(x: itemFrame.midX + diagonal, y: itemFrame.midY - diagonal)
    let size = commentBadge.badgeSize
    commentBadge.frame = CGRect(
      x: anchor.x - size.width / 2,
      y: anchor.y - size.height / 2,
      width: size.width,
      height: size.height
    )
    commentBadge.layer.cornerRadius = size.height / 2
  }

  // Adjacency is what merges a glass background in a UIToolbar; a flexible space
  // between two items breaks it. Info and comments sit next to each other so they
  // read as one surface, with share and reactions spaced off to their own circles.
  private func updateItems() {
    var barItems: [UIBarButtonItem] = [shareItem, .flexibleSpace(), infoItem]
    if socialActionsEnabled {
      barItems += [commentsItem, .flexibleSpace(), reactionsItem]
    }
    setItems(barItems, animated: false)
    commentBadge.isEnabledForBar = socialActionsEnabled
    setNeedsLayout()
  }
}

private final class PhotoDetailCommentBadge: UILabel {
  private static let minHeight: CGFloat = 16
  private static let horizontalPadding: CGFloat = 5

  var count = 0 {
    didSet { updateVisibility() }
  }

  var isEnabledForBar = false {
    didSet { updateVisibility() }
  }

  var badgeSize: CGSize {
    let height = Self.minHeight
    return CGSize(width: max(height, intrinsicContentSize.width + Self.horizontalPadding * 2), height: height)
  }

  init() {
    super.init(frame: .zero)

    backgroundColor = .systemRed
    clipsToBounds = true
    font = .monospacedDigitSystemFont(
      ofSize: UIFont.preferredFont(forTextStyle: .caption2).pointSize,
      weight: .semibold
    )
    isAccessibilityElement = false
    isHidden = true
    layer.cornerCurve = .continuous
    textAlignment = .center
    textColor = .white
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  private func updateVisibility() {
    text = count > 99 ? "99+" : "\(count)"
    isHidden = !(isEnabledForBar && count > 0)
    superview?.setNeedsLayout()
  }
}
