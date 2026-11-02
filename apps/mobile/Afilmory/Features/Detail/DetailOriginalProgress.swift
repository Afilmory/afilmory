import CoreGraphics
import Foundation

struct DetailOriginalProgress: Equatable {
  enum Display: Equatable {
    case hidden
    case loading(fraction: Double?, readout: String)
    case complete
    case failed
  }

  static let showDelay: TimeInterval = 0.35
  static let readoutBlock: CGFloat = 28

  private enum Phase: Equatable {
    case idle
    case waiting(showAt: TimeInterval)
    case showing
    case complete
    case failed
  }

  private var phase = Phase.idle
  private var received = 0
  private var expected: Int?

  var display: Display {
    switch phase {
    case .idle, .waiting: .hidden
    case .showing: .loading(fraction: fraction, readout: readout)
    case .complete: .complete
    case .failed: .failed
    }
  }

  var showAt: TimeInterval? {
    if case .waiting(let showAt) = phase { return showAt }
    return nil
  }

  mutating func start(now: TimeInterval) {
    received = 0
    expected = nil
    phase = .waiting(showAt: now + Self.showDelay)
  }

  mutating func receive(bytes: Int, of total: Int, now: TimeInterval) {
    received = max(0, bytes)
    expected = total > 0 ? total : nil
    tick(now: now)
  }

  mutating func tick(now: TimeInterval) {
    if case .waiting(let showAt) = phase, now >= showAt {
      phase = .showing
    }
  }

  mutating func finish(now _: TimeInterval) {
    phase = phase == .showing ? .complete : .idle
  }

  mutating func fail() {
    phase = .failed
  }

  mutating func reset() {
    phase = .idle
    received = 0
    expected = nil
  }

  static func lineY(image: CGRect, floor: CGFloat) -> CGFloat {
    min(image.maxY, floor - readoutBlock)
  }

  private var fraction: Double? {
    guard let expected else { return nil }
    return min(1, Double(received) / Double(expected))
  }

  private var readout: String {
    let got = Self.megabytes(received)
    guard let expected else { return "\(got) MB" }
    return "\(got) / \(Self.megabytes(expected)) MB"
  }

  private static func megabytes(_ bytes: Int) -> String {
    String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), Double(bytes) / 1_000_000)
  }
}
