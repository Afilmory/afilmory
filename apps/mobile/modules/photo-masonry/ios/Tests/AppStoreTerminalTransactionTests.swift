import XCTest

@testable import Afilmory

final class AppStoreBillingFailureTests: XCTestCase {
  func testRecognizesTheNotAttributableResponseAsTerminal() {
    let error = APIError.http(status: 409, body: #"{"ok":false,"code":42,"message":"..."}"#)
    XCTAssertTrue(AppStoreBillingFailure.isTerminal(error))
  }

  func testTreatsOtherBusinessErrorsAsRetryable() {
    let error = APIError.http(status: 409, body: #"{"ok":false,"code":4,"message":"..."}"#)
    XCTAssertFalse(AppStoreBillingFailure.isTerminal(error))
  }

  func testTreatsServerAndTransportFailuresAsRetryable() {
    XCTAssertFalse(AppStoreBillingFailure.isTerminal(APIError.http(status: 500, body: nil)))
    XCTAssertFalse(AppStoreBillingFailure.isTerminal(APIError.unauthorized))
    XCTAssertFalse(AppStoreBillingFailure.isTerminal(APIError.cancelled))
  }

  func testIgnoresAnUnparseableBody() {
    XCTAssertFalse(AppStoreBillingFailure.isTerminal(APIError.http(status: 409, body: "<html>502</html>")))
  }
}

final class UserDefaultsTerminalTransactionStoreTests: XCTestCase {
  private var defaults: UserDefaults!
  private var suiteName: String!

  override func setUp() {
    super.setUp()
    suiteName = "app.afilmory.tests.\(UUID().uuidString)"
    defaults = UserDefaults(suiteName: suiteName)
  }

  override func tearDown() {
    defaults.removePersistentDomain(forName: suiteName)
    defaults = nil
    suiteName = nil
    super.tearDown()
  }

  func testRecordedTransactionsSurviveANewStoreInstance() {
    UserDefaultsTerminalTransactionStore(defaults: defaults).record("2000000001")

    let reopened = UserDefaultsTerminalTransactionStore(defaults: defaults)
    XCTAssertTrue(reopened.contains("2000000001"))
    XCTAssertFalse(reopened.contains("2000000002"))
  }

  func testKeepsTheMostRecentTransactionsWhenTheListGrows() {
    let store = UserDefaultsTerminalTransactionStore(defaults: defaults)
    for index in 0..<70 {
      store.record("transaction-\(index)")
    }

    XCTAssertFalse(store.contains("transaction-0"))
    XCTAssertTrue(store.contains("transaction-69"))
  }
}
