import UIKit

extension PhotoDetailViewController: UIGestureRecognizerDelegate {
  func wireSheet() {
    sheet.onToggle = { [weak self] in
      guard let self else { return }
      setDetent(rules.detent == .collapsed ? .expanded : .collapsed, animated: true)
    }
    sheet.onCollapseRequest = { [weak self] in self?.setDetent(.collapsed, animated: true) }
    sheet.onOpenLocation = { [weak self] in self?.openLocation() }
    sheet.onOpenComments = { [weak self] in self?.presentComments() }
    infoColumn.onOpenLocation = { [weak self] in self?.openLocation() }
    infoColumn.onOpenComments = { [weak self] in self?.presentComments() }
  }

  func installGestures() {
    let sheetPan = UIPanGestureRecognizer(target: self, action: #selector(handleSheetPan(_:)))
    sheetPan.delegate = self
    sheet.addGestureRecognizer(sheetPan)
    let photoPan = UIPanGestureRecognizer(target: self, action: #selector(handlePhotoPan(_:)))
    photoPan.delegate = self
    photoPan.name = "detail.dismiss"
    view.addGestureRecognizer(photoPan)
  }

  func setDetent(_ detent: DetailSheetDetent, animated: Bool) {
    rules.detent = detent
    pager.isScrollEnabled = rules.pagingEnabled
    for cell in pager.visibleCells.compactMap({ $0 as? DetailPageCell }) {
      cell.scrollView.pinchGestureRecognizer?.isEnabled = rules.zoomEnabled
    }
    sheetProgress = detent == .expanded ? 1 : 0
    hideRail()
    let changes = { self.layoutSheet() }
    if animated {
      let blurFrom = photoDefocus.radius
      AFMotion.spring(duration: AFMotion.reduceMotion ? 0.25 : 0.56, damping: 0.9, animations: changes)
      let blurTo = photoDefocus.radius
      photoDefocus.radius = blurFrom
      photoDefocus.setRadius(blurTo, duration: AFMotion.reduceMotion ? 0 : 0.45)
    } else {
      changes()
    }
    UIAccessibility.post(notification: .layoutChanged, argument: sheet)
  }

  func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
    guard let pan = gesture as? UIPanGestureRecognizer else { return true }
    if duoSplit != nil, pan.name != "detail.dismiss" { return false }
    if isFullScreen, pan.name == "detail.dismiss" { return false }
    let velocity = pan.velocity(in: view)
    guard abs(velocity.y) > abs(velocity.x) * 1.2 else { return false }
    if pan.name == "detail.dismiss" {
      let point = pan.location(in: view)
      guard !sheet.frame.contains(point), !chips.frame.contains(point), rules.detent == .collapsed, !rules.isZoomed else { return false }
      return true
    }
    let point = pan.location(in: sheet)
    let inHeader = point.y < sheet.headerBottom + 10
    return inHeader || rules.detent == .collapsed
  }

  func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool {
    false
  }

  @objc func handleSheetPan(_ pan: UIPanGestureRecognizer) {
    let translation = pan.translation(in: view).y
    switch pan.state {
    case .began:
      sheetDragStartProgress = sheetProgress
      hideRail()
    case .changed:
      let collapsed = DetailGeometry.collapsedSheet(bounds: chromeBounds, height: collapsedHeight).minY
      let expanded = DetailGeometry.expandedSheet(bounds: chromeBounds, safeTop: view.safeAreaInsets.top).minY
      let span = max(1, collapsed - expanded)
      sheetProgress = min(1, max(0, sheetDragStartProgress - translation / span))
      layoutSheet()
    case .ended, .cancelled:
      let from: DetailSheetDetent = sheetDragStartProgress > 0.5 ? .expanded : .collapsed
      setDetent(DetailGestureRules.detent(afterDragFrom: from, translation: translation, velocity: pan.velocity(in: view).y), animated: true)
    default:
      break
    }
  }

  @objc func handlePhotoPan(_ pan: UIPanGestureRecognizer) {
    let translation = pan.translation(in: view)
    switch pan.state {
    case .began:
      dismissTranslation = 0
      dismissDriftX = 0
    case .changed:
      if translation.y < 0, dismissTranslation == 0, duoSplit == nil {
        sheetProgress = DetailGestureRules.photoPanSheetProgress(translationY: translation.y)
        layoutSheet()
        return
      }
      if sheetProgress > 0 {
        sheetProgress = 0
        layoutSheet()
      }
      dismissTranslation = max(0, translation.y)
      dismissDriftX = translation.x * 0.6
      applyPhotoRecession()
      let progress = min(1, dismissTranslation / max(1, view.bounds.height * 0.6))
      backdrop.alpha = 1 - progress
      [sheet, chips, topChrome].forEach { $0.alpha = 1 - min(1, progress * 2.5) }
      AppNavigator.shared.setTabBarHidden(true, animated: false)
    case .ended, .cancelled:
      let velocity = pan.velocity(in: view).y
      if dismissTranslation == 0 {
        guard duoSplit == nil else { return }
        setDetent(translation.y < -60 || velocity < -500 ? .expanded : .collapsed, animated: true)
        return
      }
      let finished = pan.state == .ended
        && DetailGestureRules.shouldDismiss(translation: dismissTranslation, velocity: velocity, height: view.bounds.height)
      if finished {
        close()
      } else {
        dismissTranslation = 0
        dismissDriftX = 0
        AFMotion.spring(duration: 0.45, damping: 0.85, animations: {
          self.backdrop.alpha = 1
          [self.sheet, self.chips, self.topChrome].forEach { $0.alpha = 1 }
        })
        setDetent(.collapsed, animated: true)
      }
    default:
      break
    }
  }
}
