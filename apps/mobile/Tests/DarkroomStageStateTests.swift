@testable import Afilmory
import XCTest

final class DarkroomStageStateTests: XCTestCase {
  func testNoJobsIsIdle() {
    let stage = DarkroomStage(jobs: [])
    XCTAssertEqual(stage.phase, .idle)
    XCTAssertEqual(stage.total, 0)
  }

  func testInteractionWithoutJobsReportsSelectingAndReviewing() {
    XCTAssertEqual(DarkroomStage(jobs: [], interaction: .selecting).phase, .selecting)
    XCTAssertEqual(DarkroomStage(jobs: [], interaction: .reviewing).phase, .reviewing)
  }

  func testCancelledJobsAreIgnored() {
    let stage = DarkroomStage(jobs: [job(.cancelled, 0.4)])
    XCTAssertEqual(stage.phase, .idle)
  }

  func testAnyActiveJobMeansDeveloping() {
    let stage = DarkroomStage(jobs: [job(.done, 1), job(.uploading, 0.5), job(.queued, 0)])
    XCTAssertEqual(stage.phase, .developing)
    XCTAssertEqual(stage.total, 3)
    XCTAssertEqual(stage.done, 1)
    XCTAssertEqual(stage.percent, 50)
  }

  func testActiveJobsWinOverInteraction() {
    let stage = DarkroomStage(jobs: [job(.uploading, 0.2)], interaction: .reviewing)
    XCTAssertEqual(stage.phase, .developing)
  }

  func testAllDoneIsDone() {
    let stage = DarkroomStage(jobs: [job(.done, 1), job(.done, 1)])
    XCTAssertEqual(stage.phase, .done)
    XCTAssertEqual(stage.percent, 100)
  }

  func testFailureWithoutActiveJobsIsStalled() {
    let stage = DarkroomStage(jobs: [job(.done, 1), job(.failed, 0.3)])
    XCTAssertEqual(stage.phase, .stalled)
    XCTAssertEqual(stage.failed, 1)
  }

  func testDevelopingMetaShowsCountsAndPercent() {
    let stage = DarkroomStage(jobs: [job(.done, 1), job(.uploading, 0.5), job(.queued, 0), job(.queued, 0)])
    XCTAssertEqual(stage.title, "Developing")
    XCTAssertEqual(stage.meta, "1 / 4 · develop 38%")
  }

  func testDoneTitleAndMeta() {
    let stage = DarkroomStage(jobs: [job(.done, 1), job(.done, 1), job(.done, 1)])
    XCTAssertEqual(stage.title, "3 developed")
    XCTAssertEqual(stage.meta, "Added to your exhibition")
  }

  func testStalledMetaShowsFailures() {
    let stage = DarkroomStage(jobs: [job(.done, 1), job(.failed, 0.3)])
    XCTAssertEqual(stage.title, "Developing")
    XCTAssertEqual(stage.meta, "1 / 2 · 1 failed")
  }

  func testTileStatesFollowJobProgress() {
    let queued = DarkroomTileState(job: job(.queued, 0), index: 0)
    XCTAssertEqual(queued.kind, .queued)
    XCTAssertEqual(queued.label, "Queued")
    XCTAssertEqual(queued.negativeAlpha, 1, accuracy: 0.001)
    XCTAssertEqual(queued.alpha, 0.35, accuracy: 0.001)

    let developing = DarkroomTileState(job: job(.uploading, 0.4), index: 1)
    XCTAssertEqual(developing.kind, .developing)
    XCTAssertEqual(developing.label, "Develop 40%")
    XCTAssertEqual(developing.negativeAlpha, 0.6, accuracy: 0.001)
    XCTAssertEqual(developing.alpha, 1, accuracy: 0.001)

    let developed = DarkroomTileState(job: job(.done, 1), index: 2)
    XCTAssertEqual(developed.kind, .developed)
    XCTAssertEqual(developed.label, "No. 03")
    XCTAssertEqual(developed.negativeAlpha, 0, accuracy: 0.001)

    let failed = DarkroomTileState(job: job(.failed, 0.3), index: 3)
    XCTAssertEqual(failed.kind, .failed)
    XCTAssertEqual(failed.label, "Failed")
  }

  func testDoneJobIgnoresStaleProgressValue() {
    let tile = DarkroomTileState(job: job(.done, 0.2), index: 0)
    XCTAssertEqual(tile.negativeAlpha, 0, accuracy: 0.001)
  }

  func testPushGeometryShiftsDefocusesAndDims() {
    let rest = DarkroomPushGeometry(progress: 0, width: 400)
    XCTAssertEqual(rest.translation, 0)
    XCTAssertEqual(rest.blur, 0)
    XCTAssertEqual(rest.alpha, 1)
    let covered = DarkroomPushGeometry(progress: 1, width: 400)
    XCTAssertEqual(covered.translation, -120, accuracy: 0.001)
    XCTAssertEqual(covered.blur, 4, accuracy: 0.001)
    XCTAssertEqual(covered.alpha, 0.5, accuracy: 0.001)
  }

  private func job(_ status: UploadJobStatus, _ progress: Double) -> UploadJobState {
    UploadJobState(
      id: UUID().uuidString, assetId: "asset", name: "IMG.jpg", bytes: 0, status: status,
      progress: progress, attempt: 1, error: nil, quotaDetails: nil, serverLogs: nil,
      endpoint: "https://example.invalid", directory: nil, boundary: "b"
    )
  }
}
