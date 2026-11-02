import CoreImage
import UIKit

@MainActor
enum PostSetupPages {
  static let previewPhoto = IntroPage.all[3].imageName
  static let previewExif = ["Panasonic DC-GX9", "La Rochelle, France"]

  static func permissions(showsNotifications: Bool, onAllow: @escaping () -> Void, onLater: @escaping () -> Void) -> OnboardingPageView {
    let page = OnboardingPageView(
      title: String(localized: "Two small things, change them anytime"),
      lead: String(localized: "You can use Afilmory without them. Change them anytime in Settings.")
    )
    page.content.addArrangedSubview(item(
      symbol: "photo.on.rectangle",
      title: String(localized: "Photos"),
      body: String(localized: "Reads the photos you pick, with their EXIF and place, when you develop them. Only the ones you choose."),
      preview: exifPreview()
    ))
    if showsNotifications {
      page.content.addArrangedSubview(item(
        symbol: "bell",
        title: String(localized: "Notifications"),
        body: String(localized: "Tells you when photographers you follow publish new photos."),
        preview: bannerPreview()
      ))
    }
    let dots = AFProgressDots(count: 3)
    dots.setCurrent(1, animated: false)
    page.actions.addArrangedSubview(dots)
    page.actions.setCustomSpacing(18, after: dots)
    page.actions.addArrangedSubview(pill(String(localized: "Allow and continue"), action: onAllow))
    page.actions.addArrangedSubview(AFTextButton.make(String(localized: "Later"), action: onLater))
    return page
  }

  static func firstRoll(onSelect: @escaping () -> Void, onSkip: @escaping () -> Void) -> OnboardingPageView {
    let page = OnboardingPageView(
      title: String(localized: "Develop your first roll"),
      lead: String(localized: "Pick a few photos you love. Once developed, they hang in your gallery.")
    )
    let strip = UIStackView()
    strip.spacing = 6
    strip.distribution = .fillEqually
    for page in IntroPage.all.prefix(3) {
      strip.addArrangedSubview(negative(UIImage(named: page.imageName)))
    }
    strip.heightAnchor.constraint(equalToConstant: 104).isActive = true
    strip.isAccessibilityElement = false
    page.content.addArrangedSubview(strip)
    page.content.setCustomSpacing(18, after: strip)
    let card = DarkroomStageView()
    card.onSelect = onSelect
    page.content.addArrangedSubview(card)
    let dots = AFProgressDots(count: 3)
    dots.setCurrent(2, animated: false)
    page.actions.addArrangedSubview(dots)
    page.actions.setCustomSpacing(8, after: dots)
    page.actions.addArrangedSubview(AFTextButton.make(String(localized: "See my gallery first"), action: onSkip))
    return page
  }

  private static func pill(_ title: String, action: @escaping () -> Void) -> UIView {
    let button = DarkroomPillButton(style: .filled, height: 52)
    button.setTitle(title, size: 17)
    button.addAction(UIAction { _ in action() }, for: .primaryActionTriggered)
    return button
  }

