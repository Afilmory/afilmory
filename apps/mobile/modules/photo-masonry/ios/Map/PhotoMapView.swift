import MapKit
import SDWebImage
import UIKit

private let photoAnnotationReuseIdentifier = "photo-map-annotation"
private let clusterAnnotationReuseIdentifier = "photo-map-cluster"

enum PhotoMapScreenState: String {
  case empty
  case error
  case filteredEmpty
  case loading
  case pending
  case ready
  case signedOut
}

struct PhotoMapStrings {
  let clearFilters: String
  let clearSelection: String
  let clusterAccessibilityLabel: String
  let emptyDescription: String
  let emptyTitle: String
  let errorDescription: String
  let errorTitle: String
  let fitAll: String
  let filteredEmptyDescription: String
  let filteredEmptyTitle: String
  let loading: String
  let locations: String
  let pendingDescription: String
  let pendingTitle: String
  let previewDefaultDetail: String
  let retry: String
  let signIn: String
  let signedOutDescription: String
  let signedOutTitle: String
  let title: String

  static let fallback = PhotoMapStrings(
    clearFilters: "Clear filters",
    clearSelection: "Clear selection",
    clusterAccessibilityLabel: "Photo cluster",
    emptyDescription: "",
    emptyTitle: "No photo locations",
    errorDescription: "",
    errorTitle: "Unable to load the map",
    fitAll: "Show all photo locations",
    filteredEmptyDescription: "Clear filters to show all photo locations.",
    filteredEmptyTitle: "No photo locations match the filters",
    loading: "Loading photo locations",
    locations: "",
    pendingDescription: "",
    pendingTitle: "Workspace unavailable",
    previewDefaultDetail: "View photo details",
    retry: "Retry",
    signIn: "Sign in",
    signedOutDescription: "",
    signedOutTitle: "Your photo map",
    title: "Explore Map"
  )
}

private final class PhotoMapAnnotation: NSObject, MKAnnotation {
  let detailText: String
  let id: String
  let index: Int
  let markerAccessibilityLabel: String
  let openAccessibilityLabel: String
  let thumbnailUrl: String
  let title: String?
  dynamic var coordinate: CLLocationCoordinate2D

  init(photo: MapPhoto) {
    coordinate = CLLocationCoordinate2D(latitude: photo.latitude, longitude: photo.longitude)
    detailText = photo.subtitle
    id = photo.id
    index = photo.index
    markerAccessibilityLabel = photo.accessibilityLabel
    openAccessibilityLabel = photo.openAccessibilityLabel
    thumbnailUrl = photo.thumbnailUrl
    title = photo.title
    super.init()
  }
}

private final class PhotoMapAnnotationView: MKAnnotationView {
  private let thumbnailView = UIImageView()

  override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
    super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)

    bounds = CGRect(x: 0, y: 0, width: 50, height: 50)
    centerOffset = CGPoint(x: 0, y: -5)
    collisionMode = .circle
    displayPriority = .defaultHigh
    clusteringIdentifier = "photos"
    isAccessibilityElement = true

    layer.shadowColor = UIColor.black.cgColor
    layer.shadowOffset = CGSize(width: 0, height: 3)
    layer.shadowOpacity = 0.32
    layer.shadowRadius = 5

    thumbnailView.backgroundColor = UIColor.secondarySystemBackground
    thumbnailView.clipsToBounds = true
    thumbnailView.contentMode = .scaleAspectFill
    thumbnailView.frame = bounds.insetBy(dx: 3, dy: 3)
    thumbnailView.layer.borderColor = UIColor.white.withAlphaComponent(0.9).cgColor
    thumbnailView.layer.borderWidth = 2.5
    thumbnailView.layer.cornerCurve = .continuous
    thumbnailView.layer.cornerRadius = thumbnailView.bounds.width / 2
    addSubview(thumbnailView)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    thumbnailView.sd_cancelCurrentImageLoad()
    thumbnailView.image = nil
    transform = .identity
  }

  func configure(annotation: PhotoMapAnnotation) {
    self.annotation = annotation
    accessibilityIdentifier = "photo-map-marker-\(annotation.id)"
    accessibilityLabel = annotation.markerAccessibilityLabel
    accessibilityTraits = isSelected ? [.button, .selected] : .button

    let placeholder = UIImage(systemName: "photo.fill")?.withTintColor(.secondaryLabel, renderingMode: .alwaysOriginal)
    guard let url = URL(string: annotation.thumbnailUrl), !annotation.thumbnailUrl.isEmpty else {
      thumbnailView.image = placeholder
      return
    }
    thumbnailView.sd_setImage(
      with: url,
      placeholderImage: placeholder,
      options: [.retryFailed, .scaleDownLargeImages]
    )
  }

  override func setSelected(_ selected: Bool, animated: Bool) {
    super.setSelected(selected, animated: animated)
    accessibilityTraits = selected ? [.button, .selected] : .button

    let changes = {
      self.transform = selected ? CGAffineTransform(scaleX: 1.16, y: 1.16) : .identity
      self.thumbnailView.layer.borderColor = selected
        ? UIColor.systemBlue.cgColor
        : UIColor.white.withAlphaComponent(0.9).cgColor
      self.thumbnailView.layer.borderWidth = selected ? 3 : 2.5
    }
    if animated {
      UIView.animate(
        withDuration: 0.22,
        delay: 0,
        usingSpringWithDamping: 0.72,
        initialSpringVelocity: 0.4,
        options: [.allowUserInteraction, .beginFromCurrentState],
        animations: changes
      )
    } else {
      changes()
    }
  }
}

