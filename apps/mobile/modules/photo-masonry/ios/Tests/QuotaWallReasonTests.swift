import XCTest

@testable import Afilmory

final class QuotaWallReasonTests: XCTestCase {
  func testParsesAStorageRejectionFromARestResponse() {
    let body = """
    {"ok":false,"code":41,"message":"...","details":{"reason":"storage","usedBytes":5262002324,"incomingBytes":188743680,"capacityBytes":5368709120}}
    """
    let reason = QuotaWallReason.parse(apiError: APIError.http(status: 402, body: body))

    guard case .storage(let used, let incoming, let capacity)? = reason else {
      return XCTFail("Expected a storage reason.")
    }
    XCTAssertEqual(used, 5_262_002_324)
    XCTAssertEqual(incoming, 188_743_680)
    XCTAssertEqual(capacity, 5_368_709_120)
  }

  func testParsesAMonthlyRejectionFromAnEventPayload() {
    let reason = QuotaWallReason.parse(details: [
      "reason": "monthly_process",
      "used": 980,
      "limit": 1000,
      "requested": 40,
    ])

    guard case .monthlyProcess(let used, let limit, let requested)? = reason else {
      return XCTFail("Expected a monthly process reason.")
    }
    XCTAssertEqual(used, 980)
    XCTAssertEqual(limit, 1000)
    XCTAssertEqual(requested, 40)
  }

  func testAnUnrecognizedReasonStillProducesAWall() {
    let reason = QuotaWallReason.parse(details: ["reason": "quantum_flux", "limit": 3])

    guard case .unknown? = reason else {
      return XCTFail("A future server dimension must degrade, not vanish.")
    }
    XCTAssertFalse(reason!.explanation.isEmpty)
  }

  func testANonQuotaFailureIsNotAWall() {
    XCTAssertNil(QuotaWallReason.parse(details: nil))
    XCTAssertNil(QuotaWallReason.parse(details: ["message": "boom"]))
    XCTAssertNil(QuotaWallReason.parse(apiError: APIError.http(status: 500, body: "<html>502</html>")))
    XCTAssertNil(QuotaWallReason.parse(apiError: APIError.unauthorized))
  }

  func testEveryReasonHasTitleAndExplanation() {
    let reasons: [QuotaWallReason] = [
      .storage(usedBytes: 1, incomingBytes: 1, capacityBytes: 2),
      .monthlyProcess(used: 1, limit: 2, requested: 1),
      .libraryItems(current: 1, limit: 2),
      .uploadSize(actualMb: 41, limitMb: 25),
      .syncObjectSize(actualMb: 200, limitMb: 100),
      .customDomain(current: 0, limit: 0),
      .unknown,
    ]
    for reason in reasons {
      XCTAssertFalse(reason.title.isEmpty)
      XCTAssertFalse(reason.explanation.isEmpty)
      XCTAssertFalse(reason.secondaryActionTitle.isEmpty)
    }
  }

  func testOnlyConsumableDimensionsShowARunningTotal() {
    let storage = QuotaWallReason.storage(usedBytes: 10, incomingBytes: 5, capacityBytes: 12)
    let uploadSize = QuotaWallReason.uploadSize(actualMb: 41, limitMb: 25)

    XCTAssertEqual(storage.readout.count, 3)
    XCTAssertTrue(uploadSize.readout.isEmpty)
  }
}

final class UploadQuotaFailureTests: XCTestCase {
  func testKeepsTheStructuredDetailsFromAnErrorEvent() {
    let payload: [String: Any] = [
      "message": "托管存储空间不足",
      "code": 41,
      "details": ["reason": "storage", "usedBytes": 10, "incomingBytes": 5, "capacityBytes": 12],
    ]

    let failure = UploadTerminalFailure(payload: payload)

    XCTAssertEqual(failure.message, "托管存储空间不足")
    guard case .storage? = failure.quotaReason else {
      return XCTFail("A quota rejection must survive the stream.")
    }
  }

  func testAPlainErrorEventCarriesNoQuotaReason() {
    let failure = UploadTerminalFailure(payload: ["message": "boom"])

    XCTAssertEqual(failure.message, "boom")
    XCTAssertNil(failure.quotaReason)
  }

  func testAnEmptyPayloadStillProducesAMessage() {
    XCTAssertFalse(UploadTerminalFailure(payload: [:]).message.isEmpty)
  }
}
