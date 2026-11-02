@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class DetailEntryPlaceholderTests: XCTestCase {
  private var window: UIWindow?

  override func tearDown() {
    window?.isHidden = true
    window = nil
    super.tearDown()
  }

  func testEnteringDetailKeepsTheGridThumbnailInsteadOfTheThumbHash() throws {
    let thumbnail = UIGraphicsImageRenderer(size: CGSize(width: 30, height: 20)).image { context in
      UIColor.red.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 30, height: 20))
    }
    let source = UIImageView(image: thumbnail)
    let photo = GalleryPhoto(
      id: "a", title: "a", description: "", originalUrl: "https://example.invalid/a.jpg", thumbnailUrl: "https://example.invalid/a-thumb.jpg",
      thumbHash: "1QcSHQRnh493V4dIh4eXh1h4kJUI", aspectRatio: 1.5, width: 3, height: 2, format: nil, size: nil,
      dateTaken: "2026-07-19T23:13:00", video: nil, tags: [], exif: nil,
      toneAnalysis: nil, location: nil, camera: nil, lens: nil, rating: nil, city: nil
    )
    let root = UIViewController()
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
    window.rootViewController = root
    window.makeKeyAndVisible()
    self.window = window
    root.view.addSubview(source)
    PhotoDetailPresenter.present(photos: [photo], index: 0, gallerySlug: nil, from: root) { _ in source }
    let presented = try XCTUnwrap(root.presentedViewController)
    let detail = try XCTUnwrap(DetailTransitionAnimator.detail(in: presented))
    RunLoop.main.run(until: Date().addingTimeInterval(0.2))
    XCTAssertTrue(detail.currentCell?.imageView.image === thumbnail)
  }
}
