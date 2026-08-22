import SwiftUI

enum CommentsCoordinateSpace {
  static let root = "afilmory.comments.root"
}

struct PhotoCommentsSheetView: View {
  @Bindable var store: CommentsStore

  @State private var contentWidth: CGFloat = 0

  var body: some View {
    content
      .safeAreaInset(edge: .bottom, spacing: 0) {
        VStack(spacing: 0) {
          Divider()
          if store.isSignedIn {
            CommentComposerView(store: store)
          } else {
            CommentSignInView(store: store)
          }
        }
      }
      .overlay {
        if let flight = store.flight {
          CommentSendFlightOverlay(store: store, clientId: flight.clientId, content: flight.content)
        }
      }
      .coordinateSpace(name: CommentsCoordinateSpace.root)
      .task {
        await store.loadInitial()
      }
      .alert(
        String(localized: "Content safety"),
        isPresented: $store.showingModerationNotice
      ) {
        Button(String(localized: "Done"), role: .cancel) {}
      } message: {
        if let moderationNotice = store.moderationNotice {
          Text(moderationNotice)
        }
      }
  }

  @ViewBuilder private var content: some View {
    switch store.loadState {
    case .idle, .loading:
      ScrollView {
        LazyVStack(spacing: 0) {
          ForEach(0..<4, id: \.self) { _ in
            CommentSkeletonRowView()
          }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
      }
      .scrollDisabled(true)
    case .failed:
      ContentUnavailableView {
        Label(String(localized: "Unable to load comments"), systemImage: "exclamationmark.triangle")
      } actions: {
        Button(String(localized: "Retry")) {
          Task { await store.loadInitial() }
        }
      }
    case .loaded:
      if store.collection.comments.isEmpty {
        ContentUnavailableView {
          Label(String(localized: "No comments yet. Be the first to comment!"), systemImage: "bubble.left")
        } actions: {
          Button(String(localized: "Retry")) {
            Task { await store.refresh() }
          }
        }
      } else {
        commentsList
      }
    }
  }

  private var commentsList: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(spacing: 0) {
          if let inlineError = store.inlineError {
            CommentInlineErrorView(
              message: inlineError,
              dismissLabel: String(localized: "Done"),
              onDismiss: store.dismissInlineError
            )
            .padding(.vertical, 4)
          }

          ForEach(store.collection.comments, id: \.identity) { comment in
            CommentRowView(comment: comment, store: store, bubbleMaxWidth: bubbleMaxWidth)
              .id(comment.identity)
              .task(id: comment.id) {
                await store.loadMoreIfNeeded(lastVisibleCommentId: comment.id)
              }
          }

          if store.isLoadingMore {
            ProgressView()
              .frame(maxWidth: .infinity)
              .padding(.vertical, 18)
              .accessibilityLabel(String(localized: "Sending…"))
          } else if store.loadMoreFailed {
            Button {
              Task { await store.retryLoadMore() }
            } label: {
              Label(String(localized: "Unable to load more comments. Try again."), systemImage: "arrow.clockwise")
                .font(.footnote)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.accentColor)
          }
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 16)
      }
      .scrollDismissesKeyboard(.interactively)
      .refreshable {
        await store.refresh()
      }
      .onGeometryChange(for: CGFloat.self) { proxy in
        proxy.size.width
      } action: { width in
        contentWidth = width
      }
      .onChange(of: store.pendingScrollIdentity) { _, identity in
        guard let identity else { return }
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
          proxy.scrollTo(identity, anchor: .bottom)
        }
        store.clearPendingScroll()
      }
    }
  }

  private var bubbleMaxWidth: CGFloat {
    guard contentWidth > 0 else { return .infinity }
    return max(120, (contentWidth - 24) * CommentBubbleMetrics.maxWidthRatio)
  }
}
