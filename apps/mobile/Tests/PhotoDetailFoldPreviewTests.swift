import UIKit
import XCTest

@testable import Afilmory

@MainActor
final class PhotoDetailFoldPreviewTests: XCTestCase {
  private var window: UIWindow!
  private var directory: URL!
  private var animationsEnabled = true

  override func setUp() async throws {
    try await super.setUp()
    animationsEnabled = UIView.areAnimationsEnabled
    UIView.setAnimationsEnabled(false)
    directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    window = UIWindow(windowScene: scene)
  }

  override func tearDown() async throws {
    window.isHidden = true
    window.rootViewController = nil
    window = nil
    try FileManager.default.removeItem(at: directory)
    UIView.setAnimationsEnabled(animationsEnabled)
    try await super.tearDown()
  }

  func testExpandedFoldOpensPhotoBesideItsInformation() async throws {
    let detail = try await showDetail()
    let fold = try verticalFold(in: detail.view)
    let info = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailInfoView })
    let viewer = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoViewerView })

    XCTAssertGreaterThan(info.convert(info.bounds, to: detail.view).intersection(detail.view.bounds).width, 200)
    XCTAssertLessThanOrEqual(viewer.convert(viewer.bounds, to: detail.view).maxX, fold.midX + 1)
    XCTAssertGreaterThanOrEqual(info.convert(info.bounds, to: detail.view).minX, fold.midX - 1)
    XCTAssertEqual(detail.detailView.transitionPhotoId, "photo-1")
  }

  func testPreviewActionsBelongToTheSystemNavigationContainer() async throws {
    let detail = try await showDetail()
    _ = try verticalFold(in: detail.view)
    let controller: UIViewController = detail
    let navigation = try XCTUnwrap(controller as? UINavigationController)
    XCTAssertEqual(navigation.topViewController?.navigationItem.leftBarButtonItem?.accessibilityIdentifier, "photo-detail-back")
    XCTAssertTrue(navigation.topViewController?.navigationItem.rightBarButtonItems?.contains {
      $0.accessibilityIdentifier == "photo-detail-fullscreen"
    } == true)
    if #available(iOS 27.1, *) {
      let content = try XCTUnwrap(navigation.topViewController)
      XCTAssertTrue(content.children.contains { $0 is UIArrangementViewController })
    }
  }

  func testInspectorFollowsPresentationOpacityAcrossLayoutPasses() async throws {
    let detail = try await showDetail()
    _ = try verticalFold(in: detail.view)
    let info = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailInfoView })
    detail.detailView.prepareTransition(mediaTransform: .identity, backdropAlpha: 0, chromeAlpha: 0)
    XCTAssertEqual(info.alpha, 0)
    detail.detailView.setNeedsLayout()
    detail.detailView.layoutIfNeeded()
    XCTAssertEqual(info.alpha, 0)
    detail.detailView.applyTransition(mediaTransform: .identity, mediaAlpha: 1, backdropAlpha: 1, chromeAlpha: 0.5)
    detail.detailView.setNeedsLayout()
    detail.detailView.layoutIfNeeded()
    XCTAssertEqual(info.alpha, 0.5)
    detail.detailView.completePresentedTransition()
    XCTAssertEqual(info.alpha, 1)
    XCTAssertEqual(detail.detailView.transitionPhotoId, "photo-1")
  }

  func testAnimatedOpeningFadesInspectorWithoutMovingItsColumn() async throws {
    let presenter = UIViewController()
    let source = UIImageView(image: UIImage(named: "signin-DSCF0842"))
    source.frame = CGRect(x: 24, y: 120, width: 180, height: 270)
    presenter.view.addSubview(source)
    window.rootViewController = presenter
    window.makeKeyAndVisible()
    let fold = try verticalFold(in: presenter.view)
    let detail = try makeDetail(sourceProvider: { _ in source })
    UIView.setAnimationsEnabled(true)
    presenter.present(detail, animated: true)

    var previousOpacity: Float = 0
    var visibleFrame: CGRect?
    var sawPartialOpacity = false
    for _ in 0..<24 {
      try await Task.sleep(for: .milliseconds(30))
      let info = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailInfoView })
      let opacity = info.layer.presentation()?.opacity ?? Float(info.alpha)
      XCTAssertGreaterThanOrEqual(opacity + 0.02, previousOpacity)
      previousOpacity = opacity
      if opacity > 0.02 {
        let frame = info.convert(info.bounds, to: detail.view)
        XCTAssertGreaterThanOrEqual(frame.minX, fold.midX - 1)
        if let visibleFrame {
          XCTAssertEqual(frame.minX, visibleFrame.minX, accuracy: 1)
          XCTAssertEqual(frame.width, visibleFrame.width, accuracy: 1)
        }
        visibleFrame = frame
      }
      sawPartialOpacity = sawPartialOpacity || (opacity > 0.02 && opacity < 0.98)
    }
    XCTAssertTrue(sawPartialOpacity)
    XCTAssertEqual(previousOpacity, 1)
    XCTAssertEqual(detail.detailView.transitionPhotoId, "photo-1")
    XCTAssertFalse(source.isHidden)
  }

  func testNavigationTitleKeepsPaddingWithOrWithoutSubtitle() async throws {
    let detail = try await showDetail()
    let bar = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailNavigationBar } as? PhotoDetailNavigationBar)
    for subtitle in ["", "15:30"] {
      bar.setTitle("DSCF0842", subtitle: subtitle)
      detail.view.setNeedsLayout()
      detail.view.layoutIfNeeded()
      bar.layoutIfNeeded()
      let title = try XCTUnwrap(bar.topItem?.titleView)
      title.layoutIfNeeded()
      XCTAssertGreaterThanOrEqual(title.bounds.height, 44)
      for label in descendants(title).compactMap({ $0 as? UILabel }).filter({ !$0.isHidden }) {
        let rect = label.convert(label.bounds, to: title)
        XCTAssertGreaterThanOrEqual(rect.minY, 4)
        XCTAssertLessThanOrEqual(rect.maxY, title.bounds.height - 4)
      }
    }
  }

  func testFullScreenAnimatesTheImageInBothDirections() async throws {
    try XCTSkipIf(UIAccessibility.isReduceMotionEnabled)
    let source = try XCTUnwrap(UIImage(named: "signin-DSCF0842"))
    let scale = max(900 / source.size.width, 600 / source.size.height)
    let size = CGSize(width: source.size.width * scale, height: source.size.height * scale)
    let image = UIGraphicsImageRenderer(size: CGSize(width: 900, height: 600)).image { _ in
      source.draw(in: CGRect(x: (900 - size.width) / 2, y: (600 - size.height) / 2, width: size.width, height: size.height))
    }
    let detail = try await showDetail(image: image)
    _ = try verticalFold(in: detail.view)
    let action = try XCTUnwrap(detail.navigationBar.topItem?.rightBarButtonItems?.first?.primaryAction)
    let preview = try presentationImageFrame(in: detail)
    let info = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailInfoView })
    UIView.setAnimationsEnabled(true)
    for entering in [true, false] {
      let start = try presentationImageFrame(in: detail)
      UIControl().sendAction(action)
      var frames: [CGRect] = []
      var infoOpacities: [Float] = []
      for _ in 0..<24 {
        try await Task.sleep(for: .milliseconds(25))
        frames.append(try presentationImageFrame(in: detail))
        infoOpacities.append(info.layer.presentation()?.opacity ?? Float(info.alpha))
      }
      let end = try XCTUnwrap(frames.last)
      for frame in frames { XCTAssertEqual(frame.width / frame.height, 1.5, accuracy: 0.02) }
      XCTAssertTrue(frames.contains {
        $0.midX > min(start.midX, end.midX) + 2 && $0.midX < max(start.midX, end.midX) - 2
          && $0.width > min(start.width, end.width) + 2 && $0.width < max(start.width, end.width) - 2
      }, "The image must move and resize through intermediate frames")
      if entering {
        XCTAssertGreaterThan(end.width, preview.width + 100)
        XCTAssertGreaterThan(end.midX, preview.midX + 100)
      } else {
        XCTAssertTrue(infoOpacities.contains { $0 > 0.02 && $0 < 0.98 })
        XCTAssertEqual(end.midX, preview.midX, accuracy: 1)
        XCTAssertEqual(end.width, preview.width, accuracy: 1)
      }
      XCTAssertEqual(detail.detailView.transitionPhotoId, "photo-1")
    }
  }

  func testReversingFullScreenKeepsTheImageContinuous() async throws {
    try XCTSkipIf(UIAccessibility.isReduceMotionEnabled)
    let detail = try await showDetail()
    _ = try verticalFold(in: detail.view)
    let action = try XCTUnwrap(detail.navigationBar.topItem?.rightBarButtonItems?.first?.primaryAction)
    let preview = try presentationImageFrame(in: detail)
    UIView.setAnimationsEnabled(true)
    UIControl().sendAction(action)
    try await Task.sleep(for: .milliseconds(80))
    let beforeReversal = try presentationImageFrame(in: detail)
    UIControl().sendAction(action)
    try await Task.sleep(for: .milliseconds(25))
    let afterReversal = try presentationImageFrame(in: detail)
    XCTAssertLessThan(abs(afterReversal.midX - beforeReversal.midX), 80)
    try await Task.sleep(for: .milliseconds(600))
    let end = try presentationImageFrame(in: detail)
    XCTAssertEqual(end.midX, preview.midX, accuracy: 1)
    XCTAssertEqual(end.width, preview.width, accuracy: 1)
    XCTAssertEqual(detail.detailView.transitionPhotoId, "photo-1")
  }

  func testResizingDuringFullScreenAnimationRestoresTheLivePhoto() async throws {
    let detail = try await showDetail()
    _ = try verticalFold(in: detail.view)
    let action = try XCTUnwrap(detail.navigationBar.topItem?.rightBarButtonItems?.first?.primaryAction)
    UIView.setAnimationsEnabled(true)
    UIControl().sendAction(action)
    detail.view.bounds.size = CGSize(width: 466, height: 678)
    detail.view.setNeedsLayout()
    detail.view.layoutIfNeeded()
    XCTAssertEqual(detail.detailView.transitionMediaView.alpha, 1)
    XCTAssertEqual(detail.detailView.transitionPhotoId, "photo-1")
    let viewer = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoViewerView } as? PhotoViewerView)
    XCTAssertNotNil(viewer.currentTransitionImage())
  }

  func testDismissalDuringFullScreenAnimationRestoresTheLivePhoto() async throws {
    let detail = try await showDetail()
    _ = try verticalFold(in: detail.view)
    let action = try XCTUnwrap(detail.navigationBar.topItem?.rightBarButtonItems?.first?.primaryAction)
    UIView.setAnimationsEnabled(true)
    UIControl().sendAction(action)
    detail.detailView.prepareDismissalTransition(target: nil)
    XCTAssertEqual(detail.detailView.transitionMediaView.alpha, 1)
    XCTAssertEqual(detail.detailView.transitionPhotoId, "photo-1")
  }

  func testExplicitFullScreenAndResizeKeepTheCurrentPhoto() async throws {
    let detail = try await showDetail()
    _ = try verticalFold(in: detail.view)
    detail.detailView.setSocialActionsEnabled(true)
    detail.detailView.setOwnerActionsEnabled(true)
    detail.view.layoutIfNeeded()
    try await Task.sleep(for: .milliseconds(150))
    let bar = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailNavigationBar } as? PhotoDetailNavigationBar)
    let fullScreenItem = try XCTUnwrap(bar.topItem?.rightBarButtonItems?.first)
    XCTAssertEqual(fullScreenItem.accessibilityIdentifier, "photo-detail-fullscreen")
    XCTAssertEqual(fullScreenItem.accessibilityLabel, String(localized: "Full Screen"))
    let action = try XCTUnwrap(fullScreenItem.primaryAction)
    XCTAssertNotNil(fullScreenItem.image)
    XCTAssertNotNil(bar.topItem?.rightBarButtonItems?.first {
      $0.accessibilityIdentifier == "photo-detail-more"
    }?.menu)
    let viewer = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoViewerView })
    let info = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailInfoView })
    let pages = try XCTUnwrap(descendants(viewer).first { $0 is UICollectionView } as? UICollectionView)
    pages.setContentOffset(.zero, animated: false)
    pages.delegate?.scrollViewDidEndDecelerating?(pages)
    XCTAssertEqual(detail.detailView.transitionPhotoId, "photo-0")
    let previewWidth = viewer.bounds.width
    let toolbar = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailToolbar } as? PhotoDetailToolbar)
    XCTAssertEqual(bar.alpha, 1)
    toolbar.onInfo?()
    detail.view.layoutIfNeeded()
    XCTAssertEqual(viewer.bounds.width, previewWidth, accuracy: 1)

    UIControl().sendAction(action)
    detail.view.layoutIfNeeded()
    try await Task.sleep(for: .milliseconds(150))
    XCTAssertGreaterThan(viewer.bounds.width, previewWidth + 100)
    XCTAssertEqual(info.convert(info.bounds, to: detail.view).intersection(detail.view.bounds).width, 0)
    XCTAssertEqual(detail.detailView.transitionPhotoId, "photo-0")

    XCTAssertFalse(fullScreenItem.isHidden)
    XCTAssertEqual(fullScreenItem.accessibilityLabel, String(localized: "Exit Full Screen"))
    UIControl().sendAction(try XCTUnwrap(fullScreenItem.primaryAction))
    detail.view.layoutIfNeeded()
    try await Task.sleep(for: .milliseconds(150))
    XCTAssertEqual(viewer.bounds.width, previewWidth, accuracy: 1)
    let expandedSize = detail.view.bounds.size
    detail.view.bounds.size = CGSize(width: 466, height: 678)
    detail.view.setNeedsLayout()
    detail.view.layoutIfNeeded()
    XCTAssertFalse(bar.topItem?.rightBarButtonItems?.contains {
      $0.accessibilityIdentifier == "photo-detail-fullscreen"
    } ?? false)
    XCTAssertTrue(info.convert(info.bounds, to: detail.view).intersection(detail.view.bounds).isEmpty)
    XCTAssertEqual(detail.detailView.transitionPhotoId, "photo-0")

    detail.view.bounds.size = expandedSize
    detail.view.setNeedsLayout()
    detail.view.layoutIfNeeded()
    XCTAssertTrue(bar.topItem?.rightBarButtonItems?.contains {
      $0.accessibilityIdentifier == "photo-detail-fullscreen"
    } == true)
    XCTAssertGreaterThan(info.convert(info.bounds, to: detail.view).intersection(detail.view.bounds).width, 200)
    XCTAssertEqual(detail.detailView.transitionPhotoId, "photo-0")
  }

  func testFullScreenButtonDoesNotCoverAnOriginalImageFailure() async throws {
    let detail = try await showDetail()
    _ = try verticalFold(in: detail.view)
    try await Task.sleep(for: .milliseconds(150))
    let bar = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailNavigationBar } as? PhotoDetailNavigationBar)
    XCTAssertTrue(bar.topItem?.rightBarButtonItems?.contains {
      $0.accessibilityIdentifier == "photo-detail-fullscreen"
    } == true)
    let pill = try XCTUnwrap(descendants(detail.view).first {
      $0 is PhotoDetailLoadingPillView
    } as? PhotoDetailLoadingPillView)
    pill.handle(.failed)
    detail.view.layoutIfNeeded()
    XCTAssertFalse(pill.isHidden)
    XCTAssertFalse(bar.convert(bar.bounds, to: detail.view).intersects(pill.convert(pill.bounds, to: detail.view)))
  }

  func testSocialActionsStillTargetTheCurrentPhotoAfterFullScreen() async throws {
    let detail = try await showDetail()
    _ = try verticalFold(in: detail.view)
    detail.detailView.setSocialActionsEnabled(true)
    let bar = try XCTUnwrap(detail.navigationBar as? PhotoDetailNavigationBar)
    let fullScreen = try XCTUnwrap(bar.topItem?.rightBarButtonItems?.first?.primaryAction)
    UIControl().sendAction(fullScreen)
    UIControl().sendAction(fullScreen)
    detail.detailView.layoutIfNeeded()
    let toolbar = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailToolbar } as? PhotoDetailToolbar)
    var commentPhoto: String?
    var reactionPhoto: String?
    var reactionCount: Int?
    detail.detailView.onNativeCommentsRequest = { photo, _ in commentPhoto = photo }
    detail.detailView.onNativeReactionRequest = { photo, _, _, count in
      reactionPhoto = photo
      reactionCount = count
    }
    toolbar.onComments?()
    XCTAssertEqual(commentPhoto, "photo-1")
    toolbar.onReactions?()
    let rail = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailReactionRailView } as? PhotoDetailReactionRailView)
    rail.onSend?("heart", 3)
    XCTAssertEqual(reactionPhoto, "photo-1")
    XCTAssertEqual(reactionCount, 3)
  }

  func testCompactPhotoDoesNotAutomaticallyOpenAnInformationSheet() async throws {
    let detail = try await showDetail()
    detail.view.bounds.size = CGSize(width: 390, height: 844)
    detail.view.setNeedsLayout()
    detail.view.layoutIfNeeded()
    let info = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailInfoView })
    XCTAssertTrue(info.convert(info.bounds, to: detail.view).intersection(detail.view.bounds).isEmpty)

    let toolbar = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoDetailToolbar } as? PhotoDetailToolbar)
    toolbar.onInfo?()
    detail.view.layoutIfNeeded()
    XCTAssertFalse(info.convert(info.bounds, to: detail.view).intersection(detail.view.bounds).isEmpty)
  }

  func testGalleryControlsAvoidAsymmetricSafeAreas() async throws {
    let controller = UIViewController()
    let masonry = PhotoMasonryView(frame: .zero)
    controller.view = masonry
    controller.additionalSafeAreaInsets = UIEdgeInsets(top: 0, left: 22, bottom: 0, right: 84)
    masonry.chromeVisible = true
    masonry.chromeDateVisible = true
    masonry.chromeIdentityLabel = "Gallery"
    masonry.chromeDateLabel = "June 2025"
    masonry.filterAccessibilityLabel = "Filters"
    masonry.profileAccessibilityLabel = "Profile"
    masonry.setPhotos((0..<16).map { MasonryPhoto(id: "photo-\($0)") })
    window.rootViewController = controller
    window.makeKeyAndVisible()
    controller.view.layoutIfNeeded()
    let safe = masonry.bounds.inset(by: masonry.safeAreaInsets)
    for label in ["Filters", "Profile"] {
      let button = try XCTUnwrap(descendants(masonry).first { $0.accessibilityLabel == label })
      let rect = button.convert(button.bounds, to: masonry)
      XCTAssertGreaterThanOrEqual(rect.minX, safe.minX, label)
      XCTAssertLessThanOrEqual(rect.maxX, safe.maxX, label)
    }
    let collection = try XCTUnwrap(descendants(masonry).first { $0 is UICollectionView } as? UICollectionView)
    collection.layoutIfNeeded()
    for index in 0..<16 {
      let photo = try XCTUnwrap(collection.layoutAttributesForItem(at: IndexPath(item: index, section: 0)))
      XCTAssertLessThanOrEqual(collection.convert(photo.frame, to: masonry).maxX, safe.maxX + 1)
    }
  }

  private func showDetail(image: UIImage? = nil) async throws -> PhotoDetailViewController {
    let detail = try makeDetail(image: image)
    window.rootViewController = detail
    window.makeKeyAndVisible()
    detail.view.layoutIfNeeded()
    try await Task.sleep(for: .milliseconds(150))
    detail.view.setNeedsLayout()
    detail.view.layoutIfNeeded()
    return detail
  }

  private func makeDetail(image: UIImage? = nil, sourceProvider: @escaping (String) -> UIView? = { _ in nil }) throws -> PhotoDetailViewController {
    let photoSize = image?.size ?? CGSize(width: 600, height: 900)
    let image = try XCTUnwrap(image ?? UIImage(named: "signin-DSCF0842"))
    let url = directory.appendingPathComponent("photo.jpg")
    try XCTUnwrap(image.jpegData(compressionQuality: 0.9)).write(to: url)
    let records: [[String: Any]] = (0..<2).map { index in
      ["id": "photo-\(index)", "title": "DSCF0842", "originalUrl": url.absoluteString,
       "thumbnailUrl": url.absoluteString, "width": Int(photoSize.width), "height": Int(photoSize.height),
       "exif": ["Make": "FUJIFILM", "Model": "X-T5", "FocalLength": "56 mm",
                "FNumber": 2.8, "ISO": 640, "ExposureTime": "1/800"]]
    }
    let photos = try ManifestDecoding.decode(
      JSONSerialization.data(withJSONObject: ["data": records]), galleryOrigin: url
    )
    return PhotoDetailViewController(
      photos: photos, initialIndex: 1, gallerySlug: nil, sourceProvider: sourceProvider
    )
  }

  private func presentationImageFrame(in detail: PhotoDetailViewController) throws -> CGRect {
    let viewer = try XCTUnwrap(descendants(detail.view).first { $0 is PhotoViewerView })
    let pages = try XCTUnwrap(descendants(viewer).first { $0 is UICollectionView } as? UICollectionView)
    let cell = try XCTUnwrap(pages.cellForItem(at: IndexPath(item: 1, section: 0)))
    let transitionImage = descendants(detail.detailView).compactMap { $0 as? UIImageView }.first {
      !$0.isDescendant(of: viewer) && ($0.image?.size.width ?? 0) > 100
    }
    let image = try XCTUnwrap(transitionImage ?? descendants(cell).compactMap { $0 as? UIImageView }.first {
      $0.image != nil && !$0.isHidden && $0.alpha > 0.01
    })
    let layer = image.layer.presentation() ?? image.layer
    return layer.convert(layer.bounds, to: detail.view.layer.presentation() ?? detail.view.layer)
  }

  private func verticalFold(in view: UIView) throws -> CGRect {
    guard #available(iOS 27.1, *), view.bounds.width > view.bounds.height,
          let region = view.reservedRegions(kind: .division, options: .includeInactive)
            .first(where: { $0.frame.height > $0.frame.width })
    else { throw XCTSkip("Requires an expanded landscape fold; compact behavior is tested separately") }
    return region.frame
  }

  private func descendants(_ view: UIView) -> [UIView] {
    view.subviews.flatMap { [$0] + descendants($0) }
  }
}
