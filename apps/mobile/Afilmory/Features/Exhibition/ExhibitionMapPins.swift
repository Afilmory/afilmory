import MapKit
import UIKit

final class ExhibitionPhotoAnnotation: NSObject, MKAnnotation {
  let photo: GalleryPhoto
  let pin: ExhibitionMapPin
  let number: Int

  init(photo: GalleryPhoto, pin: ExhibitionMapPin, number: Int) {
    self.photo = photo
    self.pin = pin
    self.number = number
  }

  var coordinate: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: pin.latitude, longitude: pin.longitude)
  }

  var title: String? {
    String(localized: "Open No. \(ExhibitFormat.frameNumber(number))")
  }
}

final class ExhibitionPinView: MKAnnotationView {
  static let reuseID = "photo-pin"
  static let size: CGFloat = 52

  let imageView = UIImageView()

  override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
    super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
    frame = CGRect(x: 0, y: 0, width: Self.size, height: Self.size)
    canShowCallout = false
    layer.shadowColor = UIColor.black.cgColor
    layer.shadowOpacity = 0.5
    layer.shadowRadius = 9
    layer.shadowOffset = CGSize(width: 0, height: 8)
    imageView.frame = bounds
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.layer.cornerRadius = AFRadius.thumb
    imageView.layer.cornerCurve = .continuous
    imageView.layer.borderWidth = 2
    imageView.layer.borderColor = AFColor.textPrimary.cgColor
    imageView.backgroundColor = AFColor.fill
    addSubview(imageView)
    isAccessibilityElement = true
    accessibilityTraits = .button
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var annotation: (any MKAnnotation)? {
    didSet { configure() }
  }

  private func configure() {
    guard let annotation = annotation as? ExhibitionPhotoAnnotation else { return }
    imageView.afSetPhoto(annotation.photo, targetWidth: Self.size)
    centerOffset = annotation.pin.offset
    transform = CGAffineTransform(rotationAngle: annotation.pin.rotationDegrees * .pi / 180)
    zPriority = MKAnnotationViewZPriority(rawValue: Float(100 - abs(annotation.pin.rotationDegrees)))
    accessibilityLabel = annotation.title ?? nil
  }
}

@MainActor
enum ExhibitionMapStyle {
  static func configure(_ map: MKMapView) {
    map.overrideUserInterfaceStyle = .dark
    let configuration = MKStandardMapConfiguration(elevationStyle: .flat, emphasisStyle: .muted)
    configuration.pointOfInterestFilter = .excludingAll
    map.preferredConfiguration = configuration
    map.mapType = .mutedStandard
    map.showsCompass = false
    map.showsScale = false
    map.pointOfInterestFilter = .excludingAll
    map.register(ExhibitionPinView.self, forAnnotationViewWithReuseIdentifier: ExhibitionPinView.reuseID)
    map.backgroundColor = UIColor(afHex: 0x121110)
  }

  static func region(fitting places: [ExhibitionMapPlace]) -> MKCoordinateRegion? {
    guard !places.isEmpty else { return nil }
    let latitudes = places.map(\.latitude)
    let longitudes = places.map(\.longitude)
    let center = CLLocationCoordinate2D(
      latitude: (latitudes.min()! + latitudes.max()!) / 2,
      longitude: (longitudes.min()! + longitudes.max()!) / 2
    )
    let span = MKCoordinateSpan(
      latitudeDelta: min(170, max(0.4, (latitudes.max()! - latitudes.min()!) * 1.6)),
      longitudeDelta: min(350, max(0.4, (longitudes.max()! - longitudes.min()!) * 1.6))
    )
    return MKCoordinateRegion(center: center, span: span)
  }
}
