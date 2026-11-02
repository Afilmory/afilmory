import UIKit

final class DarkroomLibraryCell: UICollectionViewCell {
  private let imageView = UIImageView()
  private let frameLabel = AFLabel.mono(nil, size: 9, color: AFColor.textPrimary)
  private let dim = UIView()
  private let check = UIImageView()

  override init(frame: CGRect) {
    super.init(frame: frame)
    contentView.clipsToBounds = true
    contentView.layer.cornerCurve = .continuous
    contentView.backgroundColor = AFColor.fill
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    frameLabel.layer.shadowColor = UIColor.black.cgColor
    frameLabel.layer.shadowOpacity = 0.8
    frameLabel.layer.shadowRadius = 3
    frameLabel.layer.shadowOffset = CGSize(width: 0, height: 1)
    dim.backgroundColor = AFColor.ground.withAlphaComponent(0.45)
    dim.isHidden = true
    check.tintColor = AFColor.textPrimary
    for view in [imageView, dim, frameLabel, check] {
      view.translatesAutoresizingMaskIntoConstraints = false
      contentView.addSubview(view)
    }
    NSLayoutConstraint.activate([
      imageView.topAnchor.constraint(equalTo: contentView.topAnchor),
      imageView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
      imageView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
      imageView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
      dim.topAnchor.constraint(equalTo: contentView.topAnchor),
      dim.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
      dim.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
      dim.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
      frameLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 6),
      frameLabel.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -5),
      check.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 6),
      check.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -6),
    ])
    isAccessibilityElement = true
    accessibilityTraits = .button
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func configure(photo: GalleryPhoto, frame: String, corners: CACornerMask) {
    imageView.afSetPhoto(photo, targetWidth: bounds.width > 0 ? bounds.width : 130)
    frameLabel.text = "▸\(frame)"
    contentView.layer.maskedCorners = corners
    contentView.layer.cornerRadius = corners.isEmpty ? 0 : 18
    accessibilityLabel = String(localized: "No. \(frame)")
  }

  func setSelectionState(_ selected: Bool?) {
    check.isHidden = selected == nil
    dim.isHidden = selected != true
    let name = selected == true ? "checkmark.circle.fill" : "circle"
    check.image = UIImage(systemName: name, withConfiguration: UIImage.SymbolConfiguration(pointSize: 20, weight: .regular))
    accessibilityTraits = selected == true ? [.button, .selected] : .button
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    imageView.sd_cancelCurrentImageLoad()
    imageView.image = nil
  }

  static func corners(index: Int, count: Int, columns: Int) -> CACornerMask {
    guard count > 0 else { return [] }
    let lastRowStart = ((count - 1) / columns) * columns
    var mask: CACornerMask = []
    if index == 0 { mask.insert(.layerMinXMinYCorner) }
    if index == min(columns, count) - 1 { mask.insert(.layerMaxXMinYCorner) }
    if index == lastRowStart { mask.insert(.layerMinXMaxYCorner) }
    if index == count - 1, count % columns == 0 || count < columns { mask.insert(.layerMaxXMaxYCorner) }
    return mask
  }

  static func layout(leading: CGFloat = 16, trailing: CGFloat = 16) -> UICollectionViewLayout {
    let item = NSCollectionLayoutItem(layoutSize: NSCollectionLayoutSize(widthDimension: .fractionalWidth(1 / 3), heightDimension: .fractionalWidth(1 / 3)))
    let group = NSCollectionLayoutGroup.horizontal(
      layoutSize: NSCollectionLayoutSize(widthDimension: .fractionalWidth(1), heightDimension: .fractionalWidth(1 / 3)),
      repeatingSubitem: item,
      count: 3
    )
    group.interItemSpacing = .fixed(3)
    let section = NSCollectionLayoutSection(group: group)
    section.interGroupSpacing = 3
    section.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: leading, bottom: 24, trailing: trailing)
    let header = NSCollectionLayoutBoundarySupplementaryItem(
      layoutSize: NSCollectionLayoutSize(widthDimension: .fractionalWidth(1), heightDimension: .estimated(44)),
      elementKind: UICollectionView.elementKindSectionHeader,
      alignment: .top
    )
    section.boundarySupplementaryItems = [header]
    return UICollectionViewCompositionalLayout(section: section)
  }
}

final class DarkroomLibraryHeader: UICollectionReusableView {
  private let meta = AFLabel.mono(nil, size: 11)
  private let button = UIButton(type: .system)
  private var action: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    meta.font = UIFontMetrics(forTextStyle: .caption1).scaledFont(for: AFFont.mono(size: 11))
    button.tintColor = AFColor.textPrimary
    button.titleLabel?.font = AFFont.ui(size: 15, relativeTo: .body)
    button.titleLabel?.adjustsFontForContentSizeCategory = true
    button.addAction(UIAction { [weak self] _ in self?.action?() }, for: .primaryActionTriggered)
    let row = UIStackView(arrangedSubviews: [meta, button])
    row.alignment = .center
    row.translatesAutoresizingMaskIntoConstraints = false
    addSubview(row)
    NSLayoutConstraint.activate([
      row.topAnchor.constraint(equalTo: topAnchor),
      row.bottomAnchor.constraint(equalTo: bottomAnchor),
      row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 4),
      row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -4),
      row.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func configure(meta text: String, action title: String, enabled: Bool, action: @escaping () -> Void) {
    meta.text = text
    button.setTitle(title, for: .normal)
    button.isEnabled = enabled
    self.action = action
  }
}
