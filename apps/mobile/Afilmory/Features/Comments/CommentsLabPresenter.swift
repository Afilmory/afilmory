import UIKit

@MainActor
enum CommentsLabPresenter {
  static func present(outcome: String, latencyMs: Int) {
    let resolvedOutcome = DemoCommentsTransport.Outcome(rawValue: outcome) ?? .success
    var request = PhotoCommentsSheetRequest()
    request.gallerySlug = "lab"
    request.photoId = "lab-photo"
    request.photoTitle = "Send flight · \(resolvedOutcome.rawValue)"
    request.viewerUserId = DemoCommentsTransport.viewerUserId
    request.initialCommentCount = 3

    let store = CommentsStore(
      request: request,
      transport: DemoCommentsTransport(outcome: resolvedOutcome, latencyMs: latencyMs)
    )

    let sheet = CommentsSheetPresenter.make(store: store) { _ in }
    AFSheetController.topPresenter()?.present(sheet, animated: true)
  }
}
