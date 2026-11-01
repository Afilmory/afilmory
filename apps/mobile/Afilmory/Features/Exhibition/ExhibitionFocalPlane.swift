import UIKit

struct FocalPlaneMath {
  static let maxBlur: CGFloat = 5
  static let lineFraction: CGFloat = 0.42

  static func focus(cellMidY: CGFloat, offset: CGFloat, viewport: CGFloat) -> (blur: CGFloat, alpha: CGFloat) {
    guard viewport > 0 else { return (0, 1) }
    let distance = abs(cellMidY - (offset + viewport * lineFraction)) / viewport
    return (min(maxBlur, distance * 12), max(0.4, 1 - distance * 0.8))
  }
}

@MainActor
final class ExhibitionFocalPlane: NSObject {
  static let liveBlurCap = 5

  private weak var collectionView: UICollectionView?
  private var settleWork: DispatchWorkItem?
  private var displayLink: CADisplayLink?
  private var lastTimestamp: CFTimeInterval = 0
  private var slowFrames = 0
  private var sampledFrames = 0
  private(set) var blurAllowed = true
  private(set) var isMoving = false

  init(collectionView: UICollectionView) {
    self.collectionView = collectionView
    super.init()
  }

  func scrolled() {
    guard let collectionView, collectionView.isTracking || collectionView.isDecelerating || collectionView.isDragging else { return }
    isMoving = true
    startMonitoring()
    apply()
    settleWork?.cancel()
    let work = DispatchWorkItem { [weak self] in self?.settle() }
    settleWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.16, execute: work)
  }

  func settle() {
    settleWork?.cancel()
    isMoving = false
    stopMonitoring()
    collectionView?.visibleCells.compactMap { $0 as? ContactSheetFocusCell }.forEach { $0.clearFocus(animated: true) }
  }

  private func apply() {
    guard let collectionView else { return }
    let viewport = collectionView.bounds.height
    let offset = collectionView.contentOffset.y
    let blurs = AFMotion.reduceMotion || !blurAllowed ? false : true
    let cells = collectionView.visibleCells.compactMap { $0 as? ContactSheetFocusCell }
    let focuses = cells.map { FocalPlaneMath.focus(cellMidY: $0.frame.midY, offset: offset, viewport: viewport) }
    let ranked = focuses.enumerated().sorted { $0.element.blur > $1.element.blur }.prefix(Self.liveBlurCap).map(\.offset)
    for (index, cell) in cells.enumerated() {
      let focus = focuses[index]
      cell.setFocus(blur: focus.blur, alpha: focus.alpha, allowsBlur: blurs && ranked.contains(index))
    }
  }

  private func startMonitoring() {
    guard displayLink == nil, blurAllowed else { return }
    lastTimestamp = 0
    let link = CADisplayLink(target: self, selector: #selector(frame(_:)))
    link.add(to: .main, forMode: .common)
    displayLink = link
  }

  private func stopMonitoring() {
    displayLink?.invalidate()
    displayLink = nil
  }

  @objc private func frame(_ link: CADisplayLink) {
    defer { lastTimestamp = link.timestamp }
    guard lastTimestamp > 0 else { return }
    let expected = link.targetTimestamp - link.timestamp
    let actual = link.timestamp - lastTimestamp
    sampledFrames += 1
    if expected > 0, actual > expected * 1.8 { slowFrames += 1 }
    if sampledFrames >= 90 {
      if Double(slowFrames) / Double(sampledFrames) > 0.2 {
        blurAllowed = false
        stopMonitoring()
      }
      sampledFrames = 0
      slowFrames = 0
    }
  }
}
