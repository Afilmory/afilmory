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

  func testNotificationBannerHasAnUnambiguousPhoneLayout() {
    let banner = GalleryNotificationBannerView(
      frame: CGRect(x: 0, y: 0, width: 390, height: GalleryNotificationBannerView.preferredHeight)
    )
    banner.configure(
      state: .enableNotifications,
      title: "Turn on gallery notifications",
      detail: "Get an alert when galleries you subscribe to publish new photos.",
      actionTitle: "Turn On",
      horizontalInset: 16,
      onAction: {}
    )

    banner.layoutIfNeeded()

    XCTAssertFalse(banner.containsAmbiguousLayout)
  }

  func testNotificationBannerTransitionRevealsAnInsertedBannerWithoutJumpingOnRemoval() {
    XCTAssertEqual(
      resolvedGalleryTopOffsetAfterHeaderTransition(
        previousHeaderHeight: 0,
        nextHeaderHeight: GalleryNotificationBannerView.preferredHeight,
        contentOffsetY: -96,
        adjustedTopInset: 96
      ),
      -96
    )
    XCTAssertEqual(
      resolvedGalleryTopOffsetAfterHeaderTransition(
        previousHeaderHeight: 0,
        nextHeaderHeight: GalleryNotificationBannerView.preferredHeight,
        contentOffsetY: 40,
        adjustedTopInset: 96
      ),
      -96
    )
    XCTAssertNil(
      resolvedGalleryTopOffsetAfterHeaderTransition(
        previousHeaderHeight: GalleryNotificationBannerView.preferredHeight,
        nextHeaderHeight: 0,
        contentOffsetY: 40,
        adjustedTopInset: 96
      )
    )
  }

  func testSubscribedButtonTitleFitsOnOneLineAtPhoneWidth() throws {
    let width: CGFloat = 358
    let cell = GalleryCardCell(
      frame: CGRect(x: 0, y: 0, width: width, height: GalleryCardCell.preferredHeight(for: width))
    )
    cell.configure(
      gallery: FeaturedGallery(
        id: "beta",
        name: "Beta Gallery",
        slug: "beta",
        domain: nil,
        description: nil,
        author: nil,
        photoCount: 6,
        isSubscribed: true,
        isOwnGallery: false,
        tags: [],
        createdAt: "2026-08-04T00:00:00.000Z",
        lastUpload: nil
      ),
      covers: nil,
      photoCount: "6 photos",
      subscriptionState: .subscribed,
      subscribeTitle: "Subscribe",
      subscribedTitle: "Subscribed",
      unsubscribeTitle: "Unsubscribe",
      accessibilityLabel: "Open Beta Gallery",
      onSubscriptionToggle: {}
    )

    cell.layoutIfNeeded()

    let button = try XCTUnwrap(cell.descendants.compactMap { $0 as? UIButton }.first)
    let titleLabel = try XCTUnwrap(button.titleLabel)
    let singleLineWidth = titleLabel.sizeThatFits(
      CGSize(width: CGFloat.greatestFiniteMagnitude, height: titleLabel.font.lineHeight)
    ).width

    XCTAssertEqual(titleLabel.numberOfLines, 1)
    XCTAssertGreaterThanOrEqual(titleLabel.bounds.width + 0.5, singleLineWidth)
    XCTAssertLessThanOrEqual(titleLabel.bounds.height, ceil(titleLabel.font.lineHeight) + 1)
  }
}

private extension UIView {
  var descendants: [UIView] {
    subviews + subviews.flatMap(\.descendants)
  }

  var containsAmbiguousLayout: Bool {
    hasAmbiguousLayout || subviews.contains(where: \.containsAmbiguousLayout)
  }
}
