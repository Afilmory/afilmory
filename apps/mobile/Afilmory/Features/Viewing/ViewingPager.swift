import UIKit

@MainActor
final class ViewingPager: NSObject, UIPageViewControllerDataSource, UIPageViewControllerDelegate {
  let controller = UIPageViewController(transitionStyle: .scroll, navigationOrientation: .horizontal)
  let pages: [ViewingPageController]
  var onProgress: ((CGFloat) -> Void)?
  var onSettle: ((ViewingPage) -> Void)?
  private(set) var progress: CGFloat = 0
  private var blurs: [AFBlurView] = []
  private var offsetObservation: NSKeyValueObservation?
  private var lastSettled: Int?
  private weak var scrollView: UIScrollView?

  init(pages: [ViewingPageController], initial: ViewingPage) {
    self.pages = pages
    super.init()
    controller.dataSource = pages.count > 1 ? self : nil
    controller.delegate = self
    for page in pages {
      let blur = AFBlurView()
      blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      page.view.addSubview(blur)
      blurs.append(blur)
    }
    let index = min(initial.rawValue, pages.count - 1)
    controller.setViewControllers([pages[index]], direction: .forward, animated: false)
    progress = CGFloat(index)
    lastSettled = index
  }

  var currentPage: ViewingPage {
    let index = min(max(ViewingSegmentProgress.selectedIndex(progress: progress), 0), pages.count - 1)
    return pages[index].page
  }

  var visiblePage: ViewingPageController? {
    controller.viewControllers?.first as? ViewingPageController
  }

  func attach() {
    guard scrollView == nil,
          let scroll = controller.view.subviews.compactMap({ $0 as? UIScrollView }).first
    else { return }
    scrollView = scroll
    scroll.delaysContentTouches = false
    offsetObservation = scroll.observe(\.contentOffset, options: [.new]) { [weak self] _, _ in
      MainActor.assumeIsolated { self?.track() }
    }
    applyEffects()
  }

  func show(_ page: ViewingPage, animated: Bool) {
    guard let index = pages.firstIndex(where: { $0.page == page }) else { return }
    let current = visiblePage.flatMap { visible in pages.firstIndex { $0 === visible } } ?? 0
    guard index != current else {
      track(force: true)
      return
    }
    let animate = animated && !AFMotion.reduceMotion
    controller.setViewControllers([pages[index]], direction: index > current ? .forward : .reverse, animated: animate) { [weak self] _ in
      MainActor.assumeIsolated { self?.track(force: true) }
    }
    if !animate {
      controller.view.layoutIfNeeded()
      track(force: true)
    }
  }

  private func geometricProgress() -> CGFloat? {
    guard let container = controller.view, container.bounds.width > 0 else { return nil }
    var best: (distance: CGFloat, progress: CGFloat)?
    for (index, page) in pages.enumerated() where page.isViewLoaded && page.view.window != nil {
      let originX = page.view.convert(CGPoint.zero, to: container).x
      guard let value = ViewingSegmentProgress.progress(
        pageIndex: index,
        pageOriginX: originX,
        pageWidth: container.bounds.width,
        pageCount: pages.count
      ) else { continue }
      if best == nil || abs(originX) < best!.distance {
        best = (abs(originX), value)
      }
    }
    return best?.progress
  }

  private func track(force: Bool = false) {
    guard let value = geometricProgress() else { return }
    if force || abs(value - progress) > 0.0005 {
      progress = value
      applyEffects()
      onProgress?(value)
    }
    let scrolling = scrollView?.isDragging == true || scrollView?.isDecelerating == true
    guard let settled = ViewingSegmentProgress.settledIndex(progress: progress) else {
      lastSettled = nil
      return
    }
    if !scrolling || force { settle(settled) }
  }

  private func applyEffects() {
    let reduce = AFMotion.reduceMotion
    for (index, page) in pages.enumerated() where page.isViewLoaded {
      page.view.alpha = ViewingSegmentProgress.pageAlpha(progress: progress, index: index)
      let blur = blurs[index]
      page.view.bringSubviewToFront(blur)
      blur.frame = page.view.bounds
      blur.radius = ViewingSegmentProgress.pageBlur(progress: progress, index: index, reduceMotion: reduce)
    }
  }

  private func settle(_ index: Int) {
    guard lastSettled != index, pages.indices.contains(index) else { return }
    lastSettled = index
    onSettle?(pages[index].page)
  }

  func pageViewController(_: UIPageViewController, viewControllerBefore viewController: UIViewController) -> UIViewController? {
    guard let index = pages.firstIndex(where: { $0 === viewController }), index > 0 else { return nil }
    return pages[index - 1]
  }

  func pageViewController(_: UIPageViewController, viewControllerAfter viewController: UIViewController) -> UIViewController? {
    guard let index = pages.firstIndex(where: { $0 === viewController }), index < pages.count - 1 else { return nil }
    return pages[index + 1]
  }

  func pageViewController(
    _: UIPageViewController,
    didFinishAnimating _: Bool,
    previousViewControllers _: [UIViewController],
    transitionCompleted _: Bool
  ) {
    track(force: true)
  }
}
