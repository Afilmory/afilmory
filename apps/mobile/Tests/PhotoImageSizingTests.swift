@testable import Afilmory
import SDWebImage
import XCTest

final class PhotoImageSizingTests: XCTestCase {
  func testOriginalIsDecodedAtTheDisplayedPixelSize() {
    let size = PhotoImageSizing.pixelSize(aspectRatio: 1.5, fitting: CGSize(width: 402, height: 874), scale: 3)
    XCTAssertEqual(size.width, 1206, accuracy: 0.5)
    XCTAssertEqual(size.height, 804, accuracy: 0.5)
  }

  func testZoomHeadroomIsCappedAtTheMaximumEdge() {
    let size = PhotoImageSizing.pixelSize(aspectRatio: 1.5, fitting: CGSize(width: 402, height: 874), scale: 3, headroom: 4)
    XCTAssertEqual(max(size.width, size.height), PhotoImageSizing.maxPixelEdge, accuracy: 0.5)
    XCTAssertEqual(size.width / size.height, 1.5, accuracy: 0.01)
  }

  func testTallPhotoFitsByHeight() {
    let size = PhotoImageSizing.pixelSize(aspectRatio: 0.5, fitting: CGSize(width: 400, height: 400), scale: 2)
    XCTAssertEqual(size.height, 800, accuracy: 0.5)
    XCTAssertEqual(size.width, 400, accuracy: 0.5)
  }

  func testContextRequestsADownscaledDecode() {
    let context = PhotoImageSizing.context(aspectRatio: 1.5, fitting: CGSize(width: 100, height: 100), scale: 2)
    let value = context[.imageThumbnailPixelSize] as? NSValue
    XCTAssertEqual(value?.cgSizeValue.width ?? 0, 200, accuracy: 0.5)
  }

  func testImageCacheMemoryIsBounded() {
    let cache = SDImageCache(namespace: "sizing-test")
    PhotoImageSizing.configure(cache)
    XCTAssertEqual(cache.config.maxMemoryCost, PhotoImageSizing.memoryCacheCost)
  }
}
