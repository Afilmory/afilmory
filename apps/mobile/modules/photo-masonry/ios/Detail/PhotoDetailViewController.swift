import SwiftUI
import UIKit

private struct PhotoReactionAnalysisResponse: Decodable, Sendable {
  let data: PhotoReactionAnalysisData?
}

private struct PhotoReactionAnalysisData: Decodable, Sendable {
  let reactions: JSONValue?
}

private struct PhotoReactionAddBody: Encodable {
  let count: Int
  let reaction: String
  let refKey: String
}

private struct PhotoSocialKey: Hashable, Sendable {
  let gallerySlug: String
  let photoId: String
}

final class PhotoDetailViewController: UIViewController {
  let detailView: PhotoDetailView

  private let photos: [GalleryPhoto]
  private let initialIndex: Int
  private let gallerySlug: String?
  private let localization: Localization
  private let onRequestSignIn: () -> Void
  private let sourceProvider: (String) -> UIView?
  private let commentCount = PhotoCommentCount()
  private var currentIndex: Int
  private var reactionStates: [PhotoSocialKey: PhotoReactionState] = [:]
  private var reactionFetchTask: Task<Void, Never>?
  private var reactionFlushTask: Task<Void, Never>?
  private var reactionTally: PhotoReactionTally?
  private var reactionTallyKey: PhotoSocialKey?
  private var reactionFailureNonce: Double = 0
  private var commentsStore: CommentsStore?
  private weak var commentsNavigationController: UINavigationController?
  private var statusBarHidden = false
  private var homeIndicatorHidden = false
  private var transitionDelegateOwner: PhotoTransitionDelegate!

