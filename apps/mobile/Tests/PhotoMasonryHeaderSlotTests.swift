import SwiftUI
import UIKit
import XCTest

@testable import Afilmory

@MainActor
final class PhotoMasonryHeaderSlotTests: XCTestCase {
  private func makeHost() -> UIHostingController<GalleryHeaderView> {
    let model = GalleryHeaderModel(
      tenantId: "tenant-1",
      name: "A Rather Long Gallery Name That Wraps",
      slug: "innei",
      authorName: "Innei",
      authorAvatar: nil,
      photoCount: 42,
      lastUpload: "2026-08-30T10:00:00Z",
      domain: "photos.innei.dev"
    )
    let host = UIHostingController(
      rootView: GalleryHeaderView(
        model: model,
        subscriptionState: .subscribe,
        onToggleSubscription: {},
        onOpenDomain: { _ in }
      )
    )
    host.sizingOptions = .intrinsicContentSize
    return host
  }

  func testHeaderSlotReservesSpaceAboveTheContent() {
    let masonry = PhotoMasonryView(frame: CGRect(x: 0, y: 0, width: 390, height: 800))
    let host = makeHost()
    masonry.headerView = host.view
    masonry.layoutIfNeeded()

    XCTAssertEqual(host.view.frame.width, 390)
    XCTAssertGreaterThan(host.view.frame.height, 60)
    XCTAssertEqual(host.view.frame.maxY, 0)
  }

  func testHeaderSlotMeasuresAgainstTheAvailableWidth() {
    let wide = PhotoMasonryView(frame: CGRect(x: 0, y: 0, width: 430, height: 800))
    wide.headerView = makeHost().view
    wide.layoutIfNeeded()

    let narrow = PhotoMasonryView(frame: CGRect(x: 0, y: 0, width: 240, height: 800))
    narrow.headerView = makeHost().view
    narrow.layoutIfNeeded()

    XCTAssertGreaterThan(
      narrow.headerView?.frame.height ?? 0,
      wide.headerView?.frame.height ?? 0
    )
  }

  func testClearingTheHeaderSlotRemovesIt() {
    let masonry = PhotoMasonryView(frame: CGRect(x: 0, y: 0, width: 390, height: 800))
    let host = makeHost()
    masonry.headerView = host.view
    masonry.layoutIfNeeded()
    masonry.headerView = nil
    masonry.layoutIfNeeded()

    XCTAssertNil(host.view.superview)
  }
}
