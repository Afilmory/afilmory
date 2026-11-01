import CoreGraphics
import CoreLocation
import Foundation

struct ExhibitionMapPlace: Equatable, Sendable {
  let latitude: Double
  let longitude: Double
  let photoIDs: [String]

  var coordinate: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
  }
}

struct ExhibitionMapPin: Equatable, Sendable {
  let photoID: String
  let latitude: Double
  let longitude: Double
  let offset: CGPoint
  let rotationDegrees: CGFloat
}

struct ExhibitionMapModel: Equatable, Sendable {
  static let clusterRadiusMeters: Double = 25_000
  static let pinsPerPlace = 3

  let located: [String]
  let unlocatedCount: Int
  let places: [ExhibitionMapPlace]

  init(photos: [GalleryPhoto]) {
    var located: [String] = []
    var places: [(latitude: Double, longitude: Double, ids: [String])] = []
    for photo in photos {
      guard let coordinates = photo.coordinates else { continue }
      located.append(photo.id)
      let point = CLLocation(latitude: coordinates.latitude, longitude: coordinates.longitude)
      if let index = places.firstIndex(where: {
        CLLocation(latitude: $0.latitude, longitude: $0.longitude).distance(from: point) <= Self.clusterRadiusMeters
      }) {
        places[index].ids.append(photo.id)
      } else {
        places.append((coordinates.latitude, coordinates.longitude, [photo.id]))
      }
    }
    self.located = located
    unlocatedCount = photos.count - located.count
    self.places = places.map { ExhibitionMapPlace(latitude: $0.latitude, longitude: $0.longitude, photoIDs: $0.ids) }
  }

  var hasLocations: Bool { !located.isEmpty }

  var pins: [ExhibitionMapPin] {
    places.flatMap { place in
      let shown = Array(place.photoIDs.prefix(Self.pinsPerPlace))
      return shown.enumerated().map { index, id in
        let fan = Self.fan(index: index, count: shown.count)
        return ExhibitionMapPin(
          photoID: id,
          latitude: place.latitude,
          longitude: place.longitude,
          offset: fan.offset,
          rotationDegrees: fan.rotation
        )
      }
    }
  }

  func place(of photoID: String) -> ExhibitionMapPlace? {
    places.first { $0.photoIDs.contains(photoID) }
  }

  static func fan(index: Int, count: Int) -> (offset: CGPoint, rotation: CGFloat) {
    guard count > 1 else { return (.zero, 0) }
    let step = CGFloat(index) - CGFloat(count - 1) / 2
    let unit = step / (CGFloat(count - 1) / 2)
    return (CGPoint(x: 10 * unit, y: 6 * unit), 7 * unit)
  }
}
