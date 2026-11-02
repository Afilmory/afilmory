import SwiftUI
import UIKit

extension PhotoDetailViewController {
  func wireSocial() {
    chips.onReaction = { [weak self] in
      guard let self else { return }
      isRailShown ? hideRail() : showRail()
    }
    chips.onShare = { [weak self] in self?.share() }
    rail.onSend = { [weak self] reaction, count in
      self?.social.add(reaction, count: count)
      self?.chips.setReacted(true)
    }
    social.onReactionsChange = { [weak self] counts in
      self?.rail.setCounts(counts)
    }
    social.onReactionFailure = { [weak self] in
      UINotificationFeedbackGenerator().notificationOccurred(.error)
      UIAccessibility.post(notification: .announcement, argument: String(localized: "Unable to add reaction. Please try again."))
      self?.chips.setReacted(false)
    }
    social.onCommentCount = { [weak self] count in
      self?.sheet.setCommentCount(count)
      self?.infoColumn.setCommentCount(count)
    }
  }

  func showRail() {
    guard social.isAvailable, !isRailShown else { return }
    isRailShown = true
    rail.isHidden = false
    view.bringSubviewToFront(rail)
    if AFMotion.reduceMotion {
      UIView.animate(withDuration: 0.2) { self.rail.alpha = 1 }
    } else {
      rail.transform = CGAffineTransform(translationX: 0, y: 12).scaledBy(x: 0.92, y: 0.92)
      AFMotion.spring(duration: 0.4, damping: 0.8, animations: {
        self.rail.alpha = 1
        self.rail.transform = .identity
      })
    }
    UIAccessibility.post(notification: .layoutChanged, argument: rail)
  }

  func hideRail() {
    guard isRailShown else { return }
    isRailShown = false
    UIView.animate(withDuration: 0.2, delay: 0, options: [.beginFromCurrentState]) {
      self.rail.alpha = 0
    } completion: { _ in
      if !self.isRailShown { self.rail.isHidden = true }
    }
  }

  func share() {
    guard let photo = currentPhoto else { return }
    PhotoShareActivity.present(
      photoId: photo.id,
      gallerySlug: gallerySlug,
      originalUrl: photo.originalUrl,
      placeholderImage: currentCell?.imageView.image,
      from: self,
      sourceView: chips.shareButton
    )
  }

  func moreMenu() -> UIMenu {
    var actions: [UIMenuElement] = []
    if let photo = currentPhoto, let url = PhotoShareLink.url(photoId: photo.id, gallerySlug: gallerySlug) {
      actions.append(UIAction(title: String(localized: "Copy Link"), image: UIImage(systemName: "link")) { _ in
        UIPasteboard.general.url = url
      })
      actions.append(UIAction(title: String(localized: "Share"), image: UIImage(systemName: "square.and.arrow.up")) { [weak self] _ in
        self?.share()
      })
    }
    actions.append(UIAction(title: String(localized: "Photo Information"), image: UIImage(systemName: "info.circle")) { [weak self] _ in
      self?.setDetent(.expanded, animated: true)
    })
    return UIMenu(children: actions)
  }

  func presentComments() {
    guard let photo = currentPhoto, let request = social.commentsRequest(for: photo) else { return }
    openComments(store: CommentsStore(request: request))
  }

  func openLocation() {
    guard let photo = currentPhoto else { return }
    let ownSlug: String? = {
      guard case .signedIn(let session) = AfilmorySessionStore.shared.current().state else { return nil }
      return session.activeWorkspace?.slug
    }()
    let slug = gallerySlug
    social.flush()
    dismiss(animated: true) {
      if let slug, slug != ownSlug {
        AppNavigator.shared.openGallery(
          GalleryRouteRequest(requestId: UUID().uuidString, slug: slug, title: slug, photoID: photo.id),
          level: .infinity
        )
      } else {
        AppNavigator.shared.openOwnExhibition(level: .infinity, focusingPhotoID: photo.id)
      }
    }
  }
}
