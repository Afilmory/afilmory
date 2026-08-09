@preconcurrency import ActivityKit
import Foundation

@MainActor
final class UploadActivityController {
  static let shared = UploadActivityController()

  private var activity: Activity<UploadActivityAttributes>?
  private var title = "Uploads"
  private var wasRunning = false

  private init() {
    // Activities orphaned by a previous process (crash, force quit mid-queue)
    // otherwise linger on the lock screen until their system timeout.
    let orphanedActivities = Activity<UploadActivityAttributes>.activities
    Task {
      for orphan in orphanedActivities {
        await orphan.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  func setTitle(_ value: String) {
    if !value.isEmpty {
      title = value
    }
  }

  func sync(jobs: [UploadJobState]) {
    let summary = UploadQueueSummary(jobs: jobs)
    let state = UploadActivityAttributes.ContentState(
      done: summary.done,
      failed: summary.failed,
      total: summary.total,
      progress: summary.progress
    )

    if summary.running {
      wasRunning = true
      if let activity {
        Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
      } else if ActivityAuthorizationInfo().areActivitiesEnabled {
        do {
          activity = try Activity.request(
            attributes: UploadActivityAttributes(title: title),
            content: ActivityContent(state: state, staleDate: nil)
          )
        } catch {
          NSLog("[afilmory-upload] live activity request failed: %@", String(describing: error))
        }
      }
      return
    }

    guard wasRunning else { return }
    wasRunning = false
    guard let activity else { return }
    self.activity = nil
    Task {
      await activity.end(
        ActivityContent(state: state, staleDate: nil),
        dismissalPolicy: .after(.now + 4)
      )
    }
  }
}
