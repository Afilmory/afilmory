import XCTest

@testable import PhotoMasonry

final class StoreKitBillingPolicyTests: XCTestCase {
  func testVerifiedTransactionFinishesOnlyAfterServerAcknowledgement() {
    XCTAssertFalse(StoreKitBillingFinishGate.allowsFinish(isVerified: true, serverAcknowledged: false))
    XCTAssertTrue(StoreKitBillingFinishGate.allowsFinish(isVerified: true, serverAcknowledged: true))
  }

  func testUnverifiedTransactionNeverFinishes() {
    XCTAssertFalse(StoreKitBillingFinishGate.allowsFinish(isVerified: false, serverAcknowledged: true))
  }
}
