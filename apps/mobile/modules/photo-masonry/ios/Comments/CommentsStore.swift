import Foundation
import Observation
import SwiftUI
import UIKit

struct CommentFlight: Equatable {
  let clientId: String
  let content: String
  let origin: CGRect
  var target: CGRect?
}

@MainActor
@Observable
final class CommentsStore {
  enum LoadState {
    case idle
    case loading
    case loaded
    case failed
  }

  let request: PhotoCommentsSheetRequest

  var collection = CommentCollection.empty
  var loadState: LoadState = .idle
  var nextCursor: String?
  var isRefreshing = false
  var isLoadingMore = false
  var loadMoreFailed = false
  var isSending = false
  var inlineError: String?
  var draft = ""
  var replyCommentId: String?
  var pendingReactionIds: Set<String> = []
  var pendingModerationIds: Set<String> = []
  var requiresAuthentication = false
  var moderationNotice: String?
  var showingModerationNotice = false
  var flight: CommentFlight?
  var pendingScrollIdentity: String?
  private(set) var requestedSignIn = false

  @ObservationIgnored var onRequestSignIn: (() -> Void)?
  @ObservationIgnored var composerFrame: CGRect = .zero
  @ObservationIgnored private let transport: CommentsTransport
  @ObservationIgnored private var flightLocked = false
  @ObservationIgnored private var baselineCommentCount: Int?
  @ObservationIgnored private var successfulCreateCount = 0
  @ObservationIgnored private var successfulRemovalCount = 0

  init(
    request: PhotoCommentsSheetRequest,
    transport: CommentsTransport? = nil
  ) {
    self.request = request
    self.transport = transport ?? LiveCommentsTransport(baseURL: request.baseURL)
    baselineCommentCount = request.initialCommentCount >= 0 ? request.initialCommentCount : nil
  }

  var viewerUserId: String? { request.viewerUserId }
  var isSignedIn: Bool { viewerUserId != nil && !requiresAuthentication }
  var characterCount: Int { draft.count }
  var canSend: Bool {
    let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    return isSignedIn && !isSending && !trimmed.isEmpty && characterCount <= 1_000
  }

  var replyComment: CommentItem? {
    guard let replyCommentId else { return nil }
    return collection.comments.first { $0.id == replyCommentId } ?? collection.relations[replyCommentId]
  }

  var result: PhotoCommentsSheetResult {
    let baseline = baselineCommentCount ?? max(0, collection.comments.count - successfulCreateCount)
    return PhotoCommentsSheetResult(
      commentCount: max(0, baseline + successfulCreateCount - successfulRemovalCount),
      requestedSignIn: requestedSignIn
    )
  }

  func loadInitial() async {
    guard loadState == .idle || loadState == .failed else { return }
    loadState = .loading
    inlineError = nil
    do {
      let page = try await transport.list(photoId: request.photoId, cursor: nil)
      collection = CommentsState.mergePage(.empty, page: page, replacing: true)
      nextCursor = CommentsState.advanceCursor(current: nil, page: page, replacing: true)
      updateInferredBaselineIfComplete()
      loadState = .loaded
    } catch {
      guard !isCancellation(error) else { return }
      if handleUnauthorized(error) {
        loadState = .loaded
      } else {
        loadState = .failed
      }
    }
  }

  func refresh() async {
    guard !isRefreshing else { return }
    isRefreshing = true
    loadMoreFailed = false
    defer { isRefreshing = false }
    do {
      let page = try await transport.list(photoId: request.photoId, cursor: nil)
      collection = CommentsState.mergePage(collection, page: page, replacing: true)
      nextCursor = CommentsState.advanceCursor(current: nextCursor, page: page, replacing: true)
      updateInferredBaselineIfComplete()
      loadState = .loaded
      inlineError = nil
    } catch {
      guard !isCancellation(error) else { return }
      if !handleUnauthorized(error) {
        inlineError = String(localized: "Unable to load comments")
      }
    }
  }

  func loadMoreIfNeeded(lastVisibleCommentId: String) async {
    guard collection.comments.last?.id == lastVisibleCommentId,
          let cursor = nextCursor,
          !isLoadingMore
    else { return }
    await loadMore(cursor: cursor)
  }