private final class PhotoMapClusterView: MKMarkerAnnotationView {
  func configure(annotation: MKClusterAnnotation, accessibilityLabel: String) {
    self.annotation = annotation
    markerTintColor = UIColor.systemBlue.withAlphaComponent(0.92)
    glyphTintColor = .white
    glyphText = String(annotation.memberAnnotations.count)
    displayPriority = .required
    collisionMode = .circle
    canShowCallout = false
    clusteringIdentifier = nil
    isAccessibilityElement = true
    self.accessibilityLabel = accessibilityLabel
    accessibilityValue = String(annotation.memberAnnotations.count)
    accessibilityTraits = .button
  }
}

final class PhotoMapView: UIView, MKMapViewDelegate {
  var onNativeClearFilters: (() -> Void)?
  var onNativePhotoPress: ((String, Int) -> Void)?
  var onNativeRetry: (() -> Void)?
  var onNativeSignIn: (() -> Void)?

  private let mapView = MKMapView()

  private let infoSurface = PhotoMapView.makeGlassSurface()
  private let infoIconBackground = UIView()
  private let infoIcon = UIImageView()
  private let infoTitle = UILabel()
  private let infoDetail = UILabel()

  private let loadingSurface = PhotoMapView.makeGlassSurface()
  private let loadingIndicator = UIActivityIndicatorView(style: .medium)
  private let loadingLabel = UILabel()

  private let stateSurface = PhotoMapView.makeGlassSurface(interactive: true)
  private let stateIcon = UIImageView()
  private let stateTitle = UILabel()
  private let stateDescription = UILabel()
  private let stateActionButton = UIButton(type: .system)

  private let previewSurface = PhotoMapView.makeGlassSurface(interactive: true)
  private let previewButton = UIButton(type: .custom)
  private let previewImage = UIImageView()
  private let previewTitle = UILabel()
  private let previewDetail = UILabel()
  private let previewChevron = UIImageView()
  private let previewCloseButton = UIButton(type: .system)

  private let fitSurface = PhotoMapView.makeGlassSurface(interactive: true)
  private let fitButton = UIButton(type: .system)

  private var strings = PhotoMapStrings.fallback
  private var screenState = PhotoMapScreenState.loading
  private var photoAnnotations: [PhotoMapAnnotation] = []
  private var photoSignature = ""
  private var selectedPhotoId = ""
  private var needsInitialFit = false

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    configureMap()
    configureChrome()
    updateLabels()
    updatePresentation(animated: false)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    mapView.frame = bounds

    let horizontalInset: CGFloat = 12
    let topY = safeAreaInsets.top + 8
    let infoHeight: CGFloat = 56
    let infoCopyWidth = max(
      infoTitle.sizeThatFits(CGSize(width: bounds.width, height: infoHeight)).width,
      infoDetail.sizeThatFits(CGSize(width: bounds.width, height: infoHeight)).width
    )
    let infoWidth = min(max(infoCopyWidth + 66, 170), max(bounds.width - horizontalInset * 2, 0))
    infoSurface.frame = CGRect(x: horizontalInset, y: topY, width: infoWidth, height: infoHeight)
    infoSurface.layer.cornerRadius = 18
    infoIconBackground.frame = CGRect(x: 9, y: 9, width: 38, height: 38)
    infoIconBackground.layer.cornerRadius = 12
    infoIcon.frame = infoIconBackground.bounds.insetBy(dx: 10, dy: 10)
    infoTitle.frame = CGRect(x: 57, y: 10, width: max(infoWidth - 66, 0), height: 20)
    infoDetail.frame = CGRect(x: 57, y: 30, width: max(infoWidth - 66, 0), height: 16)

