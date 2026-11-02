@testable import Afilmory
import XCTest

final class AccountDeletionVerificationTests: XCTestCase {
  func testARecentSessionNeedsNoFurtherProof() {
    XCTAssertEqual(AccountDeletionVerification.choose(methods: ["recent-session", "password"], appleAvailable: true), .recentSession)
  }

  func testAppleAccountsVerifyWithApple() {
    XCTAssertEqual(AccountDeletionVerification.choose(methods: ["apple", "password"], appleAvailable: true), .apple)
    XCTAssertEqual(AccountDeletionVerification.choose(methods: ["apple", "password"], appleAvailable: false), .password)
  }

  func testOAuthAccountsWithoutAPasswordAreAskedToSignInAgain() {
    XCTAssertEqual(AccountDeletionVerification.choose(methods: [], appleAvailable: false), .signInAgain)
    XCTAssertEqual(AccountDeletionVerification.choose(methods: ["apple"], appleAvailable: false), .signInAgain)
  }
}
