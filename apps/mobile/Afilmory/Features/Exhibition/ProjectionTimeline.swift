import Foundation

struct ProjectionTimeline: Equatable, Sendable {
  static let interval: TimeInterval = 3.6

  let count: Int
  private(set) var index: Int
  private(set) var cycleStart: TimeInterval

  init(count: Int, startIndex: Int, now: TimeInterval) {
    self.count = max(0, count)
    index = count > 0 ? min(max(startIndex, 0), count - 1) : 0
    cycleStart = now
  }

  var frameNumber: String { ExhibitFormat.frameNumber(index + 1) }
  var totalNumber: String { ExhibitFormat.frameNumber(count) }

  func progress(at now: TimeInterval) -> Double {
    min(1, max(0, (now - cycleStart) / Self.interval))
  }

  @discardableResult
  mutating func tick(at now: TimeInterval) -> Bool {
    guard now - cycleStart >= Self.interval - 0.0001 else { return false }
    cycleStart = now
    guard count > 1 else { return false }
    index = (index + 1) % count
    return true
  }

  mutating func step(_ delta: Int, at now: TimeInterval) {
    cycleStart = now
    guard count > 0 else { return }
    index = ((index + delta) % count + count) % count
  }
}
