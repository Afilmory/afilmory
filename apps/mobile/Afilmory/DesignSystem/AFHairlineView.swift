import UIKit

final class AFHairlineView: UIView {
  override init(frame: CGRect) {
    super.init(frame: frame)
    translatesAutoresizingMaskIntoConstraints = false
    backgroundColor = AFColor.hairline
    registerForTraitChanges([UITraitDisplayScale.self]) { (view: AFHairlineView, _: UITraitCollection) in
      view.invalidateIntrinsicContentSize()
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var intrinsicContentSize: CGSize {
    CGSize(width: UIView.noIntrinsicMetric, height: 1 / max(1, traitCollection.displayScale))
  }
}
