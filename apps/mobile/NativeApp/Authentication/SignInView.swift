import SwiftUI

private let appName = "Afilmory"

private enum SignInBusyAction: Equatable {
  case apple
  case github
  case google
  case password
}

enum NativeAuthFailureMessage {
  static func text(for error: Error) -> String {
    let fallback = String(localized: "Unable to sign in. Please try again.")
    let reason = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !reason.isEmpty,
          reason.caseInsensitiveCompare(fallback) != .orderedSame
    else { return fallback }
    return reason
  }
}

struct SignInView: View {
  @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
  @Environment(\.dismiss) private var dismiss
  @FocusState private var focusedField: Field?
  @State private var busyAction: SignInBusyAction?
  @State private var email = ""
  @State private var error: String?
  @State private var password = ""
  @State private var showPasswordForm = false

  private enum Field {
    case email
    case password
  }

  private let authentication = NativeAuthenticationService.shared
  private let showsCloseButton: Bool

  private static let passwordFormAnimation = Animation.timingCurve(
    0.22,
    1,
    0.36,
    1,
    duration: 0.28
  )

  init(showsCloseButton: Bool = false) {
    self.showsCloseButton = showsCloseButton
  }

  var body: some View {
    VStack(spacing: 0) {
      SignInShowcaseView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .overlay(alignment: .bottom) {
          LinearGradient(
            colors: [.clear, Color(uiColor: .systemBackground)],
            startPoint: .top,
            endPoint: .bottom
          )
          .frame(height: 96)
        }

      signInContent
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 28)
        .background(Color(uiColor: .systemBackground))
        .fixedSize(horizontal: false, vertical: true)
    }
    .background(Color(uiColor: .systemBackground).ignoresSafeArea())
    .overlay(alignment: .topTrailing) {
      if showsCloseButton {
        Button(action: dismiss.callAsFunction) {
          Image(systemName: "xmark")
            .font(.system(size: 14, weight: .bold))
            .frame(width: 36, height: 36)
            .background(.ultraThinMaterial, in: Circle())
            .overlay {
              Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
          String(localized: "Close \(appName)")
        )
        .padding(16)
      }
    }
  }

