import UIKit

class ContactSheetBaseCell: UICollectionViewCell {
  override func prepareForReuse() {
    super.prepareForReuse()
    contentView.alpha = 1
    contentView.transform = .identity
  }
}

final class ContactSheetYearCell: ContactSheetBaseCell {
  static let reuseID = "year"
  private let label = AFLabel.mono(size: 11, color: AFColor.textPrimary)
  private let rule = UIView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    label.translatesAutoresizingMaskIntoConstraints = true
    rule.backgroundColor = AFColor.divider
    contentView.addSubview(label)
    contentView.addSubview(rule)
    isAccessibilityElement = true
    accessibilityTraits = .header
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func configure(year: Int) {
    label.attributedText = NSAttributedString(string: String(year), attributes: [.kern: 1.1])
    accessibilityLabel = String(year)
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let size = label.sizeThatFits(contentView.bounds.size)
    label.frame = CGRect(x: 16, y: (contentView.bounds.height - size.height) / 2, width: size.width, height: size.height)
    rule.frame = CGRect(x: label.frame.maxX + 10, y: contentView.bounds.midY, width: contentView.bounds.width - label.frame.maxX - 26, height: 1)
  }
}

final class ContactSheetRowCell: ContactSheetBaseCell {
  static let reuseID = "row"
  var onOpen: ((String) -> Void)?

  private let scroller = UIScrollView()
  private var imageViews: [String: UIImageView] = [:]

  override init(frame: CGRect) {
    super.init(frame: frame)
    scroller.showsHorizontalScrollIndicator = false
    scroller.alwaysBounceHorizontal = false
    scroller.alwaysBounceVertical = false
    scroller.isDirectionalLockEnabled = true
    scroller.contentInsetAdjustmentBehavior = .never
    scroller.contentInset = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)
    scroller.scrollsToTop = false
    contentView.addSubview(scroller)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    scroller.frame = contentView.bounds
    scroller.contentSize.height = scroller.bounds.height
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    scroller.subviews.forEach { $0.removeFromSuperview() }
    imageViews.removeAll()
  }

  func imageView(for photoID: String) -> UIImageView? {
    imageViews[photoID]
  }

  var photoIDs: [String] { Array(imageViews.keys) }

  func configure(groups: [ContactSheetGroup], level: ContactSheetLevel, photos: [String: GalleryPhoto]) {
    scroller.subviews.forEach { $0.removeFromSuperview() }
    imageViews.removeAll()
    let frameHeight = ContactSheetLayout.frameHeight(for: level)
    var x: CGFloat = 0
    for group in groups {
      let label = AFLabel.mono(size: 10)
      label.translatesAutoresizingMaskIntoConstraints = true
      label.attributedText = NSAttributedString(string: Self.title(for: group), attributes: [.kern: 0.6])
      label.isAccessibilityElement = false
      label.frame = CGRect(x: x, y: 0, width: max(group.stripWidth, label.intrinsicContentSize.width), height: ContactSheetLayout.groupLabelHeight)
      scroller.addSubview(label)
      let strip = UIView(frame: CGRect(
        x: x,
        y: ContactSheetLayout.groupLabelHeight + ContactSheetLayout.labelGap,
        width: group.stripWidth,
        height: frameHeight + ContactSheetLayout.frameNumberHeight * 2
      ))
      strip.backgroundColor = AFColor.filmBase
      scroller.addSubview(strip)
      var frameX = ContactSheetLayout.stripPadding
      for frame in group.frames {
        guard let photo = photos[frame.photoID] else { continue }
        let button = makeFrame(photo: photo, frame: frame, height: frameHeight)
        button.frame = CGRect(x: frameX, y: 0, width: frame.width, height: strip.bounds.height)
        strip.addSubview(button)
        frameX += frame.width + ContactSheetLayout.frameGap
      }
      x += max(group.stripWidth, label.frame.width) + ContactSheetLayout.groupGap
    }
    scroller.contentSize = CGSize(width: max(0, x - ContactSheetLayout.groupGap), height: scroller.bounds.height)
    scroller.contentOffset = CGPoint(x: -scroller.contentInset.left, y: 0)
  }

  private func makeFrame(photo: GalleryPhoto, frame: ContactSheetFrame, height: CGFloat) -> UIButton {
    let button = UIButton(type: .custom)
    let number = ExhibitFormat.frameNumber(frame.number)
    button.accessibilityLabel = String(localized: "Open No. \(number)")
    button.addAction(UIAction { [weak self] _ in self?.onOpen?(frame.photoID) }, for: .primaryActionTriggered)
    let numberLabel = UILabel(frame: CGRect(x: 0, y: 0, width: frame.width, height: ContactSheetLayout.frameNumberHeight))
    numberLabel.font = AFFont.mono(size: 8)
    numberLabel.textColor = AFColor.textTertiary
    numberLabel.text = "▸\(number)"
    numberLabel.isAccessibilityElement = false
    let image = UIImageView(frame: CGRect(x: 0, y: ContactSheetLayout.frameNumberHeight, width: frame.width, height: height))
    image.contentMode = .scaleAspectFill
    image.clipsToBounds = true
    image.backgroundColor = AFColor.fill
    image.isUserInteractionEnabled = false
    image.afSetPhoto(photo, targetWidth: frame.width)
    button.addSubview(numberLabel)
    button.addSubview(image)
    imageViews[photo.id] = image
    return button
  }

  private static func title(for group: ContactSheetGroup) -> String {
    let base = group.key == ContactSheetGroup.undatedKey ? String(localized: "Undated") : group.title
    return group.frames.count > 1 ? String(localized: "\(base) · \(group.frames.count) frames") : base
  }
}
