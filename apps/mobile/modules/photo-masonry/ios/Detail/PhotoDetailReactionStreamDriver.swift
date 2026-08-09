import Foundation

private let holdToStreamDelay: TimeInterval = 0.4
private let streamInterval: TimeInterval = 0.18

// The hold-then-repeat timing lives here rather than in the rail: it is a clock,
// not a view, and keeping it separate is what lets the rail be tested by looking
// at geometry alone.
final class PhotoDetailReactionStreamDriver: NSObject {
  var onStreamBegan: (() -> Void)?
  var onShot: ((Int, CGFloat) -> Void)?

  private(set) var isStreaming = false
  private(set) var pendingCount = 0

  private var shots = 0
  private var holdTimer: Timer?
  private var streamTimer: Timer?

  deinit {
    stopTimers()
  }

  func armHold() {
    holdTimer?.invalidate()
    holdTimer = Timer.scheduledTimer(
      timeInterval: holdToStreamDelay,
      target: self,
      selector: #selector(beginStream),
      userInfo: nil,
      repeats: false
    )
  }

  func stopTimers() {
    holdTimer?.invalidate()
    holdTimer = nil
    streamTimer?.invalidate()
    streamTimer = nil
  }

  func reset() {
    stopTimers()
    isStreaming = false
    pendingCount = 0
    shots = 0
  }

  @objc private func beginStream() {
    guard !isStreaming else { return }
    isStreaming = true
    onStreamBegan?()
    fire()
    streamTimer = Timer.scheduledTimer(
      timeInterval: streamInterval,
      target: self,
      selector: #selector(fire),
      userInfo: nil,
      repeats: true
    )
  }

  @objc private func fire() {
    guard isStreaming, pendingCount < PhotoDetailReactionGeometry.comboCap else { return }
    pendingCount += 1
    let progress = PhotoDetailReactionGeometry.streamProgress(shotIndex: shots)
    shots += 1
    onShot?(pendingCount, progress)
  }
}
