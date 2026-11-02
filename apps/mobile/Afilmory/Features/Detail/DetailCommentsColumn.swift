import SwiftUI
import UIKit

final class DetailCommentsColumn: UIView {
  let store: CommentsStore
  let host: UIHostingController<PhotoCommentsSheetView>
  private(set) lazy var closeButton = AFGlassButton.titled(String(localized: "Info"), symbol: "chevron.left") { [weak self] in
    self?.onClose?()
  }

  var onClose: (() -> Void)?
  private let titleLabel = AFLabel.exhibit(String(localized: "Comments"), size: 22)

  init(store: CommentsStore) {
    self.store = store
    host = UIHostingController(rootView: PhotoCommentsSheetView(store: store))
    super.init(frame: .zero)
    backgroundColor = AFColor.raised
    layer.cornerRadius = AFRadius.sheet
    layer.cornerCurve = .continuous
    clipsToBounds = true
    host.view.backgroundColor = .clear
    host.safeAreaRegions = []
    titleLabel.accessibilityTraits = .header
    [closeButton, titleLabel, host.view].forEach(addSubview)
    keyboardLayoutGuide.usesBottomSafeArea = false
    hostTop.constant = 14 + 44 + 10 + titleLabel.font.lineHeight + 4 + 12
    host.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      host.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      host.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      hostTop,
      host.view.bottomAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor),
    ])
  }

  private lazy var hostTop = host.view.topAnchor.constraint(equalTo: topAnchor)

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let buttonSize = closeButton.sizeThatFits(CGSize(width: bounds.width, height: 44))
    closeButton.frame = CGRect(x: 14, y: 14, width: buttonSize.width, height: 44)
    titleLabel.frame = CGRect(x: 22, y: closeButton.frame.maxY + 10, width: bounds.width - 44, height: titleLabel.font.lineHeight + 4)
  }
}

extension PhotoDetailViewController {
  func openComments(store: CommentsStore) {
    guard duoSplit != nil, !isFullScreen else {
      let sheet = CommentsSheetPresenter.make(store: store) { [weak self] count in
        self?.social.commentCount.setCount(count)
      }
      present(sheet, animated: true)
      return
    }
    closeCommentsColumn()
    let column = DetailCommentsColumn(store: store)
    column.onClose = { [weak self] in self?.closeCommentsColumn() }
    addChild(column.host)
    view.addSubview(column)
    column.host.didMove(toParent: self)
    commentsColumn = column
    sheet.isHidden = true
    view.setNeedsLayout()
    UIAccessibility.post(notification: .screenChanged, argument: column)
  }

  func closeCommentsColumn() {
    guard let column = commentsColumn else { return }
    social.commentCount.setCount(column.store.result.commentCount)
    column.host.willMove(toParent: nil)
    column.removeFromSuperview()
    column.host.removeFromParent()
    commentsColumn = nil
    sheet.isHidden = false
    view.setNeedsLayout()
  }
}