  func retryLoadMore() async {
    guard let cursor = nextCursor, !isLoadingMore else { return }
    await loadMore(cursor: cursor)
  }

  func send() async {
    let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard canSend, let viewerUserId else { return }

    let clientId = "comment-\(UUID().uuidString)"
    let parentId = replyCommentId
    let optimistic = CommentItem(
      id: "local-\(clientId)",
      photoId: request.photoId,
      parentId: parentId,
      userId: viewerUserId,
      content: content,
      status: .pending,
      createdAt: Date.now.formatted(.iso8601),
      updatedAt: Date.now.formatted(.iso8601),
      reactionCounts: [:],
      viewerReactions: [],
      clientId: clientId,
      deliveryState: .sending
    )

    isSending = true
    inlineError = nil
    draft = ""
    replyCommentId = nil
    beginFlight(clientId: clientId, content: content)
    let insert = {
      self.collection.comments.append(optimistic)
      if self.collection.users[viewerUserId] == nil {
        self.collection.users[viewerUserId] = CommentUser(
          id: viewerUserId,
          name: String(localized: "You"),
          image: nil,
          website: nil
        )
      }
    }
    if flight == nil {
      mutateAnimated(insert)
    } else {
      insert()
    }
    pendingScrollIdentity = clientId

    do {
      let page = try await transport.create(
        content: content,
        photoId: request.photoId,
        parentId: parentId
      )
      mutateAnimated {
        collection = CommentsState.settleOptimisticComment(
          collection,
          clientId: clientId,
          page: page
        )
      }
      successfulCreateCount += 1
    } catch {
      completeFlight(clientId)
      mutateAnimated {
        collection = CommentsState.removeFailedOptimisticComment(collection, clientId: clientId)
      }
      draft = content
      replyCommentId = parentId
      if !handleUnauthorized(error), !isCancellation(error) {
        inlineError = String(localized: "Unable to post the comment. Your draft was restored.")
      }
    }
    isSending = false
  }

  func toggleReaction(_ commentId: String) async {
    guard isSignedIn else {
      requestSignIn()
      return
    }
    guard !pendingReactionIds.contains(commentId),
          let index = collection.comments.firstIndex(where: { $0.id == commentId })
    else { return }

    let original = collection.comments[index]
    pendingReactionIds.insert(commentId)
    inlineError = nil
    collection.comments[index] = CommentsState.toggleLocalReaction(original)

    do {
      let response = try await transport.toggleReaction(commentId: commentId)
      let page = CommentPage(comments: [response.item], relations: [:], users: [:], nextCursor: nextCursor)
      collection = CommentsState.mergePage(collection, page: page)
    } catch {
      if let rollbackIndex = collection.comments.firstIndex(where: { $0.id == commentId }) {
        collection.comments[rollbackIndex] = original
      }
      if !handleUnauthorized(error), !isCancellation(error) {
        inlineError = String(localized: "Unable to update the like. Try again.")
      }
    }
    pendingReactionIds.remove(commentId)
  }

  func report(_ comment: CommentItem, reason: CommentReportReason) async {
    guard isSignedIn else {
      requestSignIn()
      return
    }
    guard comment.userId != viewerUserId,
          comment.deliveryState != .sending,
          !pendingModerationIds.contains(comment.id)
    else { return }

    pendingModerationIds.insert(comment.id)
    inlineError = nil
    defer { pendingModerationIds.remove(comment.id) }

    do {
      _ = try await transport.report(commentId: comment.id, reason: reason)
      moderationNotice = String(localized: "Report submitted. Our moderation team has been notified.")
      showingModerationNotice = true
    } catch {
      if !handleUnauthorized(error), !isCancellation(error) {
        inlineError = String(localized: "Unable to submit the report. Try again.")
      }
    }
  }

