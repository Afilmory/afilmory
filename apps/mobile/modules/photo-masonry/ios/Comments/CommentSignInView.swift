import SwiftUI

struct CommentSignInView: View {
  let store: CommentsStore

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: "person.crop.circle")
        .font(.title3)
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      Text(store.requiresAuthentication
        ? String(localized: "Your session expired. Sign in again to continue.")
        : String(localized: "Sign in to leave a comment."))
        .font(.footnote)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
      Button(String(localized: "Sign in")) {
        store.requestSignIn()
      }
      .buttonStyle(.borderedProminent)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
    .background(.bar)
  }
}
