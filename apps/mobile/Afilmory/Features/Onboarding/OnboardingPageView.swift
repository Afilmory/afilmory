import UIKit

final class OnboardingPageView: UIView {
  let content = UIStackView()
  let actions = UIStackView()
  private let scroll = UIScrollView()

  init(title: String, lead: String?) {
    super.init(frame: .zero)
    backgroundColor = AFColor.ground

    let titleLabel = AFLabel.exhibit(title, size: 30)
    titleLabel.font = AFFont.exhibit(size: 30, relativeTo: .title1)
    titleLabel.numberOfLines = 0
    titleLabel.accessibilityTraits = .header
    content.addArrangedSubview(titleLabel)
    if let lead {
      let leadLabel = AFLabel.ui(lead, size: 15)
      leadLabel.font = AFFont.ui(size: 15, relativeTo: .body)
      leadLabel.numberOfLines = 0
      content.addArrangedSubview(leadLabel)
      content.setCustomSpacing(10, after: titleLabel)
      content.setCustomSpacing(26, after: leadLabel)
    } else {
      content.setCustomSpacing(26, after: titleLabel)
    }
    content.axis = .vertical
    content.spacing = 14
    content.alignment = .fill
    actions.axis = .vertical
    actions.spacing = 12

    scroll.alwaysBounceVertical = false
    scroll.showsVerticalScrollIndicator = false
    for view in [scroll, actions, content] as [UIView] {
      view.translatesAutoresizingMaskIntoConstraints = false
    }
    addSubview(scroll)
    addSubview(actions)
    scroll.addSubview(content)

    let column = UILayoutGuide()
    addLayoutGuide(column)
    let fullWidth = column.widthAnchor.constraint(equalTo: widthAnchor)
    fullWidth.priority = .defaultHigh
    let contentWidth = content.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48)
    contentWidth.priority = UILayoutPriority(999)
    NSLayoutConstraint.activate([
      column.centerXAnchor.constraint(equalTo: centerXAnchor),
      column.widthAnchor.constraint(lessThanOrEqualToConstant: 480),
      fullWidth,
      scroll.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
      scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
      scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
      scroll.bottomAnchor.constraint(equalTo: actions.topAnchor, constant: -12),
      scroll.contentLayoutGuide.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
      content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 40),
      content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -8),
      content.centerXAnchor.constraint(equalTo: scroll.contentLayoutGuide.centerXAnchor),
      content.widthAnchor.constraint(lessThanOrEqualToConstant: 432),
      contentWidth,
      actions.leadingAnchor.constraint(equalTo: column.leadingAnchor, constant: 24),
      actions.trailingAnchor.constraint(equalTo: column.trailingAnchor, constant: -24),
      actions.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -8),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
}
