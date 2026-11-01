import UIKit

final class ExhibitionHeroView: UIView {
  let opener = ExhibitionOpenerView()
  let header = ContactSheetHeaderView()
  var topInset: CGFloat = 100 {
    didSet { setNeedsLayout() }
  }

  var availableHeight: CGFloat = 844

  override init(frame: CGRect) {
    super.init(frame: frame)
    addSubview(opener)
    addSubview(header)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func cardFrame(width: CGFloat) -> CGRect {
    let cardWidth = width - 24
    let natural = cardWidth * 470 / 366
    let height = min(natural, max(320, availableHeight * 0.6))
    return CGRect(x: 12, y: topInset, width: cardWidth, height: height)
  }

  var headerTop: CGFloat {
    cardFrame(width: bounds.width).maxY + 16 + ExhibitionOpenerView.captionHeight + 30
  }

  func height(for width: CGFloat) -> CGFloat {
    let card = cardFrame(width: width)
    let headerTop = card.maxY + 16 + ExhibitionOpenerView.captionHeight + 30
    return headerTop + header.height(for: width - 24) + 22
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let card = cardFrame(width: bounds.width)
    opener.frame = CGRect(x: 0, y: 0, width: bounds.width, height: card.maxY + 16 + ExhibitionOpenerView.captionHeight)
    opener.cardFrame = card
    let top = headerTop
    header.frame = CGRect(x: 16, y: top, width: bounds.width - 24, height: header.height(for: bounds.width - 24))
  }
}