  func blockAuthor(_ comment: CommentItem) async {
    guard isSignedIn else {
      requestSignIn()
      return
    }
    guard comment.userId != viewerUserId,
          comment.deliveryState != .sending,
          !pendingModerationIds.contains(comment.id)
    else { return }

    let previous = collection
    let removedCount = collection.comments.count { $0.userId == comment.userId }
    pendingModerationIds.insert(comment.id)
    inlineError = nil
    mutateAnimated {
      collection = CommentsState.removingAuthor(collection, userId: comment.userId)
    }

    do {
      _ = try await transport.blockAuthor(commentId: comment.id)
      successfulRemovalCount += removedCount
      moderationNotice = String(localized: "User blocked. Their content was removed.")
      showingModerationNotice = true
    } catch {
      mutateAnimated {
        collection = previous
      }
      if !handleUnauthorized(error), !isCancellation(error) {
        inlineError = String(localized: "Unable to block this user. Try again.")
      }
    }
    pendingModerationIds.remove(comment.id)
  }

  func beginReply(to comment: CommentItem) {
    guard comment.deliveryState != .sending else { return }
    replyCommentId = comment.id
    inlineError = nil
  }

  func cancelReply() {
    replyCommentId = nil
  }

  func dismissInlineError() {
    inlineError = nil
  }

  func requestSignIn() {
    requestedSignIn = true
    onRequestSignIn?()
  }

  func updateComposerFrame(_ frame: CGRect) {
    composerFrame = frame
  }

  func updateFlightTarget(_ frame: CGRect, clientId: String) {
    guard var active = flight,
          active.clientId == clientId,
          !flightLocked,
          frame.width > 0,
          frame.height > 0
    else { return }
    active.target = frame
    flight = active
  }

  func lockFlight(_ clientId: String) {
    guard flight?.clientId == clientId else { return }
    flightLocked = true
  }

  func completeFlight(_ clientId: String) {
    guard flight?.clientId == clientId else { return }
    flight = nil
    flightLocked = false
  }

  func clearPendingScroll() {
    pendingScrollIdentity = nil
  }

  func user(for comment: CommentItem) -> CommentUser? {
    collection.users[comment.userId]
  }

  func parent(for comment: CommentItem) -> CommentItem? {
    guard let parentId = comment.parentId else { return nil }
    return collection.relations[parentId] ?? collection.comments.first { $0.id == parentId }
  }

  func authorName(for comment: CommentItem) -> String {
    if comment.userId == viewerUserId {
      return String(localized: "You")
    }
    if let name = user(for: comment)?.name, !name.isEmpty {
      return name
    }
    guard !comment.userId.isEmpty else { return String(localized: "Guest") }
    return String(localized: "User \(String(comment.userId.suffix(6)))")
  }

  private func beginFlight(clientId: String, content: String) {
    let origin = composerFrame
    guard origin.width > 0, origin.height > 0 else { return }
    flightLocked = false
    flight = CommentFlight(clientId: clientId, content: content, origin: origin, target: nil)
  }

  private func loadMore(cursor: String) async {
    isLoadingMore = true
    loadMoreFailed = false
    defer { isLoadingMore = false }
    do {
      let page = try await transport.list(photoId: request.photoId, cursor: cursor)
      collection = CommentsState.mergePage(collection, page: page)
      nextCursor = CommentsState.advanceCursor(current: nextCursor, page: page, replacing: false)
      updateInferredBaselineIfComplete()
    } catch {
      guard !isCancellation(error) else { return }
      if !handleUnauthorized(error) {
        loadMoreFailed = true
      }
    }
  }

  private func updateInferredBaselineIfComplete() {
    guard baselineCommentCount == nil, nextCursor == nil else { return }
    baselineCommentCount = max(0, collection.comments.count - successfulCreateCount)
  }

  @discardableResult
  private func handleUnauthorized(_ error: Error) -> Bool {
    guard case .unauthorized = APIError.request(error) else { return false }
    requiresAuthentication = true
    inlineError = String(localized: "Your session expired. Sign in again to continue.")
    return true
  }

  private func isCancellation(_ error: Error) -> Bool {
    if case .cancelled = APIError.request(error) {
      return true
    }
    return false
  }

  private func mutateAnimated(_ mutation: () -> Void) {
    if UIAccessibility.isReduceMotionEnabled {
      mutation()
    } else {
      withAnimation(.snappy, mutation)
    }
  }
}
