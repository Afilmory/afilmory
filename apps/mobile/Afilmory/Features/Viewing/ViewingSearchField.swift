import UIKit

final class ViewingSearchField: UIView, UITextFieldDelegate {
  static let height: CGFloat = 44

  var onChange: ((String) -> Void)?
  let textField = UITextField()
  private let icon = UIImageView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = AFColor.filmBase
    layer.cornerRadius = Self.height / 2
    layer.cornerCurve = .continuous
    icon.image = UIImage(systemName: "magnifyingglass", withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .regular))
    icon.tintColor = AFColor.textTertiary
    icon.contentMode = .scaleAspectFit
    icon.translatesAutoresizingMaskIntoConstraints = false
    textField.font = UIFontMetrics(forTextStyle: .body).scaledFont(for: AFFont.exhibitUser(size: 16), maximumPointSize: 21)
    textField.adjustsFontForContentSizeCategory = true
    textField.textColor = AFColor.textPrimary
    textField.tintColor = AFColor.textPrimary
    textField.attributedPlaceholder = NSAttributedString(
      string: String(localized: "Search galleries or photographers"),
      attributes: [.foregroundColor: AFColor.textTertiary, .font: UIFontMetrics(forTextStyle: .body).scaledFont(for: AFFont.ui(size: 15), maximumPointSize: 20)]
    )
    textField.accessibilityLabel = String(localized: "Search galleries or photographers")
    textField.returnKeyType = .search
    textField.clearButtonMode = .whileEditing
    textField.autocorrectionType = .no
    textField.autocapitalizationType = .none
    textField.keyboardAppearance = .dark
    textField.delegate = self
    textField.translatesAutoresizingMaskIntoConstraints = false
    textField.addAction(UIAction { [weak self] _ in
      self?.onChange?(self?.textField.text ?? "")
    }, for: .editingChanged)
    addSubview(icon)
    addSubview(textField)
    NSLayoutConstraint.activate([
      icon.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
      icon.widthAnchor.constraint(equalToConstant: 18),
      icon.heightAnchor.constraint(equalToConstant: 18),
      icon.centerYAnchor.constraint(equalTo: centerYAnchor),
      textField.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 8),
      textField.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
      textField.topAnchor.constraint(equalTo: topAnchor),
      textField.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func setText(_ text: String) {
    textField.text = text
  }

  func textFieldShouldReturn(_ textField: UITextField) -> Bool {
    textField.resignFirstResponder()
    return true
  }
}
