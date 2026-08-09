import Foundation
import XCTest
@testable import Afilmory

final class UploadJobPreparerTests: XCTestCase {
  func testFileBodySanitizesMultipartHeadersWithoutChangingPayload() throws {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }

    let payload = Data([0x00, 0x01, 0x02, 0xFF])
    let sourceURL = directory.appendingPathComponent("source.bin")
    let bodyURL = directory.appendingPathComponent("body.multipart")
    try payload.write(to: sourceURL)

    let file = UploadStagedFile(
      url: sourceURL,
      name: "unsafe\\\"\r\n.jpg",
      mimeType: "image/jpeg\r\nX-Injected: true"
    )
    let prepared = try UploadJobPreparer.buildBody(
      forFiles: [file],
      directory: "travel/night",
      boundary: "test-boundary",
      to: bodyURL
    )
    let body = try Data(contentsOf: bodyURL)

    XCTAssertEqual(prepared.name, "unsafe____.jpg")
    XCTAssertEqual(prepared.bytes, Int64(body.count))
    XCTAssertNotNil(body.range(of: Data("filename=\"unsafe____.jpg\"".utf8)))
    XCTAssertNotNil(body.range(of: Data("Content-Type: application/octet-stream".utf8)))
    XCTAssertNotNil(body.range(of: payload))
  }

  func testLivePhotoBodyContainsMatchedPhotoAndVideoInOneMultipartRequest() throws {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }

    let photoPayload = Data("heic-payload".utf8)
    let videoPayload = Data("mov-payload".utf8)
    let photoURL = directory.appendingPathComponent("photo.heic")
    let videoURL = directory.appendingPathComponent("video.mov")
    let bodyURL = directory.appendingPathComponent("body.multipart")
    try photoPayload.write(to: photoURL)
    try videoPayload.write(to: videoURL)

    let asset = try UploadStagedAsset(
      id: "live-photo",
      photo: UploadStagedFile(url: photoURL, name: "IMG_5484.heic", mimeType: "image/heic"),
      pairedVideo: UploadStagedFile(url: videoURL, name: "IMG_5484.mov", mimeType: "video/quicktime")
    )
    let prepared = try UploadJobPreparer.buildBody(
      forFiles: asset.files,
      directory: nil,
      boundary: "live-photo-boundary",
      to: bodyURL
    )
    let body = try Data(contentsOf: bodyURL)

    XCTAssertEqual(prepared.name, "IMG_5484.heic")
    XCTAssertEqual(prepared.bytes, Int64(body.count))
    XCTAssertNotNil(body.range(of: Data("filename=\"IMG_5484.heic\"".utf8)))
    XCTAssertNotNil(body.range(of: Data("Content-Type: image/heic".utf8)))
    XCTAssertNotNil(body.range(of: Data("filename=\"IMG_5484.mov\"".utf8)))
    XCTAssertNotNil(body.range(of: Data("Content-Type: video/quicktime".utf8)))
    XCTAssertNotNil(body.range(of: photoPayload))
    XCTAssertNotNil(body.range(of: videoPayload))
    XCTAssertEqual(occurrences(of: "--live-photo-boundary--\r\n", in: body), 1)
  }

  func testStagedLivePhotoRejectsMismatchedBaseFilenames() throws {
    let photo = UploadStagedFile(
      url: URL(fileURLWithPath: "/tmp/photo.heic"),
      name: "IMG_5484.heic",
      mimeType: "image/heic"
    )
    let video = UploadStagedFile(
      url: URL(fileURLWithPath: "/tmp/video.mov"),
      name: "IMG_9999.mov",
      mimeType: "video/quicktime"
    )

    XCTAssertThrowsError(try UploadStagedAsset(id: "live-photo", photo: photo, pairedVideo: video)) { error in
      guard case UploadPrepareError.mismatchedLivePhotoResources = error else {
        return XCTFail("Unexpected error: \(error)")
      }
    }
  }

  func testShareUploadHandoffParsesBatchAndTags() throws {
    let batchID = "2B14C4D1-9BC7-44DE-9949-22B0564E8A37"
    let url = try XCTUnwrap(
      URL(string: "afilmory:///share-upload?batchID=\(batchID)&tags=travel%2Cnight")
    )

    XCTAssertEqual(
      ShareUploadHandoff.parameters(from: url, scheme: "afilmory"),
      .init(batchID: batchID, tags: "travel,night")
    )
    XCTAssertNil(ShareUploadHandoff.parameters(from: URL(string: "https://example.com")!))
    XCTAssertNil(
      ShareUploadHandoff.parameters(
        from: URL(string: "afilmory://share-upload?batchID=invalid")!,
        scheme: "afilmory"
      )
    )
    XCTAssertNil(ShareUploadHandoff.parameters(from: url, scheme: "afilmory-local"))
  }

  private func occurrences(of value: String, in data: Data) -> Int {
    let needle = Data(value.utf8)
    var count = 0
    var start = data.startIndex
    while start < data.endIndex,
          let range = data.range(of: needle, options: [], in: start..<data.endIndex) {
      count += 1
      start = range.upperBound
    }
    return count
  }
}
