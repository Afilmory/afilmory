@testable import Afilmory
import UIKit
import XCTest

final class SignInPresentationTests: XCTestCase {
  func testStandaloneHasACloseButtonAndNoIntroChrome() {
    XCTAssertTrue(SignInPresentation.standalone.showsClose)
    XCTAssertFalse(SignInPresentation.standalone.showsDots)
    XCTAssertFalse(SignInPresentation.standalone.showsGuestLink)
  }

  func testIntroPageShowsDotsAndTheGuestLinkButNoClose() {
    XCTAssertFalse(SignInPresentation.intro.showsClose)
    XCTAssertTrue(SignInPresentation.intro.showsDots)
    XCTAssertTrue(SignInPresentation.intro.showsGuestLink)
  }

  func testContinuingWithAnyProviderIsTheConsent() {
    for action in SignInGate.Action.allCases {
      XCTAssertNil(SignInGate.blockReason(for: action, busy: false), "\(action)")
    }
  }

  func testABusySignInBlocksAnotherWithoutAMessage() {
    XCTAssertEqual(SignInGate.blockReason(for: .github, busy: true), "")
  }

  @MainActor
  func testStandalonePageUsesTheLastIntroPhotoAndAClose() throws {
    let page = SignInPageController()
    page.loadViewIfNeeded()
    let close = page.view.allSubviews(of: UIButton.self).first { $0.accessibilityLabel == String(localized: "Close") }
    XCTAssertNotNil(close)
    let photo = try XCTUnwrap(page.view.allSubviews(of: ExhibitPageView.self).first).imageView.image
    XCTAssertEqual(photo?.pngData(), UIImage(named: IntroPage.all.last!.imageName)?.pngData())
    XCTAssertTrue(page.view.allSubviews(of: AFProgressDots.self).isEmpty)
  }

  @MainActor
  func testThePanelStatesTheConsentInsteadOfAToggle() {
    let host = SignInPanelHost.make(presentation: .standalone, state: SignInState(), onSignedIn: {}, onGuest: {})
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
    window.rootViewController = host
    window.makeKeyAndVisible()
    host.view.layoutIfNeeded()
    RunLoop.main.run(until: Date().addingTimeInterval(0.2))
    let consent = String(localized: "By continuing, you agree to Afilmory's Terms of Use and Privacy Policy.")
    XCTAssertTrue(SignInPanel.consentFootnote == consent)
    XCTAssertTrue(host.view.allSubviews(of: UISwitch.self).isEmpty)
  }
}
