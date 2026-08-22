import SwiftUI
import UIKit

struct CommentRowView: View {
  let comment: CommentItem
  let store: CommentsStore
  let bubbleMaxWidth: CGFloat

  @Environment(\.openURL) private var openURL
  @Environment(\.displayScale) private var displayScale
  @State private var confirmingBlock = false
  @State private var showingReportReasons = false

  private var own: Bool { comment.userId == store.viewerUserId }
  private var user: CommentUser? { store.user(for: comment) }
  private var author: String { store.authorName(for: comment) }
  private var parent: CommentItem? { store.parent(for: comment) }
  private var likeCount: Int { comment.reactionCounts["like"] ?? 0 }
  private var liked: Bool { comment.viewerReactions.contains("like") }
  private var reactionBusy: Bool { store.pendingReactionIds.contains(comment.id) }
  private var moderationBusy: Bool { store.pendingModerationIds.contains(comment.id) }
  private var isSending: Bool { comment.deliveryState == .sending }
  private var isFlightTarget: Bool { store.flight?.clientId == comment.identity }

  var body: some View {
    HStack(alignment: .bottom, spacing: 8) {
      if own {
        Spacer(minLength: 48)
      } else {
        CommentAvatarView(imageURL: user?.image, name: author, size: 30)
      }

      VStack(alignment: own ? .trailing : .leading, spacing: 4) {
        if !own {
          header
        }
        bubble
        footer
      }
      .frame(maxWidth: .infinity, alignment: own ? .trailing : .leading)

      if !own {
        Spacer(minLength: 42)
      }
    }
    .padding(.vertical, 6)
    .opacity(isFlightTarget ? 0 : 1)
    .contentShape(Rectangle())
    .contextMenu {
      Button(liked ? String(localized: "Remove like") : String(localized: "Like comment"), systemImage: liked ? "heart.slash" : "heart") {
        Task { await store.toggleReaction(comment.id) }
      }
      .disabled(isSending || reactionBusy)

      Button(String(localized: "Copy"), systemImage: "document.on.document") {
        UIPasteboard.general.string = comment.content
      }

      if !own, !isSending {
        Divider()
        Button(String(localized: "Report Comment"), systemImage: "exclamationmark.bubble") {
          showingReportReasons = true
        }
        .disabled(moderationBusy)
        Button(
          String(localized: "Block User"),
          systemImage: "person.crop.circle.badge.xmark",
          role: .destructive
        ) {
          confirmingBlock = true
        }
        .disabled(moderationBusy)
      }
    }
    .confirmationDialog(
      String(localized: "Why are you reporting this comment?"),
      isPresented: $showingReportReasons,
      titleVisibility: .visible
    ) {
      ForEach(CommentReportReason.allCases) { reason in
        Button(reason.title) {
          Task { await store.report(comment, reason: reason) }
        }
      }
      Button(String(localized: "Cancel"), role: .cancel) {}
    } message: {
      Text(String(localized: "The report will be sent to the Afilmory moderation team."))
    }
    .confirmationDialog(
      String(localized: "Block \(author)?"),
      isPresented: $confirmingBlock,
      titleVisibility: .visible
    ) {
      Button(String(localized: "Block User"), role: .destructive) {
        Task { await store.blockAuthor(comment) }
      }
      Button(String(localized: "Cancel"), role: .cancel) {}
    } message: {
      Text(String(localized: "Their comments and galleries will be removed from your view immediately. This comment will also be reported to Afilmory."))
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(accessibilityLabel)
    .accessibilityAction(named: Text(String(localized: "Reply"))) {
      guard !isSending else { return }
      store.beginReply(to: comment)
    }
    .accessibilityAction(named: Text(liked ? String(localized: "Remove like") : String(localized: "Like comment"))) {
      guard !isSending, !reactionBusy else { return }
      Task { await store.toggleReaction(comment.id) }
    }
    .accessibilityAction(named: Text(String(localized: "Copy"))) {
      UIPasteboard.general.string = comment.content
    }
    .accessibilityAction(named: Text(String(localized: "Report Comment"))) {
      guard !own, !isSending, !moderationBusy else { return }
      showingReportReasons = true
    }
    .accessibilityAction(named: Text(String(localized: "Block User"))) {
      guard !own, !isSending, !moderationBusy else { return }
      confirmingBlock = true
    }
  }

  private var header: some View {
    HStack(alignment: .firstTextBaseline, spacing: 7) {
      if let profileURL {
        Button {
          openURL(profileURL)
        } label: {
          authorText
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(.isLink)
      } else {
        authorText
      }

      if let relativeTime {
        Text(relativeTime)
          .font(.system(size: 10))
          .foregroundStyle(.tertiary)
      }
    }
    .padding(.leading, 8)
  }

  private var authorText: some View {
    Text(author)
      .font(.system(size: 12, weight: .semibold))
      .foregroundStyle(.primary)
      .lineLimit(1)
  }

  private var bubble: some View {
    CommentBubbleSurface(own: own) {
      VStack(alignment: .leading, spacing: 6) {
        if let parent {
          parentPreview(parent)
        }
        CommentBubbleText(comment.content, own: own)
          .textSelection(.enabled)
      }
    }
    .modifier(FlightTargetReporter(store: store, identity: comment.identity, active: isFlightTarget))
    .frame(maxWidth: bubbleMaxWidth, alignment: own ? .trailing : .leading)
  }

  private func parentPreview(_ parent: CommentItem) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 5) {
        Image(systemName: "arrowshape.turn.up.left")
          .font(.system(size: 11))
          .foregroundStyle(own ? Color.white.opacity(0.7) : Color(.tertiaryLabel))
        Text("Replying to \(store.authorName(for: parent))")
          .font(.system(size: 10))
          .foregroundStyle(own ? Color.white.opacity(0.72) : Color(.tertiaryLabel))
          .lineLimit(1)
      }
      Text(parent.content)
        .font(.system(size: 12))
        .foregroundStyle(own ? Color.white : Color.secondary)
        .lineLimit(3)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background {
      let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
      if own {
        shape.fill(Color.black.opacity(0.16))
        shape.strokeBorder(Color.white.opacity(0.2), lineWidth: 1 / displayScale)
      } else {
        shape.fill(Color(.tertiarySystemFill))
        shape.strokeBorder(Color(.separator), lineWidth: 1 / displayScale)
      }
    }
  }

