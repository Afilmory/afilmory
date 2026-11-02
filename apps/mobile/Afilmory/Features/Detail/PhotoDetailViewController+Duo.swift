import UIKit

extension PhotoDetailViewController {
  struct DuoSplit: Equatable {
    let photo: CGRect
    let info: CGRect
  }

  static func duoSplit(context: DuoContext, bounds: CGRect, safeArea: UIEdgeInsets, fold: CGRect?) -> DuoSplit? {
    let content = CGRect(
      x: safeArea.left, y: bounds.minY,
      width: max(0, bounds.width - safeArea.left - safeArea.right), height: bounds.height
    )
    switch context.posture {
    case .single:
      return nil
    case .book:
      guard let fold, fold.minX > content.minX, fold.maxX < content.maxX else { return nil }
      let pages = DuoGeometry.pages(in: content, fold: fold)
      return DuoSplit(photo: pages.left, info: pages.right)
    case .flat:
      let columns = DuoGeometry.flatColumns(in: content, secondaryFraction: 1.0 / 3.0, spacing: 12)
      return DuoSplit(photo: columns.main, info: columns.secondary)
    }
  }

  var duoSplit: DuoSplit? {
    let context = traitCollection.duoContext
    return Self.duoSplit(context: context, bounds: view.bounds, safeArea: view.safeAreaInsets, fold: DuoGeometry.fold(of: context, in: view))
  }

  var duoContentRect: CGRect {
    let safe = view.safeAreaInsets
    return CGRect(x: safe.left, y: 0, width: max(0, view.bounds.width - safe.left - safe.right), height: view.bounds.height)
  }

  func duoChipsFrame(_ split: DuoSplit) -> CGRect {
    let bottom = split.photo.maxY - max(view.safeAreaInsets.bottom, 12) - 8
    return CGRect(x: split.photo.minX + 6, y: bottom - 44, width: split.photo.width - 12, height: 44)
  }

  func duoPhotoArea(_ split: DuoSplit) -> CGRect {
    let top = max(view.safeAreaInsets.top, 20) + 8
    guard !isFullScreen else {
      return CGRect(x: 0, y: top, width: photoLayer.bounds.width, height: max(120, view.bounds.height - top - max(view.safeAreaInsets.bottom, 12)))
    }
    let bottom = duoChipsFrame(split).minY - DetailGeometry.chipsGap
    return CGRect(x: 0, y: top, width: split.photo.width, height: max(120, bottom - top))
  }

  func layoutDuo(_ split: DuoSplit) {
    topChrome.isHidden = true
    photoLayer.transform = .identity
    photoDefocus.radius = 0
    let photoFrame = isFullScreen ? duoContentRect : split.photo
    photoLayer.bounds = CGRect(origin: .zero, size: photoFrame.size)
    photoLayer.center = CGPoint(x: photoFrame.midX, y: photoFrame.midY)
    pager.frame = photoLayer.bounds
    photoDefocus.frame = photoLayer.bounds
    resnapPagerIfResized()
    let chipsFrame = duoChipsFrame(split)
    chips.transform = .identity
    chips.bounds = CGRect(origin: .zero, size: chipsFrame.size)
    chips.center = CGPoint(x: chipsFrame.midX, y: chipsFrame.midY)
    let railSize = rail.intrinsicContentSize
    rail.frame = CGRect(x: chipsFrame.maxX - railSize.width, y: chipsFrame.minY - railSize.height - 10, width: railSize.width, height: railSize.height)
    let top = max(view.safeAreaInsets.top, 20) + 8
    let bottom = max(view.safeAreaInsets.bottom, 12) + 8
    let info = CGRect(x: split.info.minX + 4, y: top, width: split.info.width - 8, height: max(0, split.info.height - top - bottom))
    sheet.isHidden = true
    infoColumn.isHidden = commentsColumn != nil
    infoColumn.frame = info
    let chromeAlpha: CGFloat = isFullScreen ? 0 : 1
    if !isTransitioning {
      photoLayer.alpha = 1
      chips.alpha = chromeAlpha
      infoColumn.alpha = chromeAlpha
    }
    if let column = commentsColumn {
      column.frame = info
      column.alpha = infoColumn.alpha
      column.isUserInteractionEnabled = !isFullScreen
    }
    infoColumn.isUserInteractionEnabled = !isFullScreen
    chips.isUserInteractionEnabled = !isFullScreen
    let area = duoPhotoArea(split)
    for cell in pager.visibleCells.compactMap({ $0 as? DetailPageCell }) {
      cell.photoArea = area
      cell.progressFloor = nil
    }
  }

  func leaveDuoLayout() {
    topChrome.isHidden = false
    sheet.isHidden = false
    infoColumn.isHidden = true
    sheet.isUserInteractionEnabled = true
    chips.isUserInteractionEnabled = true
    if !isTransitioning {
      sheet.alpha = 1
      chips.alpha = 1
    }
  }

  func toggleFullScreen(animated: Bool) {
    guard duoSplit != nil else { return }
    isFullScreen.toggle()
    applyVerticalBar()
    let alpha: CGFloat = isFullScreen ? 0 : 1
    let changes = {
      self.chips.alpha = alpha
      self.infoColumn.alpha = alpha
      self.commentsColumn?.alpha = alpha
      self.view.setNeedsLayout()
      self.view.layoutIfNeeded()
    }
    animated && !AFMotion.reduceMotion ? AFMotion.spring(duration: 0.38, animations: changes) : changes()
  }

  func applyVerticalBar() {
    let context = traitCollection.duoContext
    backButton.isHidden = context.hasVerticalBar
    moreButton.isHidden = context.hasVerticalBar
    guard context.hasVerticalBar else {
      navigationItem.rightBarButtonItems = []
      return
    }
    var items = [DuoBarItems.symbol("chevron.left", label: String(localized: "Back")) { [weak self] in self?.close() }]
    if context.isExpanded {
      items.append(DuoBarItems.symbol(
        isFullScreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right",
        label: isFullScreen ? String(localized: "Exit Full Screen") : String(localized: "Full Screen")
      ) { [weak self] in self?.toggleFullScreen(animated: true) })
    }
    let more = UIBarButtonItem(image: UIImage(systemName: "ellipsis"), menu: moreMenu())
    more.accessibilityLabel = String(localized: "More")
    more.title = String(localized: "More")
    items.append(more)
    DuoBarItems.install(items, on: self)
  }

  var chromeBounds: CGRect {
    let safe = view.safeAreaInsets
    return CGRect(x: safe.left, y: 0, width: max(0, view.bounds.width - safe.left - safe.right), height: view.bounds.height)
  }

  func resnapPagerIfResized() {
    guard pager.bounds.width > 0, pager.bounds.width != pagerWidth else { return }
    let first = pagerWidth == 0
    pagerWidth = pager.bounds.width
    guard !first else { return }
    pager.collectionViewLayout.invalidateLayout()
    pager.layoutIfNeeded()
    pager.contentOffset = CGPoint(x: CGFloat(currentIndex) * pager.bounds.width, y: 0)
  }

  func duoContextChanged() {
    if traitCollection.duoContext.isExpanded, rules.detent != .collapsed {
      setDetent(.collapsed, animated: false)
    }
    if !traitCollection.duoContext.isExpanded {
      if isFullScreen {
        isFullScreen = false
        chips.alpha = 1
        sheet.alpha = 1
        infoColumn.alpha = 1
      }
      closeCommentsColumn()
    }
    applyVerticalBar()
    if duoSplit == nil { leaveDuoLayout() }
    view.setNeedsLayout()
  }
}
