@testable import Afilmory
import XCTest

final class ExhibitionMapModelTests: XCTestCase {
  func testCountsLocatedAndUnlocatedFrames() {
    let model = ExhibitionMapModel(photos: [
      photo("a", 32.05, 118.78), photo("b", nil, nil), photo("c", 32.06, 118.79), photo("d", 40.7, -74.0),
    ])
    XCTAssertEqual(model.located, ["a", "c", "d"])
    XCTAssertEqual(model.unlocatedCount, 1)
    XCTAssertTrue(model.hasLocations)
  }

  func testNearbyFramesShareAPlace() {
    let model = ExhibitionMapModel(photos: [photo("a", 32.05, 118.78), photo("c", 32.06, 118.79), photo("d", 40.7, -74.0)])
    XCTAssertEqual(model.places.map(\.photoIDs), [["a", "c"], ["d"]])
    XCTAssertEqual(model.place(of: "c")?.photoIDs, ["a", "c"])
  }

  func testNoLocationsHidesTheMapLevel() {
    let model = ExhibitionMapModel(photos: [photo("b", nil, nil)])
    XCTAssertFalse(model.hasLocations)
    XCTAssertTrue(model.pins.isEmpty)
  }

  func testFanSpreadsClusterWithinSevenDegrees() {
    XCTAssertEqual(ExhibitionMapModel.fan(index: 0, count: 1).rotation, 0)
    let three = (0..<3).map { ExhibitionMapModel.fan(index: $0, count: 3) }
    XCTAssertEqual(three.map(\.rotation), [-7, 0, 7])
    XCTAssertEqual(three[0].offset, CGPoint(x: -10, y: -6))
    XCTAssertEqual(ExhibitionMapModel.fan(index: 1, count: 2).rotation, 7)
  }

  func testPinsCapPerPlace() {
    let crowd = (0..<6).map { photo("p\($0)", 32.05, 118.78) }
    XCTAssertEqual(ExhibitionMapModel(photos: crowd).pins.count, ExhibitionMapModel.pinsPerPlace)
  }

  private func photo(_ id: String, _ latitude: Double?, _ longitude: Double?) -> GalleryPhoto {
    let location = latitude.map { GalleryLocation(latitude: $0, longitude: longitude, country: nil, city: nil, locationName: nil) }
    return GalleryPhoto(
      id: id, title: id, description: "", originalUrl: "", thumbnailUrl: "",
      thumbHash: nil, aspectRatio: 1, width: 1, height: 1, format: nil, size: nil,
      dateTaken: nil, video: nil, tags: [], exif: nil,
      toneAnalysis: nil, location: location, camera: nil, lens: nil, rating: nil, city: nil
    )
  }
}
