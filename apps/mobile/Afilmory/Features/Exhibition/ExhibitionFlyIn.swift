import UIKit

@MainActor
enum ExhibitionFlyIn {
  struct Source {
    let photoID: String
    let frame: CGRect
    let image: UIImage?
  }

  static func capture(from cells: [ContactSheetRowCell], located: Set<String>, in view: UIView, limit: Int = 12) -> [Source] {
    var sources: [Source] = []
    for cell in cells {
      for id in cell.photoIDs where located.contains(id) {
        guard sources.count < limit, let image = cell.imageView(for: id) else { continue }
        let frame = image.convert(image.bounds, to: view)
        guard view.bounds.intersects(frame) else { continue }
        sources.append(Source(photoID: id, frame: frame, image: image.image))
      }
    }
    return sources
  }

  static func run(_ sources: [Source], card: ExhibitionMapCard, in view: UIView) {
    card.setPinsHidden(true)
    guard !sources.isEmpty, !AFMotion.reduceMotion else {
      card.pinViews().values.forEach { $0.alpha = 0 }
      UIView.animate(withDuration: 0.25, delay: 0.1) { card.setPinsHidden(false) }
      return
    }
    let flyers: [(UIImageView, CGRect, CGFloat)] = sources.compactMap { source in
      guard let target = card.pinTarget(for: source.photoID, in: view) else { return nil }
      let flyer = UIImageView(image: source.image)
      flyer.contentMode = .scaleAspectFill
      flyer.clipsToBounds = true
      flyer.frame = source.frame
      flyer.layer.borderColor = AFColor.textPrimary.withAlphaComponent(0).cgColor
      flyer.layer.borderWidth = 2
      flyer.layer.cornerCurve = .continuous
      view.addSubview(flyer)
      let size = ExhibitionPinView.size
      return (flyer, CGRect(x: target.center.x - size / 2, y: target.center.y - size / 2, width: size, height: size), target.rotation)
    }
    let flownIDs = Set(sources.map(\.photoID))
    UIView.animate(withDuration: 0.7, delay: 0, usingSpringWithDamping: 0.88, initialSpringVelocity: 0, options: [.allowUserInteraction]) {
      for (flyer, target, rotation) in flyers {
        flyer.bounds = CGRect(origin: .zero, size: target.size)
        flyer.center = CGPoint(x: target.midX, y: target.midY)
        flyer.transform = CGAffineTransform(rotationAngle: rotation * .pi / 180)
        flyer.layer.cornerRadius = AFRadius.thumb
      }
    } completion: { _ in
      card.setPinsHidden(false)
      flyers.forEach { $0.0.removeFromSuperview() }
    }
    for (flyer, _, _) in flyers {
      let border = CABasicAnimation(keyPath: "borderColor")
      border.fromValue = flyer.layer.borderColor
      border.toValue = AFColor.textPrimary.cgColor
      border.beginTime = CACurrentMediaTime() + 0.2
      border.duration = 0.5
      border.fillMode = .forwards
      border.isRemovedOnCompletion = false
      flyer.layer.add(border, forKey: "border")
    }
    for (id, pin) in card.pinViews() where !flownIDs.contains(id) {
      UIView.animate(withDuration: 0.3, delay: 0.5) { pin.alpha = 1 }
    }
  }
}