    let loadingSize = loadingLabel.sizeThatFits(CGSize(width: max(bounds.width - 96, 0), height: 44))
    let loadingWidth = min(max(loadingSize.width + 52, 154), max(bounds.width - 48, 0))
    loadingSurface.frame = CGRect(
      x: (bounds.width - loadingWidth) / 2,
      y: (bounds.height - 44) / 2,
      width: loadingWidth,
      height: 44
    )
    loadingSurface.layer.cornerRadius = 16
    loadingIndicator.frame = CGRect(x: 13, y: 10, width: 24, height: 24)
    loadingLabel.frame = CGRect(x: 43, y: 8, width: max(loadingWidth - 54, 0), height: 28)

    layoutStateCard()

    let bottomClearance = max(safeAreaInsets.bottom, 74) + 10
    let bottomY = bounds.height - bottomClearance
    let fitSize: CGFloat = 44
    fitSurface.frame = CGRect(
      x: bounds.width - horizontalInset - fitSize,
      y: bottomY - fitSize,
      width: fitSize,
      height: fitSize
    )
    fitSurface.layer.cornerRadius = fitSize / 2
    fitButton.frame = fitSurface.contentView.bounds

    let previewHeight: CGFloat = 70
    let fitReservation = fitSurface.isHidden ? 0 : fitSize + 10
    let previewWidth = min(430, max(bounds.width - horizontalInset * 2 - fitReservation, 0))
    previewSurface.frame = CGRect(
      x: horizontalInset,
      y: bottomY - previewHeight,
      width: previewWidth,
      height: previewHeight
    )
    previewSurface.layer.cornerRadius = 18
    previewButton.frame = CGRect(x: 0, y: 0, width: max(previewWidth - 38, 0), height: previewHeight)
    previewImage.frame = CGRect(x: 7, y: 7, width: 56, height: 56)
    previewImage.layer.cornerRadius = 13
    let closeWidth: CGFloat = 36
    let chevronWidth: CGFloat = 18
    let copyX: CGFloat = 73
    let copyWidth = max(previewWidth - copyX - closeWidth - chevronWidth, 0)
    previewTitle.frame = CGRect(x: copyX, y: 14, width: copyWidth, height: 20)
    previewDetail.frame = CGRect(x: copyX, y: 36, width: copyWidth, height: 17)
    previewChevron.frame = CGRect(x: previewWidth - closeWidth - chevronWidth, y: 27, width: 10, height: 16)
    previewCloseButton.frame = CGRect(x: previewWidth - closeWidth, y: 0, width: closeWidth, height: previewHeight)

