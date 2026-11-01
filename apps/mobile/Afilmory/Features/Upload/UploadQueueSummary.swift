import Foundation

struct UploadQueueSummary {
  let total: Int
  let done: Int
  let failed: Int
  let progress: Double
  let running: Bool

  init(jobs: [UploadJobState]) {
    let counted = jobs.filter { $0.status != .cancelled }
    total = counted.count
    done = jobs.filter { $0.status == .done }.count
    failed = jobs.filter { $0.status == .failed }.count
    running = jobs.contains { $0.status.isActive }
    progress = counted.isEmpty
      ? 0
      : counted.reduce(0) { $0 + ($1.status == .done ? 1 : $1.progress) } / Double(counted.count)
  }
}
