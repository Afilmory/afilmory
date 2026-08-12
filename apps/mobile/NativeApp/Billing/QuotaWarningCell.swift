import UIKit

final class QuotaWarningCell: UITableViewCell {
  private let titleLabel = UILabel()
  private let detailLabel = UILabel()
  private let meter = UIProgressView(progressViewStyle: .default)

  override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
    super.init(style: style, reuseIdentifier: reuseIdentifier)

    titleLabel.font = .preferredFont(forTextStyle: .body)
    titleLabel.textColor = .systemOrange
    titleLabel.numberOfLines = 0
    detailLabel.font = .preferredFont(forTextStyle: .footnote)
    detailLabel.textColor = .secondaryLabel
    detailLabel.numberOfLines = 0
    meter.progressTintColor = .systemOrange

    let stack = UIStackView(arrangedSubviews: [titleLabel, detailLabel, meter])
    stack.axis = .vertical
    stack.spacing = 5
    stack.translatesAutoresizingMaskIntoConstraints = false
    contentView.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: contentView.layoutMarginsGuide.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: contentView.layoutMarginsGuide.trailingAnchor),
      stack.topAnchor.constraint(equalTo: contentView.layoutMarginsGuide.topAnchor),
      stack.bottomAnchor.constraint(equalTo: contentView.layoutMarginsGuide.bottomAnchor),
    ])

    accessoryType = .disclosureIndicator
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  func configure(title: String, detail: String, ratio: Double) {
    titleLabel.text = title
    detailLabel.text = detail
    meter.progress = Float(min(max(ratio, 0), 1))
  }
}
