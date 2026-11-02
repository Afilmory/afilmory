import SwiftUI

struct CommentSignInView: View {
  let store: CommentsStore

  var body: some View {
    HStack(spacing: 12) {
      Text(store.requiresAuthentication
        ? String(localized: "Your session expired. Sign in again to continue.")
        : String(localized: "Sign in to leave a comment."))
        .font(.system(size: 14))
        .foregroundStyle(Color(AFColor.textSecondary))
        .frame(maxWidth: .infinity, alignment: .leading)
      Button(String(localized: "Sign in")) {
        store.requestSignIn()
      }
      .buttonStyle(.afPill(.primary, height: 36))
    }
    .padding(.horizontal, 22)
    .padding(.vertical, 12)
    .background(Color(AFColor.sheet))
  }
}
