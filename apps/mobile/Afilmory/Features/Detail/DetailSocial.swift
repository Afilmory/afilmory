import Foundation

private struct DetailReactionResponse: Decodable, Sendable {
  struct Payload: Decodable, Sendable {
    let reactions: JSONValue?
  }

  let data: Payload?
}

private struct DetailReactionBody: Encodable {
  let count: Int
  let reaction: String
  let refKey: String
}

@MainActor
final class DetailSocial {
  var onReactionsChange: (([String: Int]) -> Void)?
  var onReactionFailure: (() -> Void)?
  var onCommentCount: ((Int?) -> Void)? {
    didSet { commentCount.onChange = onCommentCount }
  }

  let gallerySlug: String?
  let commentCount = PhotoCommentCount()
  private(set) var photoID: String?
  private var states: [String: PhotoReactionState] = [:]
  private var fetchTask: Task<Void, Never>?
  private var flushTask: Task<Void, Never>?
  private var tally: PhotoReactionTally?
  private var tallyPhotoID: String?

  init(gallerySlug: String?) {
    self.gallerySlug = gallerySlug
  }

  var isAvailable: Bool { gallerySlug != nil }

  func counts(for photoID: String) -> [String: Int] {
    states[photoID]?.counts ?? [:]
  }

  func focus(photoID: String) {
    guard photoID != self.photoID else { return }
    flush()
    self.photoID = photoID
    commentCount.load(gallerySlug: gallerySlug, photoId: photoID)
    onReactionsChange?(counts(for: photoID))
    fetchTask?.cancel()
    guard let baseURL = galleryBaseURL else { return }
    fetchTask = Task { @MainActor [weak self] in
      let endpoint = APIEndpoint(
        baseURL: .explicit(baseURL.absoluteString),
        path: "reactions",
        queryItems: [URLQueryItem(name: "refKey", value: photoID)]
      )
      guard let response: DetailReactionResponse = try? await AfilmoryAPI.shared.request(endpoint),
            let self, !Task.isCancelled, self.photoID == photoID
      else { return }
      let server = PhotoReactionState.normalize(response.data?.reactions)
      states[photoID] = (states[photoID] ?? PhotoReactionState()).merging(serverCounts: server)
      onReactionsChange?(counts(for: photoID))
    }
  }

  func add(_ reaction: PhotoReaction, count: Int) {
    guard count > 0, let photoID, isAvailable else { return }
    fetchTask?.cancel()
    states[photoID] = (states[photoID] ?? PhotoReactionState()).adding(reaction, count: count)
    onReactionsChange?(counts(for: photoID))
    if tallyPhotoID != photoID { flush() }
    let step = PhotoReactionTallyEngine.accumulate(
      current: tally,
      reaction: reaction.rawValue,
      count: count,
      now: Date.timeIntervalSinceReferenceDate
    )
    if let pending = step.flush { submit(pending, photoID: photoID) }
    tally = step.tally
    tallyPhotoID = photoID
    scheduleFlush()
  }

  func flush() {
    flushTask?.cancel()
    flushTask = nil
    let step = PhotoReactionTallyEngine.drain(current: tally)
    let target = tallyPhotoID
    tally = nil
    tallyPhotoID = nil
    if let pending = step.flush, let target { submit(pending, photoID: target) }
  }

  func commentsRequest(for photo: GalleryPhoto) -> PhotoCommentsSheetRequest? {
    guard let gallerySlug, let baseURL = galleryBaseURL else { return nil }
    var request = PhotoCommentsSheetRequest()
    request.gallerySlug = gallerySlug
    request.photoId = photo.id
    request.photoTitle = ExhibitFormat.isFilenameLikeTitle(photo.title) ? "" : photo.title
    request.baseURL = baseURL.absoluteString
    request.viewerUserId = AfilmorySessionStore.shared.current().state.session?.user.id
    request.initialCommentCount = commentCount.count ?? -1
    return request
  }

  private var galleryBaseURL: URL? {
    gallerySlug.flatMap { try? ApiEnvironmentStore.shared.galleryAPIBaseURL(slug: $0) }
  }

  private func scheduleFlush() {
    flushTask?.cancel()
    flushTask = Task { @MainActor [weak self] in
      try? await Task.sleep(for: .seconds(PhotoReactionTallyEngine.mergeWindow))
      guard let self, !Task.isCancelled, let target = tallyPhotoID else { return }
      let step = PhotoReactionTallyEngine.expire(current: tally, now: Date.timeIntervalSinceReferenceDate)
      tally = step.tally
      if tally == nil { tallyPhotoID = nil }
      if let pending = step.flush { submit(pending, photoID: target) }
    }
  }

  private func submit(_ pending: PhotoReactionFlush, photoID: String) {
    guard let baseURL = galleryBaseURL else { return }
    Task { @MainActor [weak self] in
      do {
        let body = try APIEndpoint.jsonBody(DetailReactionBody(count: pending.count, reaction: pending.reaction, refKey: photoID))
        let endpoint = APIEndpoint(baseURL: .explicit(baseURL.absoluteString), path: "reactions/add", method: .post, body: body)
        let _: JSONValue? = try await AfilmoryAPI.shared.request(endpoint)
        self?.acknowledge(pending, photoID: photoID)
      } catch {
        self?.rollback(pending, photoID: photoID)
      }
    }
  }

  private func acknowledge(_ pending: PhotoReactionFlush, photoID: String) {
    guard var state = states[photoID] else { return }
    let remaining = max(0, (state.localDeltas[pending.reaction] ?? 0) - pending.count)
    state.localDeltas[pending.reaction] = remaining == 0 ? nil : remaining
    states[photoID] = state
  }

  private func rollback(_ pending: PhotoReactionFlush, photoID: String) {
    guard let reaction = PhotoReaction(rawValue: pending.reaction) else { return }
    states[photoID] = (states[photoID] ?? PhotoReactionState()).rollingBack(reaction, count: pending.count)
    if self.photoID == photoID { onReactionsChange?(counts(for: photoID)) }
    onReactionFailure?()
  }
}
