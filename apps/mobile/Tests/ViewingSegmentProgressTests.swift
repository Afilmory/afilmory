@testable import Afilmory
import CoreGraphics
import XCTest

final class ViewingSegmentProgressTests: XCTestCase {
  func testUnderlineScaleFollowsDistanceFromIndex() {
    XCTAssertEqual(ViewingSegmentProgress.underlineScale(progress: 0, index: 0), 1, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.underlineScale(progress: 0, index: 1), 0, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.underlineScale(progress: 0.25, index: 0), 0.75, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.underlineScale(progress: 0.25, index: 1), 0.25, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.underlineScale(progress: 1, index: 1), 1, accuracy: 0.001)
  }

  func testUnderlineScaleNeverGoesNegative() {
    XCTAssertEqual(ViewingSegmentProgress.underlineScale(progress: 2.5, index: 0), 0)
    XCTAssertEqual(ViewingSegmentProgress.underlineScale(progress: -1, index: 1), 0)
  }

  func testPageBlurReachesEightPointsOneFullPageAway() {
    XCTAssertEqual(ViewingSegmentProgress.pageBlur(progress: 0, index: 0, reduceMotion: false), 0, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.pageBlur(progress: 0.5, index: 1, reduceMotion: false), 4, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.pageBlur(progress: 0, index: 1, reduceMotion: false), 8, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.pageBlur(progress: 3, index: 0, reduceMotion: false), 8, accuracy: 0.001)
  }

  func testReduceMotionDropsBlurButKeepsOpacity() {
    XCTAssertEqual(ViewingSegmentProgress.pageBlur(progress: 0.5, index: 1, reduceMotion: true), 0)
    XCTAssertEqual(ViewingSegmentProgress.pageAlpha(progress: 0.5, index: 1), 0.7, accuracy: 0.001)
  }

  func testPageAlphaBottomsOutAtPointFour() {
    XCTAssertEqual(ViewingSegmentProgress.pageAlpha(progress: 0, index: 0), 1, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.pageAlpha(progress: 0, index: 1), 0.4, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.pageAlpha(progress: 4, index: 1), 0.4, accuracy: 0.001)
  }

  func testProgressFromVisiblePageOrigin() {
    XCTAssertEqual(ViewingSegmentProgress.progress(pageIndex: 0, pageOriginX: 0, pageWidth: 390, pageCount: 2) ?? -1, 0, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.progress(pageIndex: 0, pageOriginX: -195, pageWidth: 390, pageCount: 2) ?? -1, 0.5, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.progress(pageIndex: 1, pageOriginX: 97.5, pageWidth: 390, pageCount: 2) ?? -1, 0.75, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.progress(pageIndex: 1, pageOriginX: -60, pageWidth: 390, pageCount: 2) ?? -1, 1, accuracy: 0.001)
    XCTAssertEqual(ViewingSegmentProgress.progress(pageIndex: 0, pageOriginX: 50, pageWidth: 390, pageCount: 2) ?? -1, 0, accuracy: 0.001)
    XCTAssertNil(ViewingSegmentProgress.progress(pageIndex: 0, pageOriginX: 0, pageWidth: 0, pageCount: 2))
  }

  func testSettledIndexOnlyWhenProgressRestsOnAPage() {
    XCTAssertEqual(ViewingSegmentProgress.settledIndex(progress: 0), 0)
    XCTAssertEqual(ViewingSegmentProgress.settledIndex(progress: 0.9995), 1)
    XCTAssertNil(ViewingSegmentProgress.settledIndex(progress: 0.4))
  }

  func testSelectedIndexRoundsToNearestPage() {
    XCTAssertEqual(ViewingSegmentProgress.selectedIndex(progress: 0.49), 0)
    XCTAssertEqual(ViewingSegmentProgress.selectedIndex(progress: 0.51), 1)
  }

  func testDefaultPageFollowsExploreSegmentPolicy() {
    XCTAssertEqual(ViewingPage.initial(isVisitor: true, isSignedIn: false, cachedHasSubscriptions: true), .galleries)
    XCTAssertEqual(ViewingPage.initial(isVisitor: false, isSignedIn: true, cachedHasSubscriptions: true), .rolls)
    XCTAssertEqual(ViewingPage.initial(isVisitor: false, isSignedIn: true, cachedHasSubscriptions: false), .galleries)
    XCTAssertEqual(ViewingPage.initial(isVisitor: false, isSignedIn: true, cachedHasSubscriptions: nil), .galleries)
    XCTAssertEqual(ViewingPage.afterFetch(current: .galleries, userHasChosen: false, hasSubscriptions: true), .rolls)
    XCTAssertEqual(ViewingPage.afterFetch(current: .galleries, userHasChosen: true, hasSubscriptions: true), .galleries)
    XCTAssertEqual(ViewingPage.afterFetch(current: .rolls, userHasChosen: false, hasSubscriptions: false), .galleries)
  }
}
