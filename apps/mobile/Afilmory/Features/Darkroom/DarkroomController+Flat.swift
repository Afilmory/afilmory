import UIKit

extension DarkroomController {
  var duoContext: DuoContext {
    navigationController?.traitCollection.duoContext ?? traitCollection.duoContext
  }

  var flatRoutes: [(DarkroomRowButton, StudioHomeRoute)] {
    [(rows.library, .library), (rows.replies, .comments), (rows.data, .analytics),
     (rows.sync, .operations), (rows.site, .site), (rows.domain, .domain)]
  }

  func selectFlat(_ route: StudioHomeRoute?, reusing existing: UIViewController? = nil) {
    guard route != flatSelection || (route != nil && flatDetail == nil) else { return }
    removeFlatDetail()
    flatSelection = route
    if let route {
      let detail = existing ?? makeSubpage(route)
      addChild(detail)
      view.addSubview(detail.view)
      detail.didMove(toParent: self)
      flatDetail = detail
    }
    primaryColumn.alpha = route == nil ? 1 : 0
    updateFlatSelection()
    view.setNeedsLayout()
  }

  func removeFlatDetail() {
    guard let detail = flatDetail else { return }
    detail.willMove(toParent: nil)
    detail.view.removeFromSuperview()
    detail.removeFromParent()
    flatDetail = nil
  }

  func updateFlatSelection() {
    let isFlat = duoContext.isFlat
    stageRow.isSelected = isFlat && flatSelection == nil
    for (row, route) in flatRoutes {
      row.isSelected = isFlat && route == flatSelection
    }
  }

  func layoutFlatDetail(sidebarMaxX: CGFloat) {
    guard let detail = flatDetail else { return }
    let safe = view.safeAreaInsets
    let minX = sidebarMaxX + 12
    detail.view.frame = CGRect(x: minX, y: 0, width: max(0, view.bounds.width - safe.right - minX), height: view.bounds.height)
  }

  func duoPostureChanged() {
    if duoContext.isFlat {
      if let navigation = navigationController,
         let top = navigation.topViewController as? DarkroomSubpageController, let route = top.route {
        navigation.popToRootViewController(animated: false)
        let reuse = { [weak self] in
          guard let self, self.duoContext.isFlat, top.parent == nil else { return }
          self.selectFlat(route, reusing: top)
        }
        if let coordinator = navigation.transitionCoordinator {
          coordinator.animate(alongsideTransition: nil) { _ in reuse() }
        } else {
          DispatchQueue.main.async(execute: reuse)
        }
      }
    } else if flatSelection != nil, let detail = flatDetail {
      removeFlatDetail()
      flatSelection = nil
      primaryColumn.alpha = 1
      detail.view.transform = .identity
      navigationController?.pushViewController(detail, animated: false)
    }
    updateFlatSelection()
    applyVerticalBar()
    view.setNeedsLayout()
  }
}
