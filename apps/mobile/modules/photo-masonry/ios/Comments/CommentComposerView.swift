import SwiftUI

enum CommentComposerMetrics {
  static let cornerRadius: CGFloat = 22
  static let chromeInset: CGFloat = 3
  static let contentSpacing: CGFloat = 6
  static let fieldHorizontalInset: CGFloat = 11
  static let fieldVerticalInset: CGFloat = 8
  static let sendButtonSize: CGFloat = 32
  static let textSize: CGFloat = 14

  static var minimumHeight: CGFloat { sendButtonSize + chromeInset * 2 }
  static var sourceLeadingInset: CGFloat { chromeInset + fieldHorizontalInset }
  static var sourceTrailingInset: CGFloat {
    chromeInset + fieldHorizontalInset + contentSpacing + sendButtonSize
  }
  static var sourceVerticalInset: CGFloat { chromeInset + fieldVerticalInset }
}

struct CommentComposerView: View {
  @Bindable var store: CommentsStore
  @FocusState private var isFocused: Bool

  @Environment(\.displayScale) private var displayScale

  var body: some View {
    VStack(spacing: 0) {
      if let reply = store.replyComment {
        HStack(spacing: 7) {
          Image(systemName: "arrowshape.turn.up.left")
            .font(.system(size: 12))
            .foregroundStyle(.secondary)
            .accessibilityHidden(true)
          Text("Replying to \(store.authorName(for: reply))")
            .font(.system(size: 12))
            .foregroundStyle(.secondary)
            .lineLimit(1)
          Spacer(minLength: 8)
          Button(String(localized: "Cancel reply"), systemImage: "xmark") {
            store.cancelReply()
          }
          .labelStyle(.iconOnly)
          .buttonStyle(.plain)
          .font(.system(size: 12))
          .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background {
          let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
          shape.fill(Color.accentColor.opacity(0.12))
          shape.strokeBorder(Color.accentColor.opacity(0.3), lineWidth: 1 / displayScale)
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
      }

      HStack(alignment: .bottom, spacing: CommentComposerMetrics.contentSpacing) {
        VStack(alignment: .trailing, spacing: 3) {
          TextField(
            store.flight == nil ? String(localized: "Add a comment…") : "",
            text: $store.draft,
            axis: .vertical
          )
            .focused($isFocused)
            .font(.system(size: CommentComposerMetrics.textSize))
            .lineLimit(1...5)
            .textFieldStyle(.plain)
            .submitLabel(.send)
            .disabled(store.isSending)
            .accessibilityLabel(String(localized: "Add a comment…"))
            .onSubmit {
              guard store.canSend else { return }
              Task { await store.send() }
            }

          if store.characterCount >= 900 {
            Text("\(store.characterCount) / 1000")
              .font(.caption2.monospacedDigit())
              .foregroundStyle(store.characterCount > 1_000 ? .red : .secondary)
              .accessibilityLabel("\(store.characterCount) / 1000")
          }
        }
        .padding(.horizontal, CommentComposerMetrics.fieldHorizontalInset)
        .padding(.vertical, CommentComposerMetrics.fieldVerticalInset)

        Button {
          Task { await store.send() }
        } label: {
          ZStack {
            Circle()
              .fill(Color.accentColor)
            if store.flight == nil {
              Image(systemName: "arrow.up")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.white)
            }
          }
          .frame(
            width: CommentComposerMetrics.sendButtonSize,
            height: CommentComposerMetrics.sendButtonSize
          )
        }
        .buttonStyle(.plain)
        .disabled(!store.canSend)
        .opacity(store.canSend ? 1 : 0.38)
        .accessibilityLabel(String(localized: "Send"))
      }
      .padding(CommentComposerMetrics.chromeInset)
      .background {
        let shape = RoundedRectangle(cornerRadius: CommentComposerMetrics.cornerRadius, style: .continuous)
        shape.fill(Color(.secondarySystemFill))
        shape.strokeBorder(Color(.separator), lineWidth: 1 / displayScale)
      }
      .onGeometryChange(for: CGRect.self) { proxy in
        proxy.frame(in: .named(CommentsCoordinateSpace.root))
      } action: { frame in
        store.updateComposerFrame(frame)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 9)
    }
    .background(.bar)
    .onChange(of: store.replyCommentId) { _, next in
      if next != nil {
        isFocused = true
      }
    }
  }
}
