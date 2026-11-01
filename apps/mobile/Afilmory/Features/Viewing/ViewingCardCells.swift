import UIKit

class ViewingCardCell: UICollectionViewCell {
  static let padding = UIEdgeInsets(top: 4, left: 14, bottom: 14, right: 14)
  static let spacing: CGFloat = 8

  let mosaic = MosaicView()
  var onOpenGallery: (() -> Void)?
  var onSelectPhoto: ((GalleryCoverPhoto) -> Void)?
  private(set) var accentPhoto: GalleryCoverPhoto?
  private var covers: [GalleryCoverPhoto] = []
  private var totalCount: Int?
  private var mosaicWidth: CGFloat = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    contentView.backgroundColor = AFColor.raised
    contentView.layer.cornerRadius = AFRadius.card
    contentView.layer.cornerCurve = .continuous
    contentView.layer.borderWidth = 1
    contentView.layer.borderColor = AFColor.hairline.cgColor
    mosaic.onSelect = { [weak self] cover in self?.onSelectPhoto?(cover) }
    contentView.addSubview(mosaic)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  static func mosaicWidth(cardWidth: CGFloat) -> CGFloat {
    max(0, cardWidth - padding.left - padding.right)
  }

  static func height(headerHeight: CGFloat, mosaic: MosaicLayout) -> CGFloat {
    let body = mosaic.tiles.isEmpty ? 0 : spacing + mosaic.size.height
    return ceil(padding.top + headerHeight + body + (mosaic.tiles.isEmpty ? 6 : padding.bottom))
  }

  func setMosaic(_ covers: [GalleryCoverPhoto], totalCount: Int?) {
    accentPhoto = covers.first
    self.covers = covers
    self.totalCount = totalCount
    mosaicWidth = Self.mosaicWidth(cardWidth: bounds.width)
    mosaic.configure(covers: covers, totalCount: totalCount, width: mosaicWidth)
    setNeedsLayout()
  }

  func layoutCard(header: UIView, headerHeight: CGFloat, trailing: CGFloat) {
    let padding = Self.padding
    let width = Self.mosaicWidth(cardWidth: bounds.width)
    if abs(width - mosaicWidth) > 0.5 {
      mosaicWidth = width
      mosaic.configure(covers: covers, totalCount: totalCount, width: width)
    }
    header.frame = CGRect(x: padding.left, y: padding.top, width: bounds.width - padding.left - trailing, height: headerHeight)
    mosaic.frame = CGRect(origin: CGPoint(x: padding.left, y: header.frame.maxY + Self.spacing), size: mosaic.intrinsicContentSize)
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    onOpenGallery = nil
    onSelectPhoto = nil
  }
}

final class ViewingRollCell: ViewingCardCell {
  static let reuseID = "ViewingRollCell"
  static let nameSize: CGFloat = 17

  private let header = ViewingCardHeader(nameSize: nameSize, showsChevron: true)
  private(set) var event: GalleryTimelineEvent?

  override init(frame: CGRect) {
    super.init(frame: frame)
    header.addAction(UIAction { [weak self] _ in self?.onOpenGallery?() }, for: .touchUpInside)
    contentView.addSubview(header)
  }

  static func covers(for event: GalleryTimelineEvent) -> [GalleryCoverPhoto] {
    event.photos.map(GalleryCoverPhoto.init(preview:))
  }

  static func height(for event: GalleryTimelineEvent, width: CGFloat) -> CGFloat {
    let layout = MosaicView.layout(for: covers(for: event), width: mosaicWidth(cardWidth: width))
    return height(headerHeight: ViewingCardHeader.height(nameSize: nameSize), mosaic: layout)
  }

  func configure(_ event: GalleryTimelineEvent) {
    self.event = event
    let covers = Self.covers(for: event)
    header.configure(
      name: event.gallery.name,
      meta: ViewingContent.rollMeta(event),
      avatarURL: event.gallery.author?.avatar?.trimmingToNil,
      accentPhoto: covers.first
    )
    setMosaic(covers, totalCount: max(event.totalCount, covers.count))
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    layoutCard(header: header, headerHeight: ViewingCardHeader.height(nameSize: Self.nameSize), trailing: Self.padding.right)
  }
}

final class ViewingGalleryCell: ViewingCardCell {
  static let reuseID = "ViewingGalleryCell"
  static let nameSize: CGFloat = 18

  private let header = ViewingCardHeader(nameSize: nameSize, showsChevron: false)
  private let follow = ViewingFollowButton()
  var onToggleFollow: (() -> Void)?
  private(set) var card: ViewingGalleryCard?

  override init(frame: CGRect) {
    super.init(frame: frame)
    header.addAction(UIAction { [weak self] _ in self?.onOpenGallery?() }, for: .touchUpInside)
    follow.addAction(UIAction { [weak self] _ in self?.onToggleFollow?() }, for: .touchUpInside)
    contentView.addSubview(header)
    contentView.addSubview(follow)
  }

  static func height(covers: [GalleryCoverPhoto], width: CGFloat) -> CGFloat {
    let layout = MosaicView.layout(for: covers, width: mosaicWidth(cardWidth: width))
    return height(headerHeight: ViewingCardHeader.height(nameSize: nameSize), mosaic: layout)
  }

  func configure(_ card: ViewingGalleryCard, covers: [GalleryCoverPhoto], isFollowing: Bool, isUpdating: Bool) {
    self.card = card
    header.configure(
      name: card.name,
      meta: ViewingContent.galleryMeta(card),
      avatarURL: card.avatarURL,
      accentPhoto: covers.first
    )
    follow.isHidden = card.isOwn
    follow.apply(isFollowing: isFollowing, isUpdating: isUpdating, galleryName: card.name)
    setMosaic(covers, totalCount: nil)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let headerHeight = ViewingCardHeader.height(nameSize: Self.nameSize)
    let followSize = follow.isHidden ? .zero : follow.sizeThatFits(CGSize(width: 200, height: 44))
    follow.frame = CGRect(
      x: bounds.width - 8 - followSize.width,
      y: Self.padding.top + (headerHeight - followSize.height) / 2,
      width: followSize.width,
      height: followSize.height
    )
    layoutCard(header: header, headerHeight: headerHeight, trailing: 8 + followSize.width + 10)
  }
}