  @ViewBuilder
  private var footer: some View {
    if isSending {
      sendingFooter
        .transition(.opacity)
    } else {
      settledFooter
        .transition(.opacity)
    }
  }

  private var sendingFooter: some View {
    Text(String(localized: "Sending…"))
      .font(.system(size: 10))
      .foregroundStyle(.tertiary)
      .frame(minHeight: 26)
      .padding(own ? .trailing : .leading, 3)
      .accessibilityHidden(true)
  }

  private var settledFooter: some View {
    HStack(spacing: 4) {
      if own, let relativeTime {
        Text(relativeTime)
          .font(.system(size: 10))
          .foregroundStyle(.tertiary)
      }

      if comment.status == .pending {
        Text(String(localized: "Pending review"))
          .font(.system(size: 9, weight: .bold))
          .textCase(.uppercase)
          .foregroundStyle(Color(red: 1, green: 0.816, blue: 0.541))
          .padding(.horizontal, 7)
          .padding(.vertical, 2)
          .background(Capsule().fill(Color.orange.opacity(0.13)))
      }

      likeButton
      replyButton
      if !own {
        moderationMenu
      }
    }
    .frame(minHeight: 26)
    .padding(own ? .trailing : .leading, 3)
  }

  private var likeButton: some View {
    Button {
      Task { await store.toggleReaction(comment.id) }
    } label: {
      HStack(spacing: 4) {
        if reactionBusy {
          ProgressView()
            .controlSize(.mini)
        } else {
          Image(systemName: liked ? "heart.fill" : "heart")
            .font(.system(size: 13))
            .foregroundStyle(liked ? Color.accentColor : Color.secondary)
        }
        Text(String(likeCount))
          .font(.system(size: 11, weight: .medium).monospacedDigit())
          .foregroundStyle(liked ? Color.accentColor : Color.secondary)
      }
      .padding(.horizontal, 6)
      .frame(minHeight: 26)
      .background {
        if liked {
          Capsule().fill(Color.accentColor.opacity(0.15))
        }
      }
    }
    .buttonStyle(.plain)
    .disabled(reactionBusy || isSending)
    .opacity(isSending ? 0.38 : 1)
    .accessibilityLabel("\(liked ? String(localized: "Remove like") : String(localized: "Like comment")), \(likeCount)")
  }

  private var replyButton: some View {
    Button {
      store.beginReply(to: comment)
    } label: {
      HStack(spacing: 4) {
        Image(systemName: "arrowshape.turn.up.left")
          .font(.system(size: 12))
        Text(String(localized: "Reply"))
          .font(.system(size: 11, weight: .medium))
      }
      .foregroundStyle(.secondary)
      .padding(.horizontal, 6)
      .frame(minHeight: 26)
    }
    .buttonStyle(.plain)
    .disabled(isSending)
    .opacity(isSending ? 0.38 : 1)
    .accessibilityLabel(String(localized: "Reply"))
  }

  private var moderationMenu: some View {
    Menu {
      Button(String(localized: "Report Comment"), systemImage: "exclamationmark.bubble") {
        showingReportReasons = true
      }
      Button(
        String(localized: "Block User"),
        systemImage: "person.crop.circle.badge.xmark",
        role: .destructive
      ) {
        confirmingBlock = true
      }
    } label: {
      Group {
        if moderationBusy {
          ProgressView()
            .controlSize(.mini)
        } else {
          Image(systemName: "ellipsis")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(.secondary)
        }
      }
      .frame(width: 28, height: 26)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(isSending || moderationBusy)
    .accessibilityLabel(String(localized: "Comment safety actions"))
    .accessibilityIdentifier("comments.moderation.\(comment.id)")
  }

  private var profileURL: URL? {
    guard let website = user?.website, !website.isEmpty else { return nil }
    let candidate = website.contains("://") ? website : "https://\(website)"
    guard let url = URL(string: candidate), url.scheme == "http" || url.scheme == "https" else { return nil }
    return url
  }

  private var relativeTime: String? {
    guard let date = comment.createdDate else { return nil }
    return date.formatted(
      Date.RelativeFormatStyle(presentation: .named, unitsStyle: .abbreviated)
    )
  }

  private var accessibilityLabel: String {
    [
      author,
      isSending ? nil : relativeTime,
      parent.map { String(localized: "Replying to \(store.authorName(for: $0))") },
      comment.content,
      isSending ? String(localized: "Sending…") : nil,
    ]
      .compactMap { $0 }
      .joined(separator: ", ")
  }
}

private struct FlightTargetReporter: ViewModifier {
  let store: CommentsStore
  let identity: String
  let active: Bool

  func body(content: Content) -> some View {
    if active {
      content
        .onGeometryChange(for: CGRect.self) { proxy in
          proxy.frame(in: .named(CommentsCoordinateSpace.root))
        } action: { frame in
          store.updateFlightTarget(frame, clientId: identity)
        }
    } else {
      content
    }
  }
}
