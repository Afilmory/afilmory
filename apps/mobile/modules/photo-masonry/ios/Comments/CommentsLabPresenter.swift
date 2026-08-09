import SwiftUI
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

    let hostingController = UIHostingController(rootView: PhotoCommentsSheetView(store: store))
    hostingController.navigationItem.title = String(localized: "Comments")
    hostingController.navigationItem.prompt = request.photoTitle
    hostingController.navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: String(localized: "Done"),
      primaryAction: UIAction { [weak hostingController] _ in
        hostingController?.dismiss(animated: true)
      }
    )

    let navigation = UINavigationController(rootViewController: hostingController)
    navigation.modalPresentationStyle = .pageSheet
    navigation.preferredContentSize = CGSize(width: 520, height: 700)
    if let sheet = navigation.sheetPresentationController {
      let compactIdentifier = UISheetPresentationController.Detent.Identifier(
        "afilmory.comments-lab.compact"
      )
      let expandedIdentifier = UISheetPresentationController.Detent.Identifier(
        "afilmory.comments-lab.expanded"
      )
      sheet.detents = [
        .custom(identifier: compactIdentifier) { context in
          context.maximumDetentValue * 0.62
        },
        .custom(identifier: expandedIdentifier) { context in
          context.maximumDetentValue * 0.92
        },
      ]
      sheet.selectedDetentIdentifier = compactIdentifier
      sheet.prefersGrabberVisible = true
      sheet.prefersScrollingExpandsWhenScrolledToEdge = true
    }
    topViewController()?.present(navigation, animated: true)
  }

  private static func topViewController() -> UIViewController? {
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow }
    var top = window?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}
