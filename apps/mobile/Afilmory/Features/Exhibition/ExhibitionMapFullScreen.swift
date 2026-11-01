import UIKit

@MainActor
final class ExhibitionMapFullScreen: NSObject {
  var onOpen: ((String) -> Void)?
  var onClosed: (() -> Void)?

  private let card: ExhibitionMapCard
  private let overlay = UIView()
  private let chrome = ExhibitionPassthroughView()
  private let sheet = UIView()
  private lazy var closeButton = AFGlassButton.symbol("xmark", accessibilityLabel: String(localized: "Collapse map")) { [weak self] in
    self?.close()
  }
  private let titleLabel = AFLabel.exhibit("∞", size: 22)
  private lazy var countChip = AFGlassButton.titled("") {}
  private(set) var isOpen = false
  private var sourceFrame: CGRect = .zero
  private(set) var thumbnailViews: [String: UIImageView] = [:]

  init(card: ExhibitionMapCard) {
    self.card = card
    super.init()
  }

  func open(in host: UIView, photos: [GalleryPhoto], numbers: [String: Int]) {
    guard !isOpen else { return }
    isOpen = true
    overlay.frame = host.bounds
    overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    host.addSubview(overlay)
    sourceFrame = card.mapWindow.convert(card.mapWindow.bounds, to: overlay)
    overlay.addSubview(card.mapWindow)
    card.mapWindow.frame = sourceFrame
    card.mapView.frame = card.mapWindow.bounds
    card.mapView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    card.setChromeHidden(true)
    buildChrome(in: host, photos: photos, numbers: numbers)
    AppNavigator.shared.setTabBarHidden(true)
    let reduce = AFMotion.reduceMotion
    chrome.alpha = 0
    sheet.transform = CGAffineTransform(translationX: 0, y: 200)
    sheet.alpha = 0
    let expand = {
      self.card.mapWindow.frame = self.overlay.bounds
      self.card.mapWindow.layer.cornerRadius = 0
      self.card.mapWindow.layer.borderColor = UIColor.clear.cgColor
    }
    if reduce {
      expand()
      UIView.animate(withDuration: 0.2) {
        self.chrome.alpha = 1
        self.sheet.alpha = 1
        self.sheet.transform = .identity
      }
    } else {
      AFMotion.spring(duration: 0.64, damping: 0.9, animations: expand)
      UIView.animate(withDuration: 0.32, delay: 0.3, options: [.allowUserInteraction]) { self.chrome.alpha = 1 }
      AFMotion.spring(duration: 0.56, delay: 0.22, animations: {
        self.sheet.alpha = 1
        self.sheet.transform = .identity
      })
    }
    UIAccessibility.post(notification: .screenChanged, argument: closeButton)
  }

  func close() {
    guard isOpen else { return }
    isOpen = false
    let target = card.mapWindow.superview.map { _ in card.convert(card.mapFrameInSelf, to: overlay) } ?? sourceFrame
    let collapse = {
      self.card.mapWindow.frame = target
      self.card.mapWindow.layer.cornerRadius = AFRadius.card
      self.chrome.alpha = 0
      self.sheet.alpha = 0
      self.sheet.transform = CGAffineTransform(translationX: 0, y: 200)
    }
    let finish: (Bool) -> Void = { _ in
      self.card.dock()
      self.card.setChromeHidden(false)
      self.overlay.removeFromSuperview()
      self.chrome.subviews.forEach { $0.removeFromSuperview() }
      self.sheet.subviews.forEach { $0.removeFromSuperview() }
      self.thumbnailViews.removeAll()
      AppNavigator.shared.setTabBarHidden(false)
      self.onClosed?()
    }
    if AFMotion.reduceMotion {
      UIView.animate(withDuration: 0.2, animations: collapse, completion: finish)
    } else {
      AFMotion.spring(duration: 0.6, damping: 0.92, animations: collapse, completion: finish)
    }
  }

