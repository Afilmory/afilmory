import UIKit

final class ExhibitionHeroView: UIView {
  let opener = ExhibitionOpenerView()
  let header = ContactSheetHeaderView()
  var topInset: CGFloat = 100 {
    didSet { setNeedsLayout() }
  }

  var availableHeight: CGFloat = 844

  var spread: (left: CGRect, right: CGRect)? {
    didSet { setNeedsLayout() }
  }

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
    let page = spread?.left ?? CGRect(x: 0, y: 0, width: width, height: 0)
    let cardWidth = page.width - 24
    let natural = cardWidth * 470 / 366
    let height = min(natural, max(320, availableHeight * 0.6))
    return CGRect(x: page.minX + 12, y: topInset, width: cardWidth, height: height)
  }

  var headerTop: CGFloat {
    headerFrame(width: bounds.width).minY
  }

  private func headerFrame(width: CGFloat) -> CGRect {
    if let spread {
      let headerWidth = spread.right.width - 24
      return CGRect(x: spread.right.minX + 16, y: topInset + 8, width: headerWidth, height: header.height(for: headerWidth))
    }
    let top = cardFrame(width: width).maxY + 16 + ExhibitionOpenerView.captionHeight + 30
    return CGRect(x: 16, y: top, width: width - 24, height: header.height(for: width - 24))
  }

  private func openerFrame(width: CGFloat) -> CGRect {
    let card = cardFrame(width: width)
    return CGRect(x: 0, y: 0, width: spread?.left.maxX ?? width, height: card.maxY + 16 + ExhibitionOpenerView.captionHeight)
  }

  func height(for width: CGFloat) -> CGFloat {
    max(openerFrame(width: width).maxY, headerFrame(width: width).maxY) + 22
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    opener.frame = openerFrame(width: bounds.width)
    opener.cardFrame = cardFrame(width: bounds.width)
    header.frame = headerFrame(width: bounds.width)
  }
}
