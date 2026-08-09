import UIKit

extension LivePhotoPlaybackMode {
  var symbolName: String {
    switch self {
    case .live:
      return "livephoto"
    case .loop:
      return "livephoto.loop"
    case .bounce:
      return "livephoto.bounce"
    case .off:
      return "livephoto.slash"
    }
  }
}

struct LivePhotoBadgeStrings {
  var badgeLive = "LIVE"
  var badgeLoop = "LOOP"
  var badgeBounce = "BOUNCE"
  var badgeOff = "LIVE OFF"
  var menuLive = "Live"
  var menuLoop = "Loop"
  var menuBounce = "Bounce"
  var menuOff = "Live Off"
  var accessibilityLabel = "Live Photo"
  var accessibilityHint = ""

  func caption(for mode: LivePhotoPlaybackMode) -> String {
    switch mode {
    case .live:
      return badgeLive
    case .loop:
      return badgeLoop
    case .bounce:
      return badgeBounce
    case .off:
      return badgeOff
    }
  }

  func menuTitle(for mode: LivePhotoPlaybackMode) -> String {
    switch mode {
    case .live:
      return menuLive
    case .loop:
      return menuLoop
    case .bounce:
      return menuBounce
    case .off:
      return menuOff
    }
  }
}

/// Mirrors the playback-mode capsule the Photos app shows over a Live Photo.
/// Geometry comes from that badge's measured metrics: a 19–20pt capsule inset
/// 16pt from the leading edge, holding a 13.5pt glyph, an 11.5pt caption and a
/// trailing chevron.
final class LivePhotoBadgeView: UIButton {
  private static let capsuleHeight: CGFloat = 20
  private static let glyphSize: CGFloat = 13.5
  private static let glyphPointSize: CGFloat = 10
  private static let captionPointSize: CGFloat = 11.5
  private static let chevronSize: CGFloat = 8
  private static let leadingInset: CGFloat = 7
  private static let trailingInset: CGFloat = 8
  private static let glyphSpacing: CGFloat = 4
  private static let chevronSpacing: CGFloat = 3
  private static let foreground = UIColor.white.withAlphaComponent(0.75)

  // `.clear` reads as truer glass but adds no dimming, and the 75%-white caption
  // loses the backdrop over a saturated frame. `.regular` is what the rest of the
  // chrome floats on.
  private let backgroundView = UIVisualEffectView(
    effect: AdaptiveGlass.effect(fallbackStyle: .systemThinMaterialDark)
  )
  private let glyphView = UIImageView()
  private let captionLabel = UILabel()
  private let chevronView = UIImageView()

  var onSelectMode: ((LivePhotoPlaybackMode) -> Void)?

  var strings = LivePhotoBadgeStrings() {
    didSet { applyMode() }
  }

  private(set) var mode: LivePhotoPlaybackMode = .live

  override init(frame: CGRect) {
    super.init(frame: frame)

    backgroundView.isUserInteractionEnabled = false
    backgroundView.clipsToBounds = true
    backgroundView.layer.cornerCurve = .continuous
    addSubview(backgroundView)

    glyphView.tintColor = Self.foreground
    glyphView.contentMode = .center
    addSubview(glyphView)

    captionLabel.font = .systemFont(ofSize: Self.captionPointSize, weight: .regular)
    captionLabel.textColor = Self.foreground
    addSubview(captionLabel)

    chevronView.tintColor = Self.foreground
    chevronView.contentMode = .center
    chevronView.image = UIImage(
      systemName: "chevron.down",
      withConfiguration: UIImage.SymbolConfiguration(
        pointSize: Self.chevronSize,
        weight: .semibold
      )
    )
    addSubview(chevronView)

    showsMenuAsPrimaryAction = true
    applyMode()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  func setMode(_ newMode: LivePhotoPlaybackMode) {
    guard newMode != mode else { return }
    mode = newMode
    applyMode()
  }

  override var intrinsicContentSize: CGSize {
    sizeThatFits(.zero)
  }

  override func sizeThatFits(_ size: CGSize) -> CGSize {
    let caption = captionLabel.intrinsicContentSize.width
    let width =
      Self.leadingInset + Self.glyphSize + Self.glyphSpacing + caption
      + Self.chevronSpacing + Self.chevronSize + Self.trailingInset
    return CGSize(width: ceil(width), height: Self.capsuleHeight)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    backgroundView.frame = bounds
    backgroundView.layer.cornerRadius = bounds.height / 2

    var x = Self.leadingInset
    glyphView.frame = CGRect(x: x, y: 0, width: Self.glyphSize, height: bounds.height)
    x += Self.glyphSize + Self.glyphSpacing

    let caption = captionLabel.intrinsicContentSize.width
    captionLabel.frame = CGRect(x: x, y: 0, width: caption, height: bounds.height)
    x += caption + Self.chevronSpacing

    chevronView.frame = CGRect(x: x, y: 0, width: Self.chevronSize, height: bounds.height)
  }

  private func applyMode() {
    glyphView.image = UIImage(
      systemName: mode.symbolName,
      withConfiguration: UIImage.SymbolConfiguration(
        pointSize: Self.glyphPointSize,
        weight: .regular
      )
    )
    captionLabel.text = strings.caption(for: mode)
    accessibilityLabel = strings.accessibilityLabel
    accessibilityHint = strings.accessibilityHint
    menu = makeMenu()
    invalidateIntrinsicContentSize()
    setNeedsLayout()
  }

  private func makeMenu() -> UIMenu {
    let actions = LivePhotoPlaybackMode.allCases.map { candidate in
      UIAction(
        title: strings.menuTitle(for: candidate),
        image: UIImage(systemName: candidate.symbolName),
        state: candidate == mode ? .on : .off
      ) { [weak self] _ in
        guard let self else { return }
        self.setMode(candidate)
        self.onSelectMode?(candidate)
      }
    }
    return UIMenu(children: actions)
  }
}
