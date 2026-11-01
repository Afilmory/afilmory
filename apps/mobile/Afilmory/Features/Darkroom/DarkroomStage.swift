import CoreGraphics
import Foundation

enum DarkroomInteraction: Equatable, Sendable {
  case none
  case selecting
  case reviewing
}

enum DarkroomPhase: Equatable, Sendable {
  case idle
  case selecting
  case reviewing
  case developing
  case stalled
  case done
}

struct DarkroomStage: Equatable, Sendable {
  let phase: DarkroomPhase
  let total: Int
  let done: Int
  let failed: Int
  let progress: Double

  init(jobs: [UploadJobState], interaction: DarkroomInteraction = .none) {
    let summary = UploadQueueSummary(jobs: jobs)
    total = summary.total
    done = summary.done
    failed = summary.failed
    progress = summary.progress
    if summary.running {
      phase = .developing
    } else if interaction == .selecting {
      phase = .selecting
    } else if interaction == .reviewing {
      phase = .reviewing
    } else if summary.total == 0 {
      phase = .idle
    } else if summary.failed > 0 {
      phase = .stalled
    } else {
      phase = .done
    }
  }

  var showsDevelopment: Bool {
    phase == .developing || phase == .stalled || phase == .done
  }

  var percent: Int {
    Int((min(1, max(0, progress)) * 100).rounded())
  }

  var title: String {
    switch phase {
    case .done: String(localized: "\(total) developed")
    case .developing, .stalled: String(localized: "Developing")
    case .idle, .selecting, .reviewing: String(localized: "Develop new photos")
    }
  }

  var meta: String {
    switch phase {
    case .done: String(localized: "Added to your exhibition")
    case .stalled: String(localized: "\(done) / \(total) · \(failed) failed")
    case .developing: String(localized: "\(done) / \(total) · develop \(percent)%")
    case .idle, .selecting, .reviewing: ""
    }
  }
}

struct DarkroomTileState: Equatable, Sendable {
  enum Kind: Equatable, Sendable {
    case queued
    case developing
    case developed
    case failed
  }

  let kind: Kind
  let progress: Double
  let label: String

  init(job: UploadJobState, index: Int) {
    switch job.status {
    case .done:
      kind = .developed
      progress = 1
      label = String(localized: "No. \(ExhibitFormat.frameNumber(index + 1))")
    case .failed, .cancelled:
      kind = .failed
      progress = min(1, max(0, job.progress))
      label = String(localized: "Failed")
    case .queued, .uploading, .processing:
      let value = min(1, max(0, job.progress))
      progress = value
      if value > 0 {
        kind = .developing
        label = String(localized: "Develop \(Int((value * 100).rounded()))%")
      } else {
        kind = .queued
        label = String(localized: "Queued")
      }
    }
  }

  var negativeAlpha: CGFloat {
    AFMotion.developState(progress: progress).invert
  }

  var alpha: CGFloat {
    kind == .queued ? 0.35 : 1
  }
}

struct DarkroomPushGeometry: Equatable, Sendable {
  static let shift: CGFloat = 0.3
  static let maximumBlur: CGFloat = 4
  static let dimmedAlpha: CGFloat = 0.5

  let translation: CGFloat
  let blur: CGFloat
  let alpha: CGFloat

  init(progress: CGFloat, width: CGFloat) {
    let clamped = min(1, max(0, progress))
    translation = -width * Self.shift * clamped
    blur = Self.maximumBlur * clamped
    alpha = 1 - (1 - Self.dimmedAlpha) * clamped
  }
}
