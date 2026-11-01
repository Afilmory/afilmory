import MapKit
import UIKit

final class ExhibitionMapCard: UIView, MKMapViewDelegate {
  static let mapHeight: CGFloat = 300
  static let totalHeight: CGFloat = mapHeight + 14 + 40

  var onOpen: ((String) -> Void)?
  var onFullScreen: (() -> Void)?

  let mapWindow = UIView()
  let mapView = MKMapView()
  private let chip = AFLabel.mono(size: 11, color: AFColor.textPrimary)
  private let chipBackground = UIView()
  private lazy var fullScreenButton = AFGlassButton.titled(
    String(localized: "Full screen"), symbol: "arrow.up.left.and.arrow.down.right"
  ) { [weak self] in self?.onFullScreen?() }
  private let note = UIView()
  private let noteLabel = AFLabel.ui(size: 13, color: AFColor.textPrimary)
  private let noteDetail = AFLabel.mono(size: 11)
  private(set) var model = ExhibitionMapModel(photos: [])
  private var photosByID: [String: GalleryPhoto] = [:]

  var isWindowDocked: Bool { mapWindow.superview === self }

  override init(frame: CGRect) {
    super.init(frame: frame)
    mapWindow.layer.cornerRadius = AFRadius.card
    mapWindow.layer.cornerCurve = .continuous
    mapWindow.layer.borderWidth = 1
    mapWindow.layer.borderColor = AFColor.hairline.cgColor
    mapWindow.clipsToBounds = true
    mapWindow.backgroundColor = UIColor(afHex: 0x121110)
    ExhibitionMapStyle.configure(mapView)
    mapView.delegate = self
    mapWindow.addSubview(mapView)
    chipBackground.backgroundColor = AFColor.fill
    chipBackground.layer.cornerRadius = 13
    chip.translatesAutoresizingMaskIntoConstraints = true
    chipBackground.addSubview(chip)
    fullScreenButton.accessibilityLabel = String(localized: "Full screen")
    note.backgroundColor = AFColor.filmBase
    note.layer.cornerRadius = 20
    noteLabel.translatesAutoresizingMaskIntoConstraints = true
    noteLabel.adjustsFontSizeToFitWidth = true
    noteLabel.minimumScaleFactor = 0.75
    noteDetail.translatesAutoresizingMaskIntoConstraints = true
    note.addSubview(noteLabel)
    note.addSubview(noteDetail)
    note.isAccessibilityElement = true
    [mapWindow, chipBackground, fullScreenButton, note].forEach(addSubview)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let mapFrame = CGRect(x: 12, y: 0, width: bounds.width - 24, height: Self.mapHeight)
    if isWindowDocked {
      mapWindow.frame = mapFrame
      mapView.frame = mapWindow.bounds
    }
    let chipSize = chip.sizeThatFits(CGSize(width: 240, height: 26))
    chipBackground.frame = CGRect(x: mapFrame.maxX - 14 - chipSize.width - 20, y: 14, width: chipSize.width + 20, height: 26)
    chip.frame = chipBackground.bounds.insetBy(dx: 10, dy: 0)
    let buttonSize = fullScreenButton.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
    fullScreenButton.frame = CGRect(
      x: mapFrame.maxX - 10 - buttonSize.width, y: mapFrame.maxY - 10 - buttonSize.height,
      width: buttonSize.width, height: buttonSize.height
    )
    note.frame = CGRect(x: 12, y: mapFrame.maxY + 14, width: mapFrame.width, height: 40)
    let detailSize = noteDetail.sizeThatFits(note.bounds.size)
    noteDetail.frame = CGRect(x: note.bounds.width - 16 - detailSize.width, y: 0, width: detailSize.width, height: 40)
    noteLabel.frame = CGRect(x: 16, y: 0, width: noteDetail.frame.minX - 24, height: 40)
  }

