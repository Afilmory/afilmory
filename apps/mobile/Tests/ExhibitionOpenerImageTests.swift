@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class ExhibitionOpenerImageTests: XCTestCase {
  private func image(_ color: UIColor) -> UIImage {
    UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
      color.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
    }
  }

  func testLateThumbnailNeverReplacesTheOriginal() {
    let opener = ExhibitionOpenerView(frame: CGRect(x: 0, y: 0, width: 400, height: 600))
    let original = image(.red)
    opener.show(original, stage: .original, animated: false)
    opener.show(image(.blue), stage: .thumbnail, animated: false)
    XCTAssertTrue(opener.imageView.image === original)
  }

  func testUpgradeCrossfadesOnlyTheImageContents() {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
    let opener = ExhibitionOpenerView(frame: window.bounds)
    window.addSubview(opener)
    window.makeKeyAndVisible()
    opener.show(image(.blue), stage: .thumbnail, animated: false)
    opener.show(image(.red), stage: .original, animated: true)
    let keys = opener.imageView.layer.animationKeys() ?? []
    XCTAssertFalse(keys.contains { opener.imageView.layer.animation(forKey: $0) is CATransition })
    XCTAssertTrue(keys.contains { (opener.imageView.layer.animation(forKey: $0) as? CABasicAnimation)?.keyPath == "contents" })
    window.isHidden = true
  }

  func testReconfiguringTheSamePhotoKeepsTheSharpImage() {
    let opener = ExhibitionOpenerView(frame: CGRect(x: 0, y: 0, width: 400, height: 600))
    let photo = GalleryPhoto(
      id: "a", title: "a", description: "", originalUrl: "https://example.invalid/a.jpg", thumbnailUrl: "https://example.invalid/t.jpg",
      thumbHash: "1QcSHQRnh493V4dIh4eXh1h4kJUI", aspectRatio: 1.5, width: 3, height: 2, format: nil, size: nil,
      dateTaken: "2026-07-19T23:13:00", video: nil, tags: [], exif: nil,
      toneAnalysis: nil, location: nil, camera: nil, lens: nil, rating: nil, city: nil
    )
    opener.configure(photo: photo, number: 1, accent: nil)
    let original = image(.red)
    opener.show(original, stage: .original, animated: false)
    opener.configure(photo: photo, number: 1, accent: nil)
    XCTAssertTrue(opener.imageView.image === original)
  }
}
