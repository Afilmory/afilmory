import XCTest

@testable import Afilmory

private actor RecordingPort: AppStoreAcknowledgementPort {
  private(set) var acknowledgedPayloads: [String] = []
  private(set) var finishedIds: [String] = []
  private var acknowledgedId: String
  private var failure: Error?
  private let delay: Duration

  init(acknowledgedId: String, delay: Duration = .zero, failure: Error? = nil) {
    self.acknowledgedId = acknowledgedId
    self.delay = delay
    self.failure = failure
  }

  func acknowledge(signedTransactionInfo: String) async throws -> String {
    acknowledgedPayloads.append(signedTransactionInfo)
    if delay > .zero {
      try await Task.sleep(for: delay)
    }
    if let failure {
      throw failure
    }
    return acknowledgedId
  }

  func finish(transactionId: String) async throws -> Bool {
    finishedIds.append(transactionId)
    return true
  }
}

private struct PortFailure: Error {}

final class AppStoreOwnershipTests: XCTestCase {
  private let workspaceToken = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
  private let otherWorkspaceToken = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!

  func testATransactionBoughtForAnotherWorkspaceConflicts() {
    XCTAssertTrue(
      AppStoreOwnership.conflictsWithAnotherWorkspace(
        transactionToken: otherWorkspaceToken,
        workspaceToken: workspaceToken
      )
    )
  }

  func testResubscribingWithinTheSameWorkspaceDoesNotConflict() {
    XCTAssertFalse(
      AppStoreOwnership.conflictsWithAnotherWorkspace(
        transactionToken: workspaceToken,
        workspaceToken: workspaceToken
      )
    )
  }

  func testAnUnattributedTransactionDoesNotBlockThePurchase() {
    XCTAssertFalse(
      AppStoreOwnership.conflictsWithAnotherWorkspace(transactionToken: nil, workspaceToken: workspaceToken)
    )
  }
}

final class AppStoreTransactionAcknowledgerTests: XCTestCase {
  func testFinishesOnlyAfterTheServerRecordsTheSameTransaction() async throws {
    let port = RecordingPort(acknowledgedId: "2000000001")
    let acknowledger = AppStoreTransactionAcknowledger(port: port)

    try await acknowledger.acknowledge(transactionId: "2000000001", signedTransactionInfo: "jws")

    let finished = await port.finishedIds
    XCTAssertEqual(finished, ["2000000001"])
  }

  func testDoesNotFinishWhenTheServerRecordsADifferentTransaction() async {
    let port = RecordingPort(acknowledgedId: "2000000002")
    let acknowledger = AppStoreTransactionAcknowledger(port: port)

    do {
      try await acknowledger.acknowledge(transactionId: "2000000001", signedTransactionInfo: "jws")
      XCTFail("A mismatched acknowledgement must not resolve.")
    } catch {
      XCTAssertEqual(error as? AppStoreAcknowledgementError, .transactionMismatch)
    }

    let finished = await port.finishedIds
    XCTAssertTrue(finished.isEmpty)
  }

  func testDoesNotFinishWhenTheServerRejectsTheTransaction() async {
    let port = RecordingPort(acknowledgedId: "2000000001", failure: PortFailure())
    let acknowledger = AppStoreTransactionAcknowledger(port: port)

    do {
      try await acknowledger.acknowledge(transactionId: "2000000001", signedTransactionInfo: "jws")
      XCTFail("A rejected acknowledgement must not resolve.")
    } catch {
      XCTAssertTrue(error is PortFailure)
    }

    let finished = await port.finishedIds
    XCTAssertTrue(finished.isEmpty)
  }

  func testConcurrentAcknowledgementsOfOneTransactionHitTheServerOnce() async throws {
    let port = RecordingPort(acknowledgedId: "2000000001", delay: .milliseconds(50))
    let acknowledger = AppStoreTransactionAcknowledger(port: port)

    async let first: Void = acknowledger.acknowledge(transactionId: "2000000001", signedTransactionInfo: "jws")
    async let second: Void = acknowledger.acknowledge(transactionId: "2000000001", signedTransactionInfo: "jws")
    _ = try await (first, second)

    let payloads = await port.acknowledgedPayloads
    let finished = await port.finishedIds
    XCTAssertEqual(payloads.count, 1)
    XCTAssertEqual(finished, ["2000000001"])
  }
}
