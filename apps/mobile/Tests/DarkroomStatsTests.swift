@testable import Afilmory
import XCTest

final class DarkroomStatsTests: XCTestCase {
  func testOverviewSuppliesFramesAndStorage() throws {
    let overview = try stats(totalPhotos: 18, bytes: 327_400_000)
    let result = DarkroomStats(overview: overview, photos: [])
    XCTAssertEqual(result.frames, 18)
    XCTAssertEqual(result.megabytes, 327)
  }

  func testWithoutOverviewFallsBackToPhotoFeed() {
    let photos = [
      photo(size: 2_000_000, make: "FUJIFILM", model: "X-T5"),
      photo(size: 1_600_000, make: "FUJIFILM", model: "X-T5"),
    ]
    let result = DarkroomStats(overview: nil, photos: photos)
    XCTAssertEqual(result.frames, 2)
    XCTAssertEqual(result.megabytes, 4)
  }

  func testBodiesCountDistinctCamerasIgnoringCase() {
    let photos = [
      photo(make: "FUJIFILM", model: "X-T5"),
      photo(make: "Fujifilm", model: "X-T5"),
      photo(make: "Apple", model: "iPhone 16 Pro"),
      photo(make: "NIKON CORPORATION", model: "NIKON Z 8"),
      photo(make: nil, model: nil),
    ]
    let result = DarkroomStats(overview: nil, photos: photos)
    XCTAssertEqual(result.bodies, 3)
  }

  func testEmptyLibraryIsAllZero() {
    let result = DarkroomStats(overview: nil, photos: [])
    XCTAssertEqual(result, DarkroomStats(frames: 0, megabytes: 0, bodies: 0))
  }

  func testPendingRepliesDetail() {
    XCTAssertEqual(DarkroomStats.pendingRepliesDetail(count: 0, hasMore: false), "0 pending")
    XCTAssertEqual(DarkroomStats.pendingRepliesDetail(count: 20, hasMore: true), "20+ pending")
  }

  private func stats(totalPhotos: Int, bytes: Int64) throws -> StudioDashboardStats {
    let json = #"{"totalPhotos":\#(totalPhotos),"totalStorageBytes":\#(bytes),"thisMonthUploads":0,"sync":{"pending":0,"conflicts":0}}"#
    return try JSONDecoder().decode(StudioDashboardStats.self, from: Data(json.utf8))
  }

  private func photo(size: Double? = nil, make: String?, model: String?) -> GalleryPhoto {
    var exif: [String: JSONValue] = [:]
    if let make { exif["Make"] = .string(make) }
    if let model { exif["Model"] = .string(model) }
    return GalleryPhoto(
      id: UUID().uuidString, title: "DSC", description: "", originalUrl: "", thumbnailUrl: "",
      thumbHash: nil, aspectRatio: 1, width: 1, height: 1, format: nil, size: size,
      dateTaken: nil, video: nil, tags: [], exif: GalleryExif(values: exif),
      toneAnalysis: nil, location: nil, camera: nil, lens: nil, rating: nil, city: nil
    )
  }
}
