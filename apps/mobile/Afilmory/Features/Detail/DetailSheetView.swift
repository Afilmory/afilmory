import UIKit

final class DetailSheetView: UIView, UIScrollViewDelegate {
  var onToggle: (() -> Void)?
  var onCollapseRequest: (() -> Void)?
  var onOpenLocation: (() -> Void)?
  var onOpenComments: (() -> Void)?

  let header = DetailSheetHeaderView()
  let content = UIView()
  private let grabber = UIButton(type: .custom)
  private let headerButton = UIButton(type: .custom)
  private let scroller = UIScrollView()
  private let stack = UIStackView()
  private var toneBars: [UIView] = []
  private var commentsRow: UIButton?
  private var commentCount: Int?
  private(set) var expandedProgress: CGFloat = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = AFColor.sheet
    layer.cornerRadius = AFRadius.sheet
    layer.cornerCurve = .continuous
    layer.borderWidth = 1
    layer.borderColor = AFColor.textPrimary.withAlphaComponent(0.08).cgColor
    layer.shadowColor = UIColor.black.cgColor
    layer.shadowOpacity = 0.45
    layer.shadowRadius = 20
    layer.shadowOffset = CGSize(width: 0, height: -18)
    content.clipsToBounds = true
    content.layer.cornerRadius = AFRadius.sheet
    content.layer.cornerCurve = .continuous
    addSubview(content)
    let handle = UIView(frame: CGRect(x: 0, y: 0, width: 36, height: 5))
    handle.backgroundColor = AFColor.tick
    handle.layer.cornerRadius = 2.5
    handle.isUserInteractionEnabled = false
    handle.tag = 7
    grabber.addSubview(handle)
    grabber.addAction(UIAction { [weak self] _ in self?.onToggle?() }, for: .primaryActionTriggered)
    headerButton.addAction(UIAction { [weak self] _ in self?.onToggle?() }, for: .primaryActionTriggered)
    headerButton.isAccessibilityElement = false
    header.isUserInteractionEnabled = true
    scroller.delegate = self
    scroller.alwaysBounceVertical = true
    scroller.showsVerticalScrollIndicator = false
    scroller.contentInset = UIEdgeInsets(top: 4, left: 0, bottom: 36, right: 0)
    stack.axis = .vertical
    stack.spacing = 26
    stack.translatesAutoresizingMaskIntoConstraints = false
    scroller.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: scroller.frameLayoutGuide.leadingAnchor, constant: 22),
      stack.trailingAnchor.constraint(equalTo: scroller.frameLayoutGuide.trailingAnchor, constant: -22),
      stack.topAnchor.constraint(equalTo: scroller.contentLayoutGuide.topAnchor),
      stack.bottomAnchor.constraint(equalTo: scroller.contentLayoutGuide.bottomAnchor),
    ])
    [headerButton, header, grabber, scroller].forEach(content.addSubview)
    setExpanded(progress: 0)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  var headerBottom: CGFloat {
    28 + header.fittingHeight(width: bounds.width - 44)
  }

  func collapsedHeight(width: CGFloat) -> CGFloat {
    max(196, 28 + header.fittingHeight(width: width - 44) + 26)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    content.frame = bounds
    grabber.frame = CGRect(x: 0, y: 0, width: bounds.width, height: 26)
    grabber.viewWithTag(7)?.frame = CGRect(x: (bounds.width - 36) / 2, y: 8, width: 36, height: 5)
    let headerHeight = header.fittingHeight(width: bounds.width - 44)
    header.frame = CGRect(x: 22, y: 28, width: bounds.width - 44, height: headerHeight)
    headerButton.frame = CGRect(x: 0, y: 0, width: bounds.width, height: header.frame.maxY + 10)
    let top = header.frame.maxY + 18
    scroller.frame = CGRect(x: 0, y: top, width: bounds.width, height: max(0, bounds.height - top))
    layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: layer.cornerRadius).cgPath
  }

  func setExpanded(progress: CGFloat) {
    expandedProgress = progress
    scroller.alpha = progress
    scroller.isUserInteractionEnabled = progress > 0.99
    scroller.accessibilityElementsHidden = progress < 0.5
    let expanded = progress > 0.5
    grabber.accessibilityLabel = expanded ? String(localized: "Collapse details") : String(localized: "Expand details")
    grabber.accessibilityTraits = .button
    let radius = AFRadius.sheet
    layer.maskedCorners = expanded
      ? [.layerMinXMinYCorner, .layerMaxXMinYCorner]
      : [.layerMinXMinYCorner, .layerMaxXMinYCorner, .layerMinXMaxYCorner, .layerMaxXMaxYCorner]
    content.layer.maskedCorners = layer.maskedCorners
    layer.cornerRadius = radius
    if !expanded { scroller.contentOffset = CGPoint(x: 0, y: -scroller.contentInset.top) }
    accessibilityElements = [grabber, header] + (expanded ? [scroller] : [])
  }

  func configure(model: DetailSheetModel, accent: UIColor, commentsEnabled: Bool) {
    header.configure(model)
    stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    toneBars.removeAll()
    let rule = UIView()
    rule.backgroundColor = AFColor.divider
    rule.heightAnchor.constraint(equalToConstant: 1).isActive = true
    stack.addArrangedSubview(rule)
    for section in model.sections {
      stack.addArrangedSubview(DetailSectionViews.view(for: section, accent: accent, bars: &toneBars) { [weak self] in self?.onOpenLocation?() })
    }
    if commentsEnabled {
      let row = DetailSectionViews.commentsRow(count: commentCount) { [weak self] in self?.onOpenComments?() }
      commentsRow = row
      stack.addArrangedSubview(row)
    } else {
      commentsRow = nil
    }
    setNeedsLayout()
  }

  func setCommentCount(_ count: Int?) {
    commentCount = count
    if let commentsRow { DetailSectionViews.update(commentsRow: commentsRow, count: count) }
  }

  func setAccent(_ color: UIColor) {
    toneBars.forEach { $0.backgroundColor = color }
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    if scrollView.isTracking, scrollView.contentOffset.y < -70 - scrollView.contentInset.top {
      onCollapseRequest?()
    }
  }
}