  init(
    photos: [GalleryPhoto],
    initialIndex: Int,
    gallerySlug: String?,
    localization: Localization = .shared,
    onRequestSignIn: @escaping () -> Void = {},
    sourceProvider: @escaping (String) -> UIView?
  ) {
    self.photos = photos
    self.initialIndex = min(max(initialIndex, 0), max(photos.count - 1, 0))
    self.gallerySlug = gallerySlug
    self.localization = localization
    self.onRequestSignIn = onRequestSignIn
    self.sourceProvider = sourceProvider
    currentIndex = self.initialIndex
    detailView = PhotoDetailView(frame: .zero)
    super.init(nibName: nil, bundle: nil)

    transitionDelegateOwner = PhotoTransitionDelegate(detailController: self)
    transitioningDelegate = transitionDelegateOwner
    modalPresentationStyle = .custom
    modalPresentationCapturesStatusBarAppearance = true
    transitionDelegateOwner.interaction.attach(to: self, detailView: detailView)
    configureDetailView()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func loadView() {
    view = detailView
  }

  override var prefersStatusBarHidden: Bool {
    statusBarHidden
  }

  override var preferredStatusBarStyle: UIStatusBarStyle {
    .lightContent
  }

  override var prefersHomeIndicatorAutoHidden: Bool {
    homeIndicatorHidden
  }

  override func viewWillTransition(
    to size: CGSize,
    with coordinator: UIViewControllerTransitionCoordinator
  ) {
    transitionDelegateOwner.finishPresentationForGeometryChange()
    super.viewWillTransition(to: size, with: coordinator)
    coordinator.animate { [weak self] _ in
      self?.detailView.setNeedsLayout()
      self?.detailView.layoutIfNeeded()
    }
  }

  func transitionSourceView() -> UIView? {
    guard detailView.canTransitionToSource,
          let photoId = detailView.transitionPhotoId
    else { return nil }
    return sourceProvider(photoId)
  }

  func prepareForInteractiveDismissal() {
    transitionDelegateOwner.finishPresentationForGeometryChange()
  }

  func presentationTransitionDidFinish() {
    buildRemainingMetadata()
  }

  func flushPendingSocialActions() {
    flushPendingReaction()
  }

  private func configureDetailView() {
    detailView.setPhotos(photos.map { MasonryPhoto(photo: $0, localization: localization) })
    detailView.setInitialIndex(initialIndex)
    detailView.setStrings(detailStrings())
    detailView.setLivePhotoStrings(livePhotoStrings())
    detailView.setReactionItems(reactionItems(counts: [:]))
    detailView.setSocialActionsEnabled(gallerySlug != nil)
    detailView.setMetadata(metadata(around: initialIndex))
    commentCount.onChange = { [weak detailView] count in
      detailView?.setCommentCount(count ?? -1)
    }
    detailView.onNativeTransitionClose = { [weak self] in
      self?.flushPendingReaction()
      self?.dismiss(animated: true)
    }
    detailView.onNativeIndexChange = { [weak self] photoId, index in
      self?.loadSocial(photoId: photoId, index: index)
    }
    detailView.onNativeCommentsRequest = { [weak self] photoId, index in
      self?.presentComments(photoId: photoId, index: index)
    }
    detailView.onNativeReactionRequest = { [weak self] photoId, index, reaction, count in
      self?.addReaction(photoId: photoId, index: index, reaction: reaction, count: count)
    }
    detailView.onNativeScreenTraitsChange = { [weak self] statusBarHidden, homeIndicatorHidden in
      guard let self else { return }
      self.statusBarHidden = statusBarHidden
      self.homeIndicatorHidden = homeIndicatorHidden
      setNeedsStatusBarAppearanceUpdate()
      setNeedsUpdateOfHomeIndicatorAutoHidden()
    }
    if photos.indices.contains(initialIndex) {
      loadSocial(photoId: photos[initialIndex].id, index: initialIndex)
    }
  }

  private func loadSocial(photoId: String, index: Int) {
    guard photos.indices.contains(index), photos[index].id == photoId else { return }
    if currentIndex != index {
      flushPendingReaction()
    }
    currentIndex = index
    commentCount.load(gallerySlug: gallerySlug, photoId: photoId)
    reactionFetchTask?.cancel()
    guard let gallerySlug else {
      detailView.setReactionItems(reactionItems(counts: [:]))
      return
    }
    let key = PhotoSocialKey(gallerySlug: gallerySlug, photoId: photoId)
    renderReactions(for: key)
    reactionFetchTask = Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        let baseURL = try ApiEnvironmentStore.shared.galleryAPIBaseURL(slug: gallerySlug)
        let endpoint = APIEndpoint(
          baseURL: .explicit(baseURL.absoluteString),
          path: "reactions",
          queryItems: [URLQueryItem(name: "refKey", value: photoId)]
        )
        let response: PhotoReactionAnalysisResponse = try await AfilmoryAPI.shared.request(endpoint)
        try Task.checkCancellation()
        guard currentKey == key else { return }
        let serverCounts = PhotoReactionState.normalize(response.data?.reactions)
        reactionStates[key] = (reactionStates[key] ?? PhotoReactionState()).merging(
          serverCounts: serverCounts
        )
        renderReactions(for: key)
      } catch {
        return
      }
    }
  }

  private func addReaction(
    photoId: String,
    index: Int,
    reaction value: String,
    count: Int
  ) {
    guard count > 0,
          photos.indices.contains(index),
          photos[index].id == photoId,
          index == currentIndex,
          let gallerySlug,
          let reaction = PhotoReaction(rawValue: value)
    else { return }
    reactionFetchTask?.cancel()
    let key = PhotoSocialKey(gallerySlug: gallerySlug, photoId: photoId)
    reactionStates[key] = (reactionStates[key] ?? PhotoReactionState()).adding(
      reaction,
      count: count
    )
    renderReactions(for: key)

    let step = PhotoReactionTallyEngine.accumulate(
      current: reactionTallyKey == key ? reactionTally : nil,
      reaction: value,
      count: count,
      now: Date.timeIntervalSinceReferenceDate
    )
    if reactionTallyKey != key {
      flushPendingReaction()
    }
    if let flush = step.flush {
      submitReaction(flush, key: key)
    }
    reactionTally = step.tally
    reactionTallyKey = key
    scheduleReactionFlush()
  }

  private func scheduleReactionFlush() {
    reactionFlushTask?.cancel()
    reactionFlushTask = Task { @MainActor [weak self] in
      do {
        try await Task.sleep(for: .seconds(PhotoReactionTallyEngine.mergeWindow))
      } catch {
        return
      }
      guard let self, let key = reactionTallyKey else { return }
      let step = PhotoReactionTallyEngine.expire(
        current: reactionTally,
        now: Date.timeIntervalSinceReferenceDate
      )
      reactionTally = step.tally
      if reactionTally == nil {
        reactionTallyKey = nil
      }
      if let flush = step.flush {
        submitReaction(flush, key: key)
      }
    }
  }

  private func flushPendingReaction() {
    reactionFlushTask?.cancel()
    reactionFlushTask = nil
    let step = PhotoReactionTallyEngine.drain(current: reactionTally)
    let key = reactionTallyKey
    reactionTally = nil
    reactionTallyKey = nil
    if let flush = step.flush, let key {
      submitReaction(flush, key: key)
    }
  }

  private func submitReaction(_ flush: PhotoReactionFlush, key: PhotoSocialKey) {
    let localization = localization
    Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        let baseURL = try ApiEnvironmentStore.shared.galleryAPIBaseURL(slug: key.gallerySlug)
        let body = try APIEndpoint.jsonBody(
          PhotoReactionAddBody(
            count: flush.count,
            reaction: flush.reaction,
            refKey: key.photoId
          )
        )
        let endpoint = APIEndpoint(
          baseURL: .explicit(baseURL.absoluteString),
          path: "reactions/add",
          method: .post,
          body: body
        )
        let _: JSONValue? = try await AfilmoryAPI.shared.request(endpoint)
        acknowledgeReaction(flush, key: key)
        let message = flush.count > 1
          ? localization.value(
            "photo.reaction.burst",
            arguments: [
              "count": String(flush.count),
              "reaction": flush.reaction,
            ]
          )
          : localization.value("photo.reaction.success")
        UIAccessibility.post(notification: .announcement, argument: message)
      } catch {
        rollbackReaction(flush, key: key)
        reactionFailureNonce += 1
        detailView.setReactionFailureNonce(reactionFailureNonce)
        UIAccessibility.post(
          notification: .announcement,
          argument: localization.value("photo.reaction.failed")
        )
      }
    }
  }

  private func acknowledgeReaction(_ flush: PhotoReactionFlush, key: PhotoSocialKey) {
    guard var state = reactionStates[key] else { return }
    let remaining = max(0, (state.localDeltas[flush.reaction] ?? 0) - flush.count)
    if remaining == 0 {
      state.localDeltas.removeValue(forKey: flush.reaction)
    } else {
      state.localDeltas[flush.reaction] = remaining
    }
    reactionStates[key] = state
  }

  private func rollbackReaction(_ flush: PhotoReactionFlush, key: PhotoSocialKey) {
    guard let reaction = PhotoReaction(rawValue: flush.reaction) else { return }
    reactionStates[key] = (reactionStates[key] ?? PhotoReactionState()).rollingBack(
      reaction,
      count: flush.count
    )
    if currentKey == key {
      renderReactions(for: key)
    }
  }

  private func renderReactions(for key: PhotoSocialKey) {
    let counts = reactionStates[key]?.counts ?? [:]
    detailView.setReactionItems(reactionItems(counts: counts))
  }

  private var currentKey: PhotoSocialKey? {
    guard let gallerySlug, photos.indices.contains(currentIndex) else { return nil }
    return PhotoSocialKey(gallerySlug: gallerySlug, photoId: photos[currentIndex].id)
  }

  private func presentComments(photoId: String, index: Int) {
    guard commentsStore == nil,
          let gallerySlug,
          photos.indices.contains(index),
          photos[index].id == photoId,
          let baseURL = try? ApiEnvironmentStore.shared.galleryAPIBaseURL(slug: gallerySlug)
    else { return }

    var request = PhotoCommentsSheetRequest()
    request.gallerySlug = gallerySlug
    request.photoId = photoId
    request.photoTitle = photos[index].title
    request.baseURL = baseURL.absoluteString
    request.viewerUserId = AfilmorySessionStore.shared.current().state.session?.user.id
    request.initialCommentCount = commentCount.count ?? -1
    let store = CommentsStore(
      request: request,
      localization: .resolve(localization)
    )
    commentsStore = store

    let hostingController = UIHostingController(rootView: PhotoCommentsSheetView(store: store))
    hostingController.navigationItem.title = store.localization.title
    if !request.photoTitle.isEmpty {
      hostingController.navigationItem.prompt = request.photoTitle
    }
    hostingController.navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: store.localization.done,
      primaryAction: UIAction { [weak self, weak hostingController] _ in
        self?.finishComments()
        hostingController?.dismiss(animated: true)
      }
    )
    store.onRequestSignIn = { [weak self, weak hostingController] in
      guard let self else { return }
      finishComments()
      hostingController?.dismiss(animated: true) { [onRequestSignIn] in
        onRequestSignIn()
      }
    }

    let navigation = UINavigationController(rootViewController: hostingController)
    navigation.modalPresentationStyle = .pageSheet
    navigation.preferredContentSize = CGSize(width: 520, height: 700)
    if let sheet = navigation.sheetPresentationController {
      let compactIdentifier = UISheetPresentationController.Detent.Identifier(
        "afilmory.photo-comments.compact"
      )
      let expandedIdentifier = UISheetPresentationController.Detent.Identifier(
        "afilmory.photo-comments.expanded"
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
    navigation.presentationController?.delegate = self
    commentsNavigationController = navigation
    present(navigation, animated: true)
  }

  private func finishComments() {
    guard let store = commentsStore else { return }
    commentCount.setCount(store.result.commentCount)
    commentsStore = nil
    commentsNavigationController = nil
  }


  private func buildRemainingMetadata() {
    guard photos.count > 5 else { return }
    let photos = photos
    let localization = localization
    let task = Task.detached {
      Self.metadata(
        photos: photos,
        indices: photos.indices,
        localization: localization
      )
    }
    Task { @MainActor [weak self] in
      let values = await task.value
      self?.detailView.setMetadata(values)
    }
  }

  private func metadata(around index: Int) -> [PhotoDetailMetadata] {
    let lower = max(0, index - 2)
    let upper = min(photos.count, index + 3)
    return Self.metadata(
      photos: photos,
      indices: lower..<upper,
      localization: localization
    )
  }

  nonisolated private static func metadata(
    photos: [GalleryPhoto],
    indices: Range<Int>,
    localization: Localization
  ) -> [PhotoDetailMetadata] {
    indices.map { index in
      let photo = photos[index]
      let header = PhotoHeaderModel.build(
        photo: photo,
        localeIdentifier: localization.language.localeIdentifier,
        strings: PhotoHeaderStrings(
          fallbackTitle: localization.value("page.photo"),
          today: localization.value("photo.captureDay.today"),
          yesterday: localization.value("photo.captureDay.yesterday")
        )
      )
      let info = PhotoInfoModel.build(
        photo: photo,
        localization: localization,
        localeIdentifier: localization.language.localeIdentifier
      )
      return PhotoDetailMetadata(
        id: photo.id,
        title: header.title,
        subtitle: header.subtitle,
        infoJSON: info.detailJSON(localization: localization)
      )
    }
  }

  private func detailStrings() -> PhotoDetailStrings {
    PhotoDetailStrings(
      close: localization.value("photo.close"),
      comments: localization.value("photo.comments"),
      info: localization.value("photo.info"),
      next: localization.value("photo.next"),
      previous: localization.value("photo.previous"),
      reaction: localization.value("photo.reaction.open"),
      share: localization.value("photo.share")
    )
  }

  private func livePhotoStrings() -> LivePhotoBadgeStrings {
    LivePhotoBadgeStrings(
      badgeLive: localization.value("photo.liveBadge"),
      badgeLoop: localization.value("photo.liveBadgeLoop"),
      badgeBounce: localization.value("photo.liveBadgeBounce"),
      badgeOff: localization.value("photo.liveBadgeOff"),
      menuLive: localization.value("photo.liveMode.live"),
      menuLoop: localization.value("photo.liveMode.loop"),
      menuBounce: localization.value("photo.liveMode.bounce"),
      menuOff: localization.value("photo.liveMode.off"),
      accessibilityLabel: localization.value("photo.livePhoto"),
      accessibilityHint: localization.value("photo.livePhotoHint")
    )
  }

  private func reactionItems(counts: [String: Int]) -> [PhotoDetailReactionItem] {
    PhotoReaction.allCases.map { reaction in
      PhotoDetailReactionItem(
        accessibilityLabel: localization.value(
          "photo.reaction.add",
          arguments: ["reaction": reaction.rawValue]
        ),
        count: counts[reaction.rawValue] ?? 0,
        reaction: reaction.rawValue
      )
    }
  }

}

extension PhotoDetailViewController: UIAdaptivePresentationControllerDelegate {
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    guard presentationController.presentedViewController === commentsNavigationController else { return }
    finishComments()
  }
}
