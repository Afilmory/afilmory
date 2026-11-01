import UIKit

final class ViewingChapterHeader: UICollectionReusableView {
  static let reuseID = "ViewingChapterHeader"
  static let topMargin: CGFloat = 22
  static let bottomMargin: CGFloat = 12

  private let dayLabel = AFLabel.exhibit(size: 28)
  private let yearLabel = AFLabel.mono(size: 11)

  static var height: CGFloat {
    ceil(topMargin + dayFont.lineHeight + bottomMargin)
  }

  private static var dayFont: UIFont {
    UIFontMetrics(forTextStyle: .title1).scaledFont(for: AFFont.schola(size: 28), maximumPointSize: 40)
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    dayLabel.font = Self.dayFont
    let stack = UIStackView(arrangedSubviews: [dayLabel, yearLabel])
    stack.axis = .horizontal
    stack.alignment = .firstBaseline
    stack.spacing = 10
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -20),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -Self.bottomMargin),
    ])
    isAccessibilityElement = true
    accessibilityTraits = .header
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func configure(_ chapter: ViewingRollChapter) {
    dayLabel.attributedText = NSAttributedString(string: chapter.monthDay, attributes: [.kern: -0.56])
    yearLabel.text = chapter.year
    accessibilityLabel = [chapter.year, chapter.monthDay].filter { !$0.isEmpty }.joined(separator: ".")
  }
}

final class ViewingSectionLabel: UICollectionReusableView {
  static let reuseID = "ViewingSectionLabel"

  private let label = AFLabel.mono(size: 10)
  private var top: NSLayoutConstraint?

  static func height(topMargin: CGFloat) -> CGFloat {
    ceil(topMargin + font.lineHeight)
  }

  private static var font: UIFont {
    UIFontMetrics(forTextStyle: .caption2).scaledFont(for: AFFont.mono(size: 10, weight: .medium), maximumPointSize: 13)
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    label.font = Self.font
    addSubview(label)
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
      label.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -20),
      label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12),
    ])
    isAccessibilityElement = true
    accessibilityTraits = .header
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func configure(_ text: String) {
    label.attributedText = NSAttributedString(
      string: text.uppercased(with: .current),
      attributes: [.kern: 1.0]
    )
    accessibilityLabel = text
  }
}

final class ViewingLoadingFooter: UICollectionReusableView {
  static let reuseID = "ViewingLoadingFooter"

  private let spinner = UIActivityIndicatorView(style: .medium)

  override init(frame: CGRect) {
    super.init(frame: frame)
    spinner.color = AFColor.textTertiary
    spinner.hidesWhenStopped = true
    spinner.translatesAutoresizingMaskIntoConstraints = false
    addSubview(spinner)
    NSLayoutConstraint.activate([
      spinner.centerXAnchor.constraint(equalTo: centerXAnchor),
      spinner.centerYAnchor.constraint(equalTo: centerYAnchor),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func setLoading(_ loading: Bool) {
    loading ? spinner.startAnimating() : spinner.stopAnimating()
  }
}