    if needsInitialFit, bounds.width > 0, bounds.height > 0 {
      needsInitialFit = false
      fitAllPhotos(animated: false)
    }
  }

  func setPhotos(_ photos: [MapPhoto]) {
    let signature = photos.map {
      "\($0.id):\($0.index):\($0.latitude):\($0.longitude):\($0.thumbnailUrl):\($0.subtitle)"
    }.joined(separator: "|")
    guard signature != photoSignature else { return }
    photoSignature = signature

    clearSelection(animated: false)
    mapView.removeAnnotations(photoAnnotations)
    photoAnnotations = photos
      .filter { CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude)) }
      .map { PhotoMapAnnotation(photo: $0) }
    mapView.addAnnotations(photoAnnotations)
    needsInitialFit = !photoAnnotations.isEmpty
    updatePresentation(animated: window != nil)
    setNeedsLayout()
  }

  func setState(_ state: PhotoMapScreenState) {
    guard state != screenState else { return }
    screenState = state
    updatePresentation(animated: window != nil)
  }

  func setStrings(_ strings: PhotoMapStrings) {
    self.strings = strings
    updateLabels()
    updatePresentation(animated: false)
    setNeedsLayout()
  }

  func transitionSourceView(for photoId: String) -> UIView? {
    guard selectedPhotoId == photoId,
          !previewSurface.isHidden,
          previewImage.image != nil
    else { return nil }
    return previewImage
  }

  private func configureMap() {
    mapView.delegate = self
    mapView.mapType = .mutedStandard
    mapView.overrideUserInterfaceStyle = .dark
    mapView.pointOfInterestFilter = .excludingAll
    mapView.showsBuildings = true
    mapView.showsCompass = true
    mapView.showsScale = false
    mapView.isPitchEnabled = false
    mapView.register(PhotoMapAnnotationView.self, forAnnotationViewWithReuseIdentifier: photoAnnotationReuseIdentifier)
    mapView.register(PhotoMapClusterView.self, forAnnotationViewWithReuseIdentifier: clusterAnnotationReuseIdentifier)
    addSubview(mapView)
  }

  private func configureChrome() {
    infoSurface.isUserInteractionEnabled = false
    infoIconBackground.backgroundColor = UIColor.systemBlue.withAlphaComponent(0.14)
    infoIconBackground.layer.cornerCurve = .continuous
    infoIcon.image = UIImage(systemName: "map.fill")
    infoIcon.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)
    infoIcon.tintColor = .systemBlue
    infoIcon.contentMode = .scaleAspectFit
    configureLabel(infoTitle, size: 14, weight: .bold, color: .label)
    configureLabel(infoDetail, size: 11, weight: .regular, color: .secondaryLabel)
    infoSurface.contentView.addSubview(infoIconBackground)
    infoIconBackground.addSubview(infoIcon)
    infoSurface.contentView.addSubview(infoTitle)
    infoSurface.contentView.addSubview(infoDetail)
    addSubview(infoSurface)

    loadingIndicator.color = .secondaryLabel
    configureLabel(loadingLabel, size: 13, weight: .semibold, color: .label)
    loadingSurface.contentView.addSubview(loadingIndicator)
    loadingSurface.contentView.addSubview(loadingLabel)
    addSubview(loadingSurface)

    stateIcon.contentMode = .scaleAspectFit
    stateIcon.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 27, weight: .semibold)
    configureLabel(stateTitle, size: 17, weight: .bold, color: .label)
    stateTitle.textAlignment = .center
    stateTitle.numberOfLines = 2
    configureLabel(stateDescription, size: 13, weight: .regular, color: .secondaryLabel)
    stateDescription.textAlignment = .center
    stateDescription.numberOfLines = 0
    stateActionButton.addTarget(self, action: #selector(handleStateAction), for: .touchUpInside)
    stateSurface.contentView.addSubview(stateIcon)
    stateSurface.contentView.addSubview(stateTitle)
    stateSurface.contentView.addSubview(stateDescription)
    stateSurface.contentView.addSubview(stateActionButton)
    addSubview(stateSurface)

    previewButton.accessibilityTraits = .button
    previewButton.addTarget(self, action: #selector(handlePhotoOpen), for: .touchUpInside)
    previewImage.backgroundColor = .secondarySystemBackground
    previewImage.clipsToBounds = true
    previewImage.contentMode = .scaleAspectFill
    previewImage.layer.cornerCurve = .continuous
    configureLabel(previewTitle, size: 14, weight: .bold, color: .label)
    configureLabel(previewDetail, size: 11, weight: .regular, color: .secondaryLabel)
    previewChevron.image = UIImage(systemName: "chevron.right")
    previewChevron.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold)
    previewChevron.tintColor = .secondaryLabel
    previewChevron.contentMode = .scaleAspectFit
    var closeConfiguration = UIButton.Configuration.plain()
    closeConfiguration.image = UIImage(systemName: "xmark")
    closeConfiguration.baseForegroundColor = .secondaryLabel
    closeConfiguration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 11, weight: .semibold)
    previewCloseButton.configuration = closeConfiguration
    previewCloseButton.addTarget(self, action: #selector(handleClearSelection), for: .touchUpInside)
    previewSurface.contentView.addSubview(previewButton)
    previewSurface.contentView.addSubview(previewImage)
    previewSurface.contentView.addSubview(previewTitle)
    previewSurface.contentView.addSubview(previewDetail)
    previewSurface.contentView.addSubview(previewChevron)
    previewSurface.contentView.addSubview(previewCloseButton)
    previewSurface.isHidden = true
    addSubview(previewSurface)

    var fitConfiguration = UIButton.Configuration.plain()
    fitConfiguration.image = UIImage(systemName: "arrow.up.left.and.arrow.down.right")
    fitConfiguration.baseForegroundColor = .label
    fitConfiguration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)
    fitButton.configuration = fitConfiguration
    fitButton.addTarget(self, action: #selector(handleFitAll), for: .touchUpInside)
    fitSurface.contentView.addSubview(fitButton)
    addSubview(fitSurface)
  }

  private static func makeGlassSurface(interactive: Bool = false) -> UIVisualEffectView {
    let surface = UIVisualEffectView()
    surface.effect = AdaptiveGlass.effect(interactive: interactive)
    surface.clipsToBounds = true
    surface.layer.cornerCurve = .continuous
    return surface
  }

  private func configureLabel(_ label: UILabel, size: CGFloat, weight: UIFont.Weight, color: UIColor) {
    label.font = .systemFont(ofSize: size, weight: weight)
    label.textColor = color
    label.adjustsFontForContentSizeCategory = true
  }

  private func updateLabels() {
    infoTitle.text = strings.title
    infoDetail.text = strings.locations
    loadingLabel.text = strings.loading
    fitButton.accessibilityLabel = strings.fitAll
    previewCloseButton.accessibilityLabel = strings.clearSelection
  }

  private func updatePresentation(animated: Bool) {
    let showsMap = screenState != .signedOut && screenState != .pending
    mapView.isHidden = !showsMap
    infoSurface.isHidden = !showsMap

    let isLoading = screenState == .loading
    loadingSurface.isHidden = !isLoading
    if isLoading {
      loadingIndicator.startAnimating()
    } else {
      loadingIndicator.stopAnimating()
    }

    let showsState = [.empty, .error, .filteredEmpty, .pending, .signedOut].contains(screenState)
    stateSurface.isHidden = !showsState
    if showsState {
      configureStateCard()
    }

    fitSurface.isHidden = screenState != .ready || photoAnnotations.count < 2
    if screenState != .ready {
      clearSelection(animated: animated)
    }
    setNeedsLayout()
  }

  private func configureStateCard() {
    let title: String
    let description: String
    let iconName: String
    let iconColor: UIColor
    let actionTitle: String?

    switch screenState {
    case .empty:
      title = strings.emptyTitle
      description = strings.emptyDescription
      iconName = "location.slash.fill"
      iconColor = .secondaryLabel
      actionTitle = nil
    case .filteredEmpty:
      title = strings.filteredEmptyTitle
      description = strings.filteredEmptyDescription
      iconName = "line.3.horizontal.decrease.circle.fill"
      iconColor = .systemBlue
      actionTitle = strings.clearFilters
    case .error:
      title = strings.errorTitle
      description = strings.errorDescription
      iconName = "exclamationmark.triangle.fill"
      iconColor = .systemRed
      actionTitle = strings.retry
    case .pending:
      title = strings.pendingTitle
      description = strings.pendingDescription
      iconName = "clock.fill"
      iconColor = .secondaryLabel
      actionTitle = nil
    case .signedOut:
      title = strings.signedOutTitle
      description = strings.signedOutDescription
      iconName = "map.fill"
      iconColor = .systemBlue
      actionTitle = strings.signIn
    case .loading, .ready:
      return
    }

    stateIcon.image = UIImage(systemName: iconName)
    stateIcon.tintColor = iconColor
    stateTitle.text = title
    stateDescription.text = description
    stateActionButton.isHidden = actionTitle == nil
    if let actionTitle {
      var configuration = UIButton.Configuration.filled()
      configuration.title = actionTitle
      configuration.baseBackgroundColor = .systemBlue
      configuration.baseForegroundColor = .white
      configuration.buttonSize = .medium
      configuration.cornerStyle = .capsule
      stateActionButton.configuration = configuration
      stateActionButton.accessibilityLabel = actionTitle
    }
  }

  private func layoutStateCard() {
    guard !stateSurface.isHidden else { return }
    let width = min(350, max(bounds.width - 48, 0))
    let textWidth = max(width - 40, 0)
    let titleHeight = stateTitle.sizeThatFits(CGSize(width: textWidth, height: 80)).height
    let descriptionHeight = stateDescription.sizeThatFits(CGSize(width: textWidth, height: 120)).height
    let actionHeight: CGFloat = stateActionButton.isHidden ? 0 : 42
    let actionSpacing: CGFloat = stateActionButton.isHidden ? 0 : 16
    let height = 24 + 30 + 12 + titleHeight + 7 + descriptionHeight + actionSpacing + actionHeight + 24
    let frame = CGRect(
      x: (bounds.width - width) / 2,
      y: (bounds.height - height) / 2,
      width: width,
      height: height
    )
    stateSurface.frame = frame
    stateSurface.layer.cornerRadius = 24
    stateIcon.frame = CGRect(x: (width - 30) / 2, y: 24, width: 30, height: 30)
    stateTitle.frame = CGRect(x: 20, y: 66, width: textWidth, height: titleHeight)
    stateDescription.frame = CGRect(x: 20, y: 73 + titleHeight, width: textWidth, height: descriptionHeight)
    if !stateActionButton.isHidden {
      let actionWidth = min(max(stateActionButton.sizeThatFits(CGSize(width: width, height: 42)).width, 110), width - 40)
      stateActionButton.frame = CGRect(
        x: (width - actionWidth) / 2,
        y: 73 + titleHeight + descriptionHeight + 16,
        width: actionWidth,
        height: actionHeight
      )
    }
  }

  private func showPreview(for annotation: PhotoMapAnnotation, animated: Bool) {
    selectedPhotoId = annotation.id
    previewTitle.text = annotation.title ?? annotation.id
    previewDetail.text = annotation.detailText.isEmpty ? strings.previewDefaultDetail : annotation.detailText
    previewButton.accessibilityLabel = annotation.openAccessibilityLabel

    previewImage.sd_cancelCurrentImageLoad()
    let placeholder = UIImage(systemName: "photo.fill")?.withTintColor(.secondaryLabel, renderingMode: .alwaysOriginal)
    if let url = URL(string: annotation.thumbnailUrl), !annotation.thumbnailUrl.isEmpty {
      previewImage.sd_setImage(
        with: url,
        placeholderImage: placeholder,
        options: [.retryFailed, .scaleDownLargeImages]
      )
    } else {
      previewImage.image = placeholder
    }

    guard previewSurface.isHidden else {
      setNeedsLayout()
      return
    }
    previewSurface.isHidden = false
    setNeedsLayout()
    layoutIfNeeded()
    guard animated else {
      previewSurface.alpha = 1
      previewSurface.transform = .identity
      return
    }
    previewSurface.alpha = 0
    previewSurface.transform = CGAffineTransform(translationX: 0, y: 12)
    UIView.animate(
      withDuration: 0.24,
      delay: 0,
      usingSpringWithDamping: 0.82,
      initialSpringVelocity: 0.3,
      options: [.allowUserInteraction, .beginFromCurrentState],
      animations: {
        self.previewSurface.alpha = 1
        self.previewSurface.transform = .identity
      }
    )
  }

  private func hidePreview(animated: Bool) {
    previewImage.sd_cancelCurrentImageLoad()
    guard !previewSurface.isHidden else { return }
    guard animated else {
      previewSurface.isHidden = true
      previewSurface.alpha = 1
      previewSurface.transform = .identity
      return
    }
    UIView.animate(
      withDuration: 0.16,
      delay: 0,
      options: [.allowUserInteraction, .beginFromCurrentState, .curveEaseIn],
      animations: {
        self.previewSurface.alpha = 0
        self.previewSurface.transform = CGAffineTransform(translationX: 0, y: 10)
      },
      completion: { finished in
        guard finished else { return }
        self.previewSurface.isHidden = true
        self.previewSurface.alpha = 1
        self.previewSurface.transform = .identity
      }
    )
  }

  private func clearSelection(animated: Bool) {
    selectedPhotoId = ""
    for annotation in mapView.selectedAnnotations {
      if annotation is PhotoMapAnnotation {
        mapView.deselectAnnotation(annotation, animated: animated)
      }
    }
    hidePreview(animated: animated)
  }

  private func fitAllPhotos(animated: Bool) {
    guard bounds.width > 0, bounds.height > 0, !photoAnnotations.isEmpty else { return }

    if photoAnnotations.count == 1, let annotation = photoAnnotations.first {
      let region = MKCoordinateRegion(
        center: annotation.coordinate,
        latitudinalMeters: 12_000,
        longitudinalMeters: 12_000
      )
      mapView.setRegion(mapView.regionThatFits(region), animated: animated)
      return
    }

    let points = photoAnnotations.map { MKMapPoint($0.coordinate) }
    guard let first = points.first else { return }
    var rect = MKMapRect(x: first.x, y: first.y, width: 0.1, height: 0.1)
    for point in points.dropFirst() {
      rect = rect.union(MKMapRect(x: point.x, y: point.y, width: 0.1, height: 0.1))
    }

    if rect.width < 1, rect.height < 1, let annotation = photoAnnotations.first {
      let region = MKCoordinateRegion(
        center: annotation.coordinate,
        latitudinalMeters: 12_000,
        longitudinalMeters: 12_000
      )
      mapView.setRegion(mapView.regionThatFits(region), animated: animated)
      return
    }

    mapView.setVisibleMapRect(
      rect,
      edgePadding: UIEdgeInsets(top: 120, left: 56, bottom: 190, right: 56),
      animated: animated
    )
  }

  private func zoom(to cluster: MKClusterAnnotation) {
    let members = cluster.memberAnnotations.compactMap { $0 as? PhotoMapAnnotation }
    guard !members.isEmpty else { return }

    let points = members.map { MKMapPoint($0.coordinate) }
    guard let first = points.first else { return }
    var rect = MKMapRect(x: first.x, y: first.y, width: 0.1, height: 0.1)
    for point in points.dropFirst() {
      rect = rect.union(MKMapRect(x: point.x, y: point.y, width: 0.1, height: 0.1))
    }

    if rect.width < 1, rect.height < 1 {
      let region = MKCoordinateRegion(
        center: cluster.coordinate,
        latitudinalMeters: 4_000,
        longitudinalMeters: 4_000
      )
      mapView.setRegion(mapView.regionThatFits(region), animated: true)
    } else {
      mapView.setVisibleMapRect(
        rect,
        edgePadding: UIEdgeInsets(top: 120, left: 56, bottom: 190, right: 56),
        animated: true
      )
    }
  }

  @objc private func handleFitAll() {
    clearSelection(animated: true)
    fitAllPhotos(animated: true)
  }

  @objc private func handleClearSelection() {
    clearSelection(animated: true)
  }

  @objc private func handlePhotoOpen() {
    guard let annotation = photoAnnotations.first(where: { $0.id == selectedPhotoId }) else { return }
    onNativePhotoPress?(annotation.id, annotation.index)
  }

  @objc private func handleStateAction() {
    switch screenState {
    case .error:
      onNativeRetry?()
    case .filteredEmpty:
      onNativeClearFilters?()
    case .signedOut:
      onNativeSignIn?()
    case .empty, .loading, .pending, .ready:
      break
    }
  }

  func mapView(_ mapView: MKMapView, viewFor annotation: any MKAnnotation) -> MKAnnotationView? {
    if annotation is MKUserLocation {
      return nil
    }
    if let cluster = annotation as? MKClusterAnnotation {
      let view = mapView.dequeueReusableAnnotationView(
        withIdentifier: clusterAnnotationReuseIdentifier,
        for: cluster
      ) as! PhotoMapClusterView
      view.configure(annotation: cluster, accessibilityLabel: strings.clusterAccessibilityLabel)
      return view
    }
    guard let photo = annotation as? PhotoMapAnnotation else { return nil }
    let view = mapView.dequeueReusableAnnotationView(
      withIdentifier: photoAnnotationReuseIdentifier,
      for: photo
    ) as! PhotoMapAnnotationView
    view.configure(annotation: photo)
    return view
  }

  func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
    if let cluster = view.annotation as? MKClusterAnnotation {
      zoom(to: cluster)
      mapView.deselectAnnotation(cluster, animated: false)
      return
    }
    guard let photo = view.annotation as? PhotoMapAnnotation else { return }
    showPreview(for: photo, animated: true)
  }

  func mapView(_ mapView: MKMapView, didDeselect view: MKAnnotationView) {
    guard let photo = view.annotation as? PhotoMapAnnotation else { return }
    DispatchQueue.main.async { [weak self, weak mapView] in
      guard let self, let mapView, self.selectedPhotoId == photo.id else { return }
      let hasSelectedPhoto = mapView.selectedAnnotations.contains { $0 is PhotoMapAnnotation }
      guard !hasSelectedPhoto else { return }
      self.selectedPhotoId = ""
      self.hidePreview(animated: true)
    }
  }
}
