import UIKit

final class ViewingStateView: UIView {
  struct Content: Equatable {
    var title: String?
    var message: String?
    var action: String?
    var isLoading = false
    var glyph: AFGlyph?

    static let loading = Content(isLoading: true)
  }

  var onAction: (() -> Void)?

  private let stack = UIStackView()
  private let glyphView = AFGlyphView()
  private let spinner = UIActivityIndicatorView(style: .medium)
  private let titleLabel = AFLabel.ui(size: 15, weight: .medium, color: AFColor.textSecondary)
  private let messageLabel = AFLabel.ui(size: 13, color: AFColor.textTertiary)
  private let button = UIButton(type: .system)
  private var centerConstraint: NSLayoutConstraint?
  private var topConstraint: NSLayoutConstraint?

  var topInset: CGFloat = 0 {
    didSet {
      centerConstraint?.constant = topInset / 2 - 36
      topConstraint?.constant = topInset + 24
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    spinner.color = AFColor.textTertiary
    titleLabel.font = AFFont.ui(size: 15, weight: .medium, relativeTo: .subheadline)
    messageLabel.font = AFFont.ui(size: 13, relativeTo: .footnote)
    for label in [titleLabel, messageLabel] {
      label.numberOfLines = 0
      label.textAlignment = .center
    }
    var configuration = UIButton.Configuration.filled()
    configuration.cornerStyle = .capsule
    configuration.baseBackgroundColor = AFColor.textPrimary
    configuration.baseForegroundColor = AFColor.onLight
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 9, leading: 16, bottom: 9, trailing: 16)
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
      var updated = attributes
      updated.font = AFFont.ui(size: 14, weight: .medium, relativeTo: .subheadline)
      return updated
    }
    button.configuration = configuration
    button.addAction(UIAction { [weak self] _ in self?.onAction?() }, for: .touchUpInside)
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 8
    stack.translatesAutoresizingMaskIntoConstraints = false
    glyphView.isHidden = true
    [glyphView, spinner, titleLabel, messageLabel, button].forEach(stack.addArrangedSubview)
    stack.setCustomSpacing(20, after: glyphView)
    stack.setCustomSpacing(18, after: messageLabel)
    addSubview(stack)
    let center = stack.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -36)
    center.priority = .defaultHigh
    centerConstraint = center
    let top = stack.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: 24)
    topConstraint = top
    NSLayoutConstraint.activate([
      center,
      top,
      stack.centerXAnchor.constraint(equalTo: centerXAnchor),
      stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 32),
      stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -32),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func apply(_ content: Content?) {
    isHidden = content == nil
    guard let content else {
      spinner.stopAnimating()
      return
    }
    glyphView.glyph = content.isLoading ? nil : content.glyph
    content.isLoading ? spinner.startAnimating() : spinner.stopAnimating()
    spinner.isHidden = !content.isLoading
    titleLabel.text = content.title
    titleLabel.isHidden = content.title == nil
    messageLabel.text = content.message
    messageLabel.isHidden = content.message == nil
    button.configuration?.title = content.action
    button.isHidden = content.action == nil
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }
}