  private var signInContent: some View {
    VStack(alignment: .leading, spacing: 0) {
      AfilmoryBrandIcon()
        .frame(width: 36, height: 36)
        .padding(.bottom, 12)
      Text("Afilmory")
        .font(.system(size: 22, weight: .bold))
        .tracking(-0.35)
      Text("Sign in with the account that owns your gallery.")
        .font(.system(size: 14))
        .foregroundStyle(.secondary)
        .padding(.top, 4)
        .padding(.bottom, 20)

      VStack(spacing: 10) {
        if AfilmoryBuildConfiguration.supportsAppleAuthentication {
          ZStack {
            NativeAppleAuthorizationButton(type: .continue) {
              perform(.apple) {
                guard let anchor = UIApplication.shared.afilmoryPresentationAnchor else {
                  throw NativeAuthError.unavailable
                }
                try await authentication.signInWithApple(anchor: anchor)
              }
            }
            .opacity(busyAction == nil || busyAction == .apple ? 1 : 0.45)
            .allowsHitTesting(busyAction == nil)
            if busyAction == .apple {
              RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.white)
              ProgressView().tint(.black)
            }
          }
          .frame(height: 44)
          .accessibilityLabel(String(localized: "Continue with Apple"))
          .accessibilityIdentifier("auth.apple")
        }

        providerButton(
          action: .github,
          title: String(localized: "Continue with GitHub"),
          symbol: nil
        )
        providerButton(
          action: .google,
          title: String(localized: "Continue with Google"),
          symbol: "google-g"
        )

        Button {
          togglePasswordForm()
        } label: {
          Text(showPasswordForm ? String(localized: "Hide email sign-in") : String(localized: "Sign in with email"))
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, minHeight: 32)
        }
        .buttonStyle(.plain)
        .disabled(busyAction != nil)
        .accessibilityIdentifier("auth.email.toggle")

        if showPasswordForm {
          passwordForm
            .transition(passwordFormTransition)
        }

        if let error {
          Text(error)
            .font(.system(size: 13))
            .foregroundStyle(.red)
            .multilineTextAlignment(.center)
            .lineSpacing(3)
            .frame(maxWidth: .infinity, minHeight: 44)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isStaticText)
            .accessibilityIdentifier("auth.error")
        } else {
          Color.clear.frame(height: 44)
        }
      }
    }
  }

  private func providerButton(
    action: SignInBusyAction,
    title: String,
    symbol: String?
  ) -> some View {
    Button {
      perform(action) {
        guard let anchor = UIApplication.shared.afilmoryPresentationAnchor else {
          throw NativeAuthError.unavailable
        }
        let provider: NativeAuthProvider = action == .github ? .github : .google
        try await authentication.signIn(with: provider, anchor: anchor)
      }
    } label: {
      HStack(spacing: 10) {
        if busyAction == action {
          ProgressView()
        } else {
          if action == .github {
            GitHubMark()
              .frame(width: 18, height: 18)
          } else {
            if let symbol,
               let path = Bundle.main.path(forResource: symbol, ofType: "png"),
               let image = UIImage(contentsOfFile: path)
            {
              Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(width: 18, height: 18)
            }
          }
          Text(title)
            .font(.system(size: 15, weight: .semibold))
            .lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, minHeight: 44)
      .background(Color(red: 44 / 255, green: 44 / 255, blue: 46 / 255))
      .clipShape(.rect(cornerRadius: 22, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .stroke(Color(red: 84 / 255, green: 84 / 255, blue: 88 / 255).opacity(0.52), lineWidth: 0.5)
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(busyAction != nil)
    .opacity(busyAction == nil || busyAction == action ? 1 : 0.45)
    .accessibilityIdentifier(action == .github ? "auth.github" : "auth.google")
  }

  private var passwordForm: some View {
    VStack(spacing: 10) {
      TextField(String(localized: "Email"), text: $email)
        .textContentType(.username)
        .keyboardType(.emailAddress)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .accessibilityLabel(String(localized: "Email"))
        .accessibilityIdentifier("auth.email")
        .submitLabel(.next)
        .focused($focusedField, equals: .email)
        .onSubmit { focusedField = .password }
        .afilmoryFormField()
      SecureField(String(localized: "Password"), text: $password)
        .textContentType(.password)
        .accessibilityLabel(String(localized: "Password"))
        .accessibilityIdentifier("auth.password")
        .submitLabel(.go)
        .focused($focusedField, equals: .password)
        .onSubmit(submitPassword)
        .afilmoryFormField()
      Button(action: submitPassword) {
        Group {
          if busyAction == .password {
            ProgressView()
          } else {
            Text("Sign in")
              .font(.system(size: 15, weight: .bold))
          }
        }
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(Color(red: 0, green: 123 / 255, blue: 1))
        .clipShape(.rect(cornerRadius: 22, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(busyAction != nil)
      Text("Email sign-in is available for invited and App Review accounts. New public accounts use a social provider.")
        .font(.system(size: 12))
        .foregroundStyle(.tertiary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
    }
  }

  private var passwordFormTransition: AnyTransition {
    guard !accessibilityReduceMotion else { return .identity }
    return .move(edge: .bottom).combined(with: .opacity)
  }

  private func togglePasswordForm() {
    error = nil
    guard !accessibilityReduceMotion else {
      var transaction = Transaction()
      transaction.disablesAnimations = true
      withTransaction(transaction) {
        showPasswordForm.toggle()
      }
      return
    }
    withAnimation(Self.passwordFormAnimation) {
      showPasswordForm.toggle()
    }
  }

  private func submitPassword() {
    let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedEmail.isEmpty, !password.isEmpty else {
      error = String(localized: "Enter both email and password.")
      return
    }
    perform(.password) {
      try await authentication.signInWithPassword(email: normalizedEmail, password: password)
    }
  }

  private func perform(
    _ action: SignInBusyAction,
    operation: @escaping @MainActor () async throws -> Void
  ) {
    guard busyAction == nil else { return }
    busyAction = action
    error = nil
    Task { @MainActor in
      defer { busyAction = nil }
      do {
        try await operation()
        dismiss()
      } catch NativeAuthError.cancelled {
        return
      } catch {
        self.error = NativeAuthFailureMessage.text(for: error)
      }
    }
  }
}

private extension View {
  func afilmoryFormField() -> some View {
    padding(.horizontal, 14)
      .frame(height: 44)
      .background(Color(uiColor: .secondarySystemBackground))
      .clipShape(.rect(cornerRadius: 12, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .stroke(Color(uiColor: .separator), lineWidth: 0.5)
      }
  }
}
