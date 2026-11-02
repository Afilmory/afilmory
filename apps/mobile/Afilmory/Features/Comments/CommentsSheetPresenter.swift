import Observation
import UIKit

@MainActor
enum CommentsSheetPresenter {
  static func make(store: CommentsStore, onClose: @escaping (Int) -> Void) -> AFSheetController {
    let subtitle = store.request.photoTitle.isEmpty ? nil : store.request.photoTitle
    let sheet = AFSheetController(
      title: title(for: store),
      subtitle: subtitle,
      detent: .fitAndExpanded,
      rootView: PhotoCommentsSheetView(store: store)
    )
    sheet.closeAction = { [weak sheet, weak store] in
      onClose(store?.result.commentCount ?? 0)
      sheet?.dismiss(animated: true)
    }
    store.onRequestSignIn = { [weak sheet, weak store] in
      onClose(store?.result.commentCount ?? 0)
      sheet?.dismiss(animated: true) { AppNavigator.shared.presentSignIn() }
    }
    trackHeader(store: store, sheet: sheet, subtitle: subtitle)
    return sheet
  }

  private static func title(for store: CommentsStore) -> String {
    let known = store.request.initialCommentCount >= 0 || store.loadState == .loaded
    return known ? String(localized: "Comments · \(store.result.commentCount)") : String(localized: "Comments")
  }

  private static func trackHeader(store: CommentsStore, sheet: AFSheetController, subtitle: String?) {
    withObservationTracking {
      _ = title(for: store)
    } onChange: { [weak store, weak sheet] in
      Task { @MainActor in
        guard let store, let sheet else { return }
        sheet.setHeader(title: title(for: store), subtitle: subtitle)
        trackHeader(store: store, sheet: sheet, subtitle: subtitle)
      }
    }
  }
}
