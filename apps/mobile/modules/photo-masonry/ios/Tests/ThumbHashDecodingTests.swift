import XCTest
@testable import Afilmory

final class ThumbHashDecodingTests: XCTestCase {
  func testDecodingMatchesTheReferenceImplementation() throws {
    let hash = Data([
      0x21, 0x18, 0x0a, 0x15, 0x04, 0xa1, 0x76, 0x60, 0x68, 0x67, 0xa6,
      0xa7, 0x8a, 0x97, 0x45, 0x58, 0x0e, 0x8b, 0xef, 0xe1, 0xf7,
    ])

    let (width, height, rgba) = thumbHashToRGBA(hash: hash)

    XCTAssertEqual(width, 23)
    XCTAssertEqual(height, 32)
    XCTAssertEqual(pixel(in: rgba, width: width, x: 0, y: 0), [86, 37, 29, 255])
    XCTAssertEqual(pixel(in: rgba, width: width, x: 22, y: 0), [132, 115, 129, 255])
    XCTAssertEqual(pixel(in: rgba, width: width, x: 11, y: 16), [169, 160, 161, 255])
    XCTAssertEqual(pixel(in: rgba, width: width, x: 22, y: 31), [177, 198, 209, 255])
  }

  func testDecodedUIImagePreservesTheReferenceColorChannels() throws {
    let hash = Data([
      0x21, 0x18, 0x0a, 0x15, 0x04, 0xa1, 0x76, 0x60, 0x68, 0x67, 0xa6,
      0xa7, 0x8a, 0x97, 0x45, 0x58, 0x0e, 0x8b, 0xef, 0xe1, 0xf7,
    ])
    let image = thumbHashToImage(hash: hash)
    let cgImage = try XCTUnwrap(image.cgImage)
    var rendered = Data(count: cgImage.width * cgImage.height * 4)
    rendered.withUnsafeMutableBytes { bytes in
      let context = CGContext(
        data: bytes.baseAddress,
        width: cgImage.width,
        height: cgImage.height,
        bitsPerComponent: 8,
        bytesPerRow: cgImage.width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      )!
      context.draw(cgImage, in: CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height))
    }

    let averages = (0..<3).map { channel in
      stride(from: channel, to: rendered.count, by: 4)
        .reduce(0) { $0 + Int(rendered[$1]) } / (cgImage.width * cgImage.height)
    }
    XCTAssertEqual(averages[0], 140, accuracy: 2)
    XCTAssertEqual(averages[1], 128, accuracy: 2)
    XCTAssertEqual(averages[2], 130, accuracy: 2)
  }

  func testHighChromaHashMatchesTheReferenceImplementation() {
    let hash = Data([
      0x1f, 0xf8, 0x09, 0xb5, 0x0c, 0x70, 0x84, 0x78, 0x88, 0x87, 0x87,
      0x77, 0x78, 0x78, 0x77, 0x78, 0x7f, 0x87, 0xf7, 0x88, 0x77,
    ])

    let (width, height, rgba) = thumbHashToRGBA(hash: hash)

    XCTAssertEqual(width, 23)
    XCTAssertEqual(height, 32)
    XCTAssertEqual(pixel(in: rgba, width: width, x: 0, y: 0), [167, 110, 0, 255])
    XCTAssertEqual(pixel(in: rgba, width: width, x: 22, y: 0), [52, 109, 255, 255])
    XCTAssertEqual(pixel(in: rgba, width: width, x: 11, y: 16), [146, 150, 113, 255])
    XCTAssertEqual(pixel(in: rgba, width: width, x: 22, y: 31), [81, 154, 255, 255])
  }

  private func pixel(in data: Data, width: Int, x: Int, y: Int) -> [UInt8] {
    let offset = (y * width + x) * 4
    return Array(data[offset ..< offset + 4])
  }
}
