@testable import Afilmory
import UIKit
import XCTest

@MainActor
final class ExhibitionEdgeSwipeTests: XCTestCase {
  private func navigation(depth: Int) -> UINavigationController {
    let navigation = UINavigationController()
    navigation.setViewControllers((0..<depth).map { _ in UIViewController() }, animated: false)
    navigation.loadViewIfNeeded()
    return navigation
  }

  func testEdgePopBeginsOnAPushedGalleryPage() throws {
    let navigation = navigation(depth: 2)
    let swipe = ExhibitionEdgeSwipe()
    swipe.attach(to: navigation)
    let edge = try XCTUnwrap(navigation.interactivePopGestureRecognizer)
    XCTAssertTrue(edge.delegate === swipe)
    XCTAssertTrue(edge.isEnabled)
    XCTAssertTrue(swipe.gestureRecognizerShouldBegin(edge))
  }

  func testEdgePopIsRefusedAtTheStackRoot() throws {
    let navigation = navigation(depth: 1)
    let swipe = ExhibitionEdgeSwipe()
    swipe.attach(to: navigation)
    XCTAssertFalse(swipe.gestureRecognizerShouldBegin(try XCTUnwrap(navigation.interactivePopGestureRecognizer)))
  }

  func testEdgePopWinsOverOrdinaryPans() throws {
    let navigation = navigation(depth: 2)
    let swipe = ExhibitionEdgeSwipe()
    swipe.attach(to: navigation)
    let edge = try XCTUnwrap(navigation.interactivePopGestureRecognizer)
    XCTAssertTrue(swipe.gestureRecognizer(edge, shouldBeRequiredToFailBy: UIPanGestureRecognizer()))
  }

  func testDetachRestoresTheSystemDelegate() throws {
    let navigation = navigation(depth: 2)
    let edge = try XCTUnwrap(navigation.interactivePopGestureRecognizer)
    let original = edge.delegate
    let swipe = ExhibitionEdgeSwipe()
    swipe.attach(to: navigation)
    swipe.detach()
    XCTAssertTrue(edge.delegate === original)
  }

  func testReleasingTheSwipeRestoresTheSystemDelegate() throws {
    let navigation = navigation(depth: 2)
    let edge = try XCTUnwrap(navigation.interactivePopGestureRecognizer)
    let original = edge.delegate
    autoreleasepool {
      let swipe = ExhibitionEdgeSwipe()
      swipe.attach(to: navigation)
    }
    XCTAssertNotNil(edge.delegate)
    XCTAssertTrue(edge.delegate === original)
  }
}
