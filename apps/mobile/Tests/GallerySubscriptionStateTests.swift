import UIKit
import XCTest

@testable import Afilmory

@MainActor
final class GallerySubscriptionStateTests: XCTestCase {
  func testOwnWorkspaceDoesNotExposeSubscriptionAction() {
    XCTAssertEqual(
      resolveGallerySubscriptionButtonState(
        isOwnGallery: true,
        isSubscribed: false,
        pendingTarget: nil
      ),
      .hidden
    )
  }

  func testSubscriptionActionReflectsServerState() {
    XCTAssertEqual(
      resolveGallerySubscriptionButtonState(
        isOwnGallery: false,
        isSubscribed: false,
        pendingTarget: nil
      ),
      .subscribe
    )
    XCTAssertEqual(
      resolveGallerySubscriptionButtonState(
        isOwnGallery: false,
        isSubscribed: true,
        pendingTarget: nil
      ),
      .subscribed
    )
  }

  func testPendingMutationPresentsItsOptimisticTarget() {
    XCTAssertEqual(
      resolveGallerySubscriptionButtonState(
        isOwnGallery: false,
        isSubscribed: false,
        pendingTarget: true
      ),
      .updating(isSubscribed: true)
    )
    XCTAssertEqual(
      resolveGallerySubscriptionButtonState(
        isOwnGallery: false,
        isSubscribed: true,
        pendingTarget: false
      ),
      .updating(isSubscribed: false)
    )
  }

  func testNotificationBannerRequiresAnExistingSubscription() {
    XCTAssertEqual(
      resolveGalleryNotificationBannerState(
        hasSubscriptions: false,
        permission: .notDetermined
      ),
      .hidden
    )
  }

  func testNotificationBannerOffersPermissionBeforeTheSystemDecision() {
    XCTAssertEqual(
      resolveGalleryNotificationBannerState(
        hasSubscriptions: true,
        permission: .notDetermined
      ),
      .enableNotifications
    )
  }

  func testNotificationBannerProvidesSettingsRecoveryAfterDenial() {
    XCTAssertEqual(
      resolveGalleryNotificationBannerState(
        hasSubscriptions: true,
        permission: .disabled
      ),
      .openSettings
    )
  }

  func testNotificationBannerStaysHiddenWhenNotificationsAreEnabled() {
    XCTAssertEqual(
      resolveGalleryNotificationBannerState(
        hasSubscriptions: true,
        permission: .enabled
      ),
      .hidden
    )
  }
}
