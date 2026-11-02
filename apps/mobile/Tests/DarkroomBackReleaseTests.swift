@testable import Afilmory
import UIKit
import XCTest

final class DarkroomBackReleaseTests: XCTestCase {
  func testFlingFinishesFromShortDrag() {
    XCTAssertTrue(DarkroomBackRelease(progress: 0.1, velocity: 800, width: 400).finishes)
  }

  func testSlowShortReleaseCancels() {
    XCTAssertFalse(DarkroomBackRelease(progress: 0.2, velocity: 100, width: 400).finishes)
  }

  func testFingerVelocityCarriesIntoTheSpringRelativeToRemainingDistance() {
    let release = DarkroomBackRelease(progress: 0.5, velocity: 1000, width: 400)
    XCTAssertTrue(release.finishes)
    XCTAssertEqual(release.initialVelocity, 5, accuracy: 0.001)
  }

  func testCancelCarriesLeftwardVelocityTowardTheStart() {
    let release = DarkroomBackRelease(progress: 0.25, velocity: -200, width: 400)
    XCTAssertFalse(release.finishes)
    XCTAssertEqual(release.initialVelocity, 2, accuracy: 0.001)
  }

  func testVelocityAwayFromTheDestinationStartsFromRest() {
    XCTAssertEqual(DarkroomBackRelease(progress: 0.6, velocity: -100, width: 400).initialVelocity, 0)
  }

  func testVelocityIsCappedSoTheCriticallyDampedSpringNeverOvershoots() {
    let release = DarkroomBackRelease(progress: 0.9, velocity: 5000, width: 400)
    XCTAssertEqual(release.initialVelocity, DarkroomBackRelease.angularFrequency, accuracy: 0.001)
  }

  func testSpringIsCriticallyDamped() {
    let ratio = DarkroomBackRelease.damping / (2 * DarkroomBackRelease.stiffness.squareRoot())
    XCTAssertEqual(ratio, 1, accuracy: 0.001)
  }
}
