import UIKit

final class ExhibitionStateView: UIView {
  enum Kind: Equatable {
    case loading
    case emptyOwn
    case emptyGallery
    case filteredEmpty
    case offline
    case unavailable
  }

  var onAction: ((Kind) -> Void)?

  private let symbol = UIImageView()
  private let titleLabel = AFLabel.exhibit(size: 26)
  private let bodyLabel = AFLabel.ui(size: 15)
  private let button = UIButton(configuration: .filled())
  private let spinner = UIActivityIndicatorView(style: .medium)
  private(set) var kind: Kind = .loading

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    symbol.tintColor = AFColor.textTertiary
    symbol.contentMode = .scaleAspectFit
    titleLabel.numberOfLines = 0
    titleLabel.textAlignment = .center
    titleLabel.accessibilityTraits = .header
    bodyLabel.numberOfLines = 0
    bodyLabel.textAlignment = .center
    bodyLabel.font = AFFont.ui(size: 15, relativeTo: .body)
    spinner.color = AFColor.textTertiary
    var configuration = UIButton.Configuration.filled()
    configuration.baseBackgroundColor = AFColor.textPrimary
    configuration.baseForegroundColor = AFColor.onLight
    configuration.cornerStyle = .capsule
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 13, leading: 22, bottom: 13, trailing: 22)
    button.configuration = configuration
    button.addAction(UIAction { [weak self] _ in
      guard let self else { return }
      onAction?(kind)
    }, for: .primaryActionTriggered)
    let stack = UIStackView(arrangedSubviews: [symbol, spinner, titleLabel, bodyLabel, button])
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 12
    stack.setCustomSpacing(22, after: bodyLabel)
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      symbol.heightAnchor.constraint(equalToConstant: 34),
      symbol.widthAnchor.constraint(equalToConstant: 34),
      stack.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -20),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 36),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -36),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func show(_ kind: Kind) {
    self.kind = kind
    let content = Self.content(kind)
    symbol.image = content.symbol.flatMap { UIImage(systemName: $0, withConfiguration: UIImage.SymbolConfiguration(pointSize: 28, weight: .light)) }
    symbol.isHidden = content.symbol == nil
    titleLabel.text = content.title
    titleLabel.isHidden = content.title == nil
    bodyLabel.text = content.body
    bodyLabel.isHidden = content.body == nil
    button.configuration?.title = content.action
    button.isHidden = content.action == nil
    kind == .loading ? spinner.startAnimating() : spinner.stopAnimating()
    spinner.isHidden = kind != .loading
    accessibilityElements = [titleLabel, bodyLabel, button].filter { !$0.isHidden }
  }

  private static func content(_ kind: Kind) -> (symbol: String?, title: String?, body: String?, action: String?) {
    switch kind {
    case .loading:
      (nil, nil, nil, nil)
    case .emptyOwn:
      ("camera.aperture", String(localized: "Nothing on the walls yet"), String(localized: "Develop your first photos in the Darkroom and they open here."), String(localized: "Go to the Darkroom"))
    case .emptyGallery:
      ("camera.aperture", String(localized: "Nothing on the walls yet"), String(localized: "This gallery hasn't published any photos."), nil)
    case .filteredEmpty:
      ("line.3.horizontal.decrease.circle", String(localized: "No frames match"), String(localized: "Try a different search or clear the filters."), String(localized: "Clear filters"))
    case .offline:
      ("wifi.slash", String(localized: "The exhibition is out of reach"), String(localized: "Check your connection and try again."), String(localized: "Try Again"))
    case .unavailable:
      ("hourglass", String(localized: "Your gallery is being prepared"), String(localized: "Photos appear here once your workspace is ready."), nil)
    }
  }
}