  private func buildChrome(in host: UIView, photos: [GalleryPhoto], numbers: [String: Int]) {
    let safe = host.window?.safeAreaInsets ?? host.safeAreaInsets
    chrome.frame = overlay.bounds
    chrome.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    chrome.isUserInteractionEnabled = true
    overlay.addSubview(chrome)
    let barY = safe.top + 22
    closeButton.frame = CGRect(x: 12, y: barY - 22, width: 44, height: 44)
    titleLabel.translatesAutoresizingMaskIntoConstraints = true
    titleLabel.sizeToFit()
    titleLabel.center = CGPoint(x: overlay.bounds.midX, y: barY)
    titleLabel.accessibilityTraits = .header
    var chipConfiguration = countChip.configuration
    chipConfiguration?.title = ExhibitionMapCard.placesAndFrames(card.model)
    chipConfiguration?.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
      var updated = attributes
      updated.font = AFFont.mono(size: 11)
      return updated
    }
    countChip.configuration = chipConfiguration
    countChip.isUserInteractionEnabled = false
    let chipSize = countChip.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
    countChip.frame = CGRect(x: overlay.bounds.width - 12 - chipSize.width, y: barY - chipSize.height / 2, width: chipSize.width, height: chipSize.height)
    [closeButton, titleLabel, countChip].forEach(chrome.addSubview)
    buildSheet(safeBottom: safe.bottom, photos: photos, numbers: numbers)
    overlay.addSubview(sheet)
  }

  private func buildSheet(safeBottom: CGFloat, photos: [GalleryPhoto], numbers: [String: Int]) {
    let height: CGFloat = 156 + max(0, safeBottom - 20)
    sheet.transform = .identity
    sheet.frame = CGRect(x: 8, y: overlay.bounds.height - 8 - height, width: overlay.bounds.width - 16, height: height)
    sheet.backgroundColor = AFColor.sheet
    sheet.layer.cornerRadius = AFRadius.sheet
    sheet.layer.cornerCurve = .continuous
    sheet.layer.borderWidth = 1
    sheet.layer.borderColor = AFColor.textPrimary.withAlphaComponent(0.08).cgColor
    sheet.layer.shadowColor = UIColor.black.cgColor
    sheet.layer.shadowOpacity = 0.45
    sheet.layer.shadowRadius = 20
    sheet.layer.shadowOffset = CGSize(width: 0, height: -18)
    let title = AFLabel.exhibit(String(localized: "\(card.model.located.count) located frames"), size: 18)
    title.translatesAutoresizingMaskIntoConstraints = true
    title.frame = CGRect(x: 24, y: 20, width: sheet.bounds.width * 0.6, height: 24)
    let detail = AFLabel.mono(String(localized: "\(card.model.unlocatedCount) more without location"), size: 11)
    detail.translatesAutoresizingMaskIntoConstraints = true
    detail.textAlignment = .right
    detail.frame = CGRect(x: sheet.bounds.width * 0.5, y: 22, width: sheet.bounds.width * 0.5 - 24, height: 20)
    detail.isHidden = card.model.unlocatedCount == 0
    let scroller = UIScrollView(frame: CGRect(x: 0, y: 56, width: sheet.bounds.width, height: 84))
    scroller.showsHorizontalScrollIndicator = false
    scroller.contentInset = UIEdgeInsets(top: 0, left: 24, bottom: 0, right: 24)
    let byID = Dictionary(photos.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    var x: CGFloat = 0
    for id in card.model.located {
      guard let photo = byID[id] else { continue }
      let number = ExhibitFormat.frameNumber(numbers[id] ?? 0)
      let button = UIButton(type: .custom, primaryAction: UIAction { [weak self] _ in self?.onOpen?(id) })
      button.frame = CGRect(x: x, y: 0, width: 64, height: 84)
      button.accessibilityLabel = String(localized: "Open No. \(number)")
      let image = UIImageView(frame: CGRect(x: 0, y: 0, width: 64, height: 64))
      image.contentMode = .scaleAspectFill
      image.clipsToBounds = true
      image.layer.cornerRadius = AFRadius.thumb
      image.layer.cornerCurve = .continuous
      image.backgroundColor = AFColor.fill
      image.isUserInteractionEnabled = false
      image.afSetPhoto(photo, targetWidth: 64)
      let label = AFLabel.mono("No. \(number)", size: 10)
      label.translatesAutoresizingMaskIntoConstraints = true
      label.frame = CGRect(x: 0, y: 68, width: 64, height: 14)
      button.addSubview(image)
      button.addSubview(label)
      scroller.addSubview(button)
      thumbnailViews[id] = image
      x += 74
    }
    scroller.contentSize = CGSize(width: max(0, x - 10), height: 84)
    [title, detail, scroller].forEach(sheet.addSubview)
  }

  func sourceView(for photoID: String) -> UIView? {
    guard isOpen else { return nil }
    return thumbnailViews[photoID] ?? card.pinViews()[photoID]?.imageView
  }
}

final class ExhibitionPassthroughView: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }
}