  var mapFrameInSelf: CGRect {
    CGRect(x: 12, y: 0, width: bounds.width - 24, height: Self.mapHeight)
  }

  func configure(model: ExhibitionMapModel, photos: [GalleryPhoto], numbers: [String: Int]) {
    let changed = model != self.model
    self.model = model
    photosByID = Dictionary(photos.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    chip.text = "∞ · " + Self.placesAndFrames(model)
    note.isHidden = model.unlocatedCount == 0
    noteLabel.text = String(localized: "\(model.unlocatedCount) more frames have no location")
    noteDetail.text = String(localized: "Stay in Day · Month · Year")
    note.accessibilityLabel = [noteLabel.text, noteDetail.text].compactMap { $0 }.joined(separator: ", ")
    guard changed else { return }
    mapView.removeAnnotations(mapView.annotations)
    let annotations = model.pins.compactMap { pin -> ExhibitionPhotoAnnotation? in
      guard let photo = photosByID[pin.photoID] else { return nil }
      return ExhibitionPhotoAnnotation(photo: photo, pin: pin, number: numbers[pin.photoID] ?? 0)
    }
    mapView.addAnnotations(annotations)
    if let region = ExhibitionMapStyle.region(fitting: model.places) {
      mapView.setRegion(region, animated: false)
    }
    setNeedsLayout()
  }

  static func placesAndFrames(_ model: ExhibitionMapModel) -> String {
    String(localized: "\(model.places.count) places · \(model.located.count) frames")
  }

  func focus(on photoID: String, animated: Bool) {
    guard let place = model.place(of: photoID) else { return }
    let region = MKCoordinateRegion(center: place.coordinate, latitudinalMeters: 30_000, longitudinalMeters: 30_000)
    mapView.setRegion(region, animated: animated)
  }

  func pinViews() -> [String: ExhibitionPinView] {
    var views: [String: ExhibitionPinView] = [:]
    for annotation in mapView.annotations {
      guard let photo = annotation as? ExhibitionPhotoAnnotation,
            let view = mapView.view(for: photo) as? ExhibitionPinView
      else { continue }
      views[photo.photo.id] = view
    }
    return views
  }

  func setPinsHidden(_ hidden: Bool) {
    pinViews().values.forEach { $0.alpha = hidden ? 0 : 1 }
  }

  func pinTarget(for photoID: String, in view: UIView) -> (center: CGPoint, rotation: CGFloat)? {
    guard let annotation = mapView.annotations.compactMap({ $0 as? ExhibitionPhotoAnnotation }).first(where: { $0.photo.id == photoID })
    else { return nil }
    let point = mapView.convert(annotation.coordinate, toPointTo: view)
    return (CGPoint(x: point.x + annotation.pin.offset.x, y: point.y + annotation.pin.offset.y), annotation.pin.rotationDegrees)
  }

  func setChromeHidden(_ hidden: Bool) {
    chipBackground.alpha = hidden ? 0 : 1
    fullScreenButton.alpha = hidden ? 0 : 1
  }

  func dock() {
    guard !isWindowDocked else { return }
    insertSubview(mapWindow, at: 0)
    mapWindow.layer.cornerRadius = AFRadius.card
    mapWindow.layer.borderColor = AFColor.hairline.cgColor
    setNeedsLayout()
    layoutIfNeeded()
  }

  func mapView(_ mapView: MKMapView, viewFor annotation: any MKAnnotation) -> MKAnnotationView? {
    guard annotation is ExhibitionPhotoAnnotation else { return nil }
    return mapView.dequeueReusableAnnotationView(withIdentifier: ExhibitionPinView.reuseID, for: annotation)
  }

  func mapView(_ mapView: MKMapView, didSelect annotation: any MKAnnotation) {
    mapView.deselectAnnotation(annotation, animated: false)
    guard let photo = annotation as? ExhibitionPhotoAnnotation else { return }
    onOpen?(photo.photo.id)
  }
}