  private static func item(symbol: String, title: String, body: String, preview: UIView) -> UIView {
    let glyph = UIView()
    glyph.layer.cornerRadius = 22
    glyph.layer.borderWidth = 1
    glyph.layer.borderColor = AFColor.tick.cgColor
    let icon = UIImageView(image: UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .regular)))
    icon.tintColor = AFColor.textPrimary
    icon.translatesAutoresizingMaskIntoConstraints = false
    glyph.addSubview(icon)
    let titleLabel = AFLabel.exhibit(title, size: 20)
    titleLabel.font = AFFont.exhibit(size: 20, relativeTo: .title3)
    let bodyLabel = AFLabel.ui(body, size: 14)
    bodyLabel.font = AFFont.ui(size: 14, relativeTo: .subheadline)
    bodyLabel.numberOfLines = 0
    let texts = UIStackView(arrangedSubviews: [titleLabel, bodyLabel, preview])
    texts.axis = .vertical
    texts.spacing = 4
    texts.setCustomSpacing(12, after: bodyLabel)
    texts.alignment = .fill
    let row = UIStackView(arrangedSubviews: [glyph, texts])
    row.spacing = 14
    row.alignment = .top
    NSLayoutConstraint.activate([
      glyph.widthAnchor.constraint(equalToConstant: 44),
      glyph.heightAnchor.constraint(equalToConstant: 44),
      icon.centerXAnchor.constraint(equalTo: glyph.centerXAnchor),
      icon.centerYAnchor.constraint(equalTo: glyph.centerYAnchor),
    ])
    return row
  }

  private static func exifPreview() -> UIView {
    let card = UIView()
    card.backgroundColor = AFColor.raised
    card.layer.cornerRadius = 18
    card.layer.cornerCurve = .continuous
    card.layer.borderWidth = 1
    card.layer.borderColor = AFColor.fill.cgColor
    let image = UIImage(named: previewPhoto)
    let thumb = UIImageView(image: image)
    thumb.contentMode = .scaleAspectFill
    thumb.clipsToBounds = true
    thumb.layer.cornerRadius = 10
    let accent = image.map(AccentExtractor.accent(for:)) ?? AFColor.accentFallback
    let dot = UIView()
    dot.backgroundColor = accent
    dot.layer.cornerRadius = 3
    let number = AFLabel.exhibit("No. 1", size: 15, italic: true)
    let kicker = UIStackView(arrangedSubviews: [dot, number])
    kicker.spacing = 6
    kicker.alignment = .center
    let lines = UIStackView(arrangedSubviews: [kicker] + previewExif.map { AFLabel.mono($0, size: 11) })
    lines.axis = .vertical
    lines.spacing = 3
    let row = UIStackView(arrangedSubviews: [thumb, lines])
    row.spacing = 12
    row.alignment = .center
    row.translatesAutoresizingMaskIntoConstraints = false
    card.addSubview(row)
    card.isAccessibilityElement = false
    card.accessibilityElementsHidden = true
    NSLayoutConstraint.activate([
      dot.widthAnchor.constraint(equalToConstant: 6),
      dot.heightAnchor.constraint(equalToConstant: 6),
      thumb.widthAnchor.constraint(equalToConstant: 60),
      thumb.heightAnchor.constraint(equalToConstant: 76),
      row.topAnchor.constraint(equalTo: card.topAnchor, constant: 10),
      row.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 10),
      row.trailingAnchor.constraint(lessThanOrEqualTo: card.trailingAnchor, constant: -10),
      row.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -10),
    ])
    return card
  }

  private static func bannerPreview() -> UIView {
    let card = UIView()
    card.backgroundColor = AFColor.tick.withAlphaComponent(0.55)
    card.layer.cornerRadius = 20
    card.layer.cornerCurve = .continuous
    let icon = UIImageView(image: UIImage(named: "AfilmoryLogo"))
    icon.contentMode = .scaleAspectFill
    icon.clipsToBounds = true
    icon.layer.cornerRadius = 8
    let title = AFLabel.ui(String(localized: "People you follow"), size: 13, weight: .semibold, color: AFColor.textPrimary)
    let body = AFLabel.ui(String(localized: "Just published a new photo."), size: 13, color: AFColor.textSecondary)
    body.lineBreakMode = .byTruncatingTail
    let texts = UIStackView(arrangedSubviews: [title, body])
    texts.axis = .vertical
    texts.spacing = 1
    let thumb = UIImageView(image: UIImage(named: previewPhoto))
    thumb.contentMode = .scaleAspectFill
    thumb.clipsToBounds = true
    thumb.layer.cornerRadius = 8
    let row = UIStackView(arrangedSubviews: [icon, texts, thumb])
    row.spacing = 10
    row.alignment = .center
    row.translatesAutoresizingMaskIntoConstraints = false
    card.addSubview(row)
    card.accessibilityElementsHidden = true
    NSLayoutConstraint.activate([
      icon.widthAnchor.constraint(equalToConstant: 34),
      icon.heightAnchor.constraint(equalToConstant: 34),
      thumb.widthAnchor.constraint(equalToConstant: 34),
      thumb.heightAnchor.constraint(equalToConstant: 34),
      row.topAnchor.constraint(equalTo: card.topAnchor, constant: 10),
      row.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 12),
      row.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -12),
      row.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -10),
    ])
    return card
  }

  private static func negative(_ image: UIImage?) -> UIView {
    let frame = UIView()
    frame.backgroundColor = AFColor.filmBase
    frame.layer.cornerRadius = 12
    frame.layer.cornerCurve = .continuous
    frame.clipsToBounds = true
    let view = UIImageView(image: image.flatMap(negativeImage))
    view.contentMode = .scaleAspectFill
    view.alpha = 0.55
    view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    view.setContentHuggingPriority(.defaultLow, for: .horizontal)
    view.translatesAutoresizingMaskIntoConstraints = false
    frame.addSubview(view)
    NSLayoutConstraint.activate([
      view.topAnchor.constraint(equalTo: frame.topAnchor),
      view.leadingAnchor.constraint(equalTo: frame.leadingAnchor),
      view.trailingAnchor.constraint(equalTo: frame.trailingAnchor),
      view.bottomAnchor.constraint(equalTo: frame.bottomAnchor),
    ])
    return frame
  }

  private static func negativeImage(_ image: UIImage) -> UIImage? {
    let size = CGSize(width: image.size.width * 0.25, height: image.size.height * 0.25)
    let baked = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    guard let input = CIImage(image: baked) else { return nil }
    let output = input
      .applyingFilter("CIColorInvert")
      .applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0.35])
    guard let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
    return UIImage(cgImage: cg, scale: baked.scale, orientation: .up)
  }
}
