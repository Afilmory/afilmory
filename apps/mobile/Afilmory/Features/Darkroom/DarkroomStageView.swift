import UIKit

final class DarkroomStageView: UIView {
  private let idlePanel = UIView()
  private let developPanel = DarkroomDevelopPanel()
  private let selectButton = DarkroomPillButton(style: .filled, height: 52)
  private var idleBottom: NSLayoutConstraint?
  private var developBottom: NSLayoutConstraint?
  private var showingDevelopment: Bool?

  var onSelect: (() -> Void)?
  var onRetry: ((String) -> Void)? {
    get { developPanel.onRetry }
    set { developPanel.onRetry = newValue }
  }

  var onSecondary: (() -> Void)? {
    get { developPanel.onSecondary }
    set { developPanel.onSecondary = newValue }
  }

  var onPrimary: (() -> Void)? {
    get { developPanel.onPrimary }
    set { developPanel.onPrimary = newValue }
  }

  var accent: UIColor {
    get { developPanel.accent }
    set { developPanel.accent = newValue }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = AFColor.raised
    layer.cornerRadius = AFRadius.card
    layer.cornerCurve = .continuous
    layer.borderWidth = 1
    layer.borderColor = AFColor.hairline.cgColor
    clipsToBounds = true
    accessibilityLabel = String(localized: "Upload")
    buildIdlePanel()
    for panel in [idlePanel, developPanel] {
      panel.translatesAutoresizingMaskIntoConstraints = false
      addSubview(panel)
      NSLayoutConstraint.activate([
        panel.topAnchor.constraint(equalTo: topAnchor),
        panel.leadingAnchor.constraint(equalTo: leadingAnchor),
        panel.trailingAnchor.constraint(equalTo: trailingAnchor),
      ])
    }
    idleBottom = idlePanel.bottomAnchor.constraint(equalTo: bottomAnchor)
    developBottom = developPanel.bottomAnchor.constraint(equalTo: bottomAnchor)
    setDevelopment(false, animated: false)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private func buildIdlePanel() {
    let ring = UIView()
    ring.layer.cornerRadius = 28
    ring.layer.borderWidth = 1
    ring.layer.borderColor = AFColor.tick.cgColor
    let aperture = UIImageView(image: UIImage(systemName: "camera.aperture", withConfiguration: UIImage.SymbolConfiguration(pointSize: 24, weight: .light)))
    aperture.tintColor = AFColor.textPrimary
    aperture.translatesAutoresizingMaskIntoConstraints = false
    ring.addSubview(aperture)
    let title = AFLabel.exhibit(String(localized: "Develop new photos"), size: 26)
    title.font = AFFont.exhibit(size: 26, relativeTo: .title1)
    title.textAlignment = .center
    title.numberOfLines = 0
    title.accessibilityTraits = .header
    let hint = AFLabel.ui(String(localized: "Pick from your library, or share to Afilmory from another app"), size: 13, color: AFColor.textTertiary)
    hint.font = AFFont.ui(size: 13, relativeTo: .footnote)
    hint.textAlignment = .center
    hint.numberOfLines = 0
    selectButton.setTitle(String(localized: "Select photos"), size: 16)
    selectButton.addAction(UIAction { [weak self] _ in self?.onSelect?() }, for: .primaryActionTriggered)
    let stack = UIStackView(arrangedSubviews: [ring, title, hint, selectButton])
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 6
    stack.setCustomSpacing(14, after: ring)
    stack.setCustomSpacing(20, after: hint)
    stack.translatesAutoresizingMaskIntoConstraints = false
    idlePanel.addSubview(stack)
    NSLayoutConstraint.activate([
      ring.widthAnchor.constraint(equalToConstant: 56),
      ring.heightAnchor.constraint(equalToConstant: 56),
      aperture.centerXAnchor.constraint(equalTo: ring.centerXAnchor),
      aperture.centerYAnchor.constraint(equalTo: ring.centerYAnchor),
      selectButton.widthAnchor.constraint(equalTo: stack.widthAnchor),
      stack.topAnchor.constraint(equalTo: idlePanel.topAnchor, constant: 26),
      stack.leadingAnchor.constraint(equalTo: idlePanel.leadingAnchor, constant: 22),
      stack.trailingAnchor.constraint(equalTo: idlePanel.trailingAnchor, constant: -22),
      stack.bottomAnchor.constraint(equalTo: idlePanel.bottomAnchor, constant: -22),
    ])
  }

  func apply(stage: DarkroomStage, jobs: [UploadJobState], animated: Bool) {
    let development = stage.showsDevelopment
    if development {
      developPanel.apply(stage: stage, jobs: jobs, animated: animated && showingDevelopment == true)
    }
    selectButton.isEnabled = stage.phase == .idle
    setDevelopment(development, animated: animated)
  }

  private func setDevelopment(_ development: Bool, animated: Bool) {
    guard development != showingDevelopment else { return }
    let first = showingDevelopment == nil
    showingDevelopment = development
    let incoming: UIView = development ? developPanel : idlePanel
    let outgoing: UIView = development ? idlePanel : developPanel
    idleBottom?.isActive = !development
    developBottom?.isActive = development
    incoming.isHidden = false
    incoming.isUserInteractionEnabled = true
    outgoing.isUserInteractionEnabled = false
    incoming.accessibilityElementsHidden = false
    outgoing.accessibilityElementsHidden = true
    guard animated, !first, window != nil else {
      outgoing.isHidden = true
      outgoing.alpha = 1
      incoming.alpha = 1
      superview?.layoutIfNeeded()
      return
    }
    AFMotion.defocus(outgoing, amount: 1)
    UIView.animate(withDuration: 0.3, delay: 0, options: [.allowUserInteraction]) {
      outgoing.alpha = 0
    } completion: { _ in
      guard self.showingDevelopment == (outgoing === self.idlePanel) else { return }
      AFMotion.refocus(outgoing, animated: false)
      outgoing.isHidden = true
      outgoing.alpha = 1
    }
    AFMotion.rackIn(incoming)
    var root: UIView = self
    while let parent = root.superview, !(parent is UIScrollView) { root = parent }
    AFMotion.spring(duration: 0.56, animations: { root.layoutIfNeeded() })
  }
}
