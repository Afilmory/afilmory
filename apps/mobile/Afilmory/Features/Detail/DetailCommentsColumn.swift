import SwiftUI
import UIKit

final class DetailCommentsColumn: UIView {
  let store: CommentsStore
  let host: UIHostingController<PhotoCommentsSheetView>
  let closeButton: UIButton
  var onClose: (() -> Void)?
  private let titleLabel: UILabel

  init(store: CommentsStore, accent: UIColor = AFColor.accentFallback, count: Int? = nil) {
    self.store = store
    host = UIHostingController(rootView: PhotoCommentsSheetView(store: store, style: .flat))
    var back = UIButton.Configuration.plain()
    back.attributedTitle = AttributedString("‹ " + String(localized: "Info"), attributes: AttributeContainer([.font: AFFont.ui(size: 15)]))
    back.baseForegroundColor = accent
    back.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 0, bottom: 10, trailing: 12)
    closeButton = UIButton(configuration: back)
    closeButton.accessibilityLabel = String(localized: "Info")
    titleLabel = AFLabel.exhibit(count.map { String(localized: "Comments · \($0)") } ?? String(localized: "Comments"), size: 26)
    super.init(frame: .zero)
    closeButton.addAction(UIAction { [weak self] _ in self?.onClose?() }, for: .primaryActionTriggered)
    backgroundColor = AFColor.ground
    host.view.backgroundColor = .clear
    host.safeAreaRegions = []
    titleLabel.accessibilityTraits = .header
    [closeButton, titleLabel, host.view].forEach(addSubview)
    keyboardLayoutGuide.usesBottomSafeArea = false
    hostTop.constant = Self.titleTop + titleLabel.font.lineHeight + 14
    host.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      host.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      host.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      hostTop,
      host.view.bottomAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor),
    ])
  }

  private static let titleTop: CGFloat = 26 + 44 + 6
  private lazy var hostTop = host.view.topAnchor.constraint(equalTo: topAnchor)

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let buttonSize = closeButton.sizeThatFits(CGSize(width: bounds.width, height: 44))
    closeButton.frame = CGRect(x: 22, y: 26, width: buttonSize.width, height: 44)
    titleLabel.frame = CGRect(x: 22, y: Self.titleTop, width: bounds.width - 44, height: titleLabel.font.lineHeight + 4)
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
    let column = DetailCommentsColumn(store: store, accent: infoColumn.accent, count: infoColumn.commentCount)
    column.onClose = { [weak self] in self?.closeCommentsColumn() }
    addChild(column.host)
    view.addSubview(column)
    column.host.didMove(toParent: self)
    commentsColumn = column
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
    view.setNeedsLayout()
  }
}
