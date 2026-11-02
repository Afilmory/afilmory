import SwiftUI
import UIKit

final class WorkspaceSetupViewController: UIHostingController<WorkspaceSetupView> {
  init(mode: WorkspaceSetupMode) {
    super.init(rootView: WorkspaceSetupView(mode: mode))
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = AFColor.ground
  }
}
