import SwiftUI

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

enum SignInPresentation {
  case intro
  case standalone

  var showsClose: Bool { self == .standalone }
  var showsDots: Bool { self == .intro }
  var showsGuestLink: Bool { self == .intro }
}

enum SignInGate {
  enum Action: CaseIterable {
    case apple
    case github
    case google
    case password
  }

  static func blockReason(for _: Action, busy: Bool) -> String? {
    busy ? "" : nil
  }
}

@MainActor
@Observable
final class SignInState {
  var busy: SignInGate.Action?
  var error: String?

  private let authentication = NativeAuthenticationService.shared

  func perform(
    _ action: SignInGate.Action,
    onSuccess: @escaping @MainActor @Sendable () -> Void,
    operation: @escaping @MainActor () async throws -> Void
  ) {
    if let reason = SignInGate.blockReason(for: action, busy: busy != nil) {
      if !reason.isEmpty { error = reason }
      return
    }
    busy = action
    error = nil
    Task { @MainActor in
      defer { busy = nil }
      do {
        try await operation()
        onSuccess()
      } catch NativeAuthError.cancelled {
        return
      } catch {
        self.error = NativeAuthFailureMessage.text(for: error)
      }
    }
  }

  func signIn(with provider: SignInGate.Action, onSuccess: @escaping @MainActor @Sendable () -> Void) {
    perform(provider, onSuccess: onSuccess) { [authentication] in
      guard let anchor = UIApplication.shared.afilmoryPresentationAnchor else {
        throw NativeAuthError.unavailable
      }
      switch provider {
      case .apple:
        try await authentication.signInWithApple(anchor: anchor)
      case .github:
        try await authentication.signIn(with: .github, anchor: anchor)
      case .google:
        try await authentication.signIn(with: .google, anchor: anchor)
      case .password:
        break
      }
    }
  }

  func signInWithPassword(email: String, password: String, onSuccess: @escaping @MainActor @Sendable () -> Void) {
    let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedEmail.isEmpty, !password.isEmpty else {
      error = String(localized: "Enter both email and password.")
      return
    }
    perform(.password, onSuccess: onSuccess) { [authentication] in
      try await authentication.signInWithPassword(email: normalizedEmail, password: password)
    }
  }
}

struct SignInPanel: View {
  let presentation: SignInPresentation
  let state: SignInState
  let onSignedIn: @MainActor @Sendable () -> Void
  let onGuest: () -> Void

  var body: some View {
    @Bindable var state = state
    VStack(spacing: 10) {
      if AfilmoryBuildConfiguration.supportsAppleAuthentication {
        ZStack {
          NativeAppleAuthorizationButton(type: .continue, cornerRadius: 26) {
            state.signIn(with: .apple, onSuccess: onSignedIn)
          }
          if state.busy == .apple {
            Capsule().fill(.white)
            ProgressView().tint(.black)
          }
        }
        .frame(height: 52)
        .accessibilityLabel(String(localized: "Continue with Apple"))
        .accessibilityIdentifier("auth.apple")
      }

      HStack(spacing: 10) {
        providerButton(.github, title: "GitHub") {
          GitHubMark().frame(width: 18, height: 18)
        }
        providerButton(.google, title: "Google") {
          if let path = Bundle.main.path(forResource: "google-g", ofType: "png"),
             let image = UIImage(contentsOfFile: path)
          {
            Image(uiImage: image).resizable().scaledToFit().frame(width: 18, height: 18)
          }
        }
      }

      Button(String(localized: "Sign in with email")) {
        if let reason = SignInGate.blockReason(for: .password, busy: state.busy != nil) {
          if !reason.isEmpty { state.error = reason }
          return
        }
        EmailSignInPresenter.present(state: state, onSignedIn: onSignedIn)
      }
      .buttonStyle(.afText)
      .accessibilityIdentifier("auth.email.toggle")

      legalAgreement

      if let error = state.error {
        Text(error)
          .font(.system(size: 13))
          .foregroundStyle(Color(AFColor.destructive))
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityIdentifier("auth.error")
      }

      if presentation.showsGuestLink {
        Button(action: onGuest) {
          HStack(spacing: 6) {
            Text(String(localized: "Browse other galleries first"))
            Image(systemName: "arrow.right").font(.system(size: 13, weight: .semibold))
          }
          .font(.system(size: 16, weight: .semibold))
        }
        .buttonStyle(AFTextButtonStyle(color: AFColor.textPrimary))
        .padding(.top, 2)
      }
    }
  }

  private func providerButton(
    _ action: SignInGate.Action,
    title: String,
    @ViewBuilder icon: () -> some View
  ) -> some View {
    Button {
      state.signIn(with: action, onSuccess: onSignedIn)
    } label: {
      HStack(spacing: 8) {
        if state.busy == action {
          ProgressView().tint(Color(AFColor.textPrimary))
        } else {
          icon()
          Text(title)
        }
      }
    }
    .buttonStyle(.afOutline)
    .accessibilityIdentifier(action == .github ? "auth.github" : "auth.google")
  }

  static var consentFootnote: String {
    String(localized: "By continuing, you agree to Afilmory's Terms of Use and Privacy Policy.")
  }

  private var legalAgreement: some View {
    VStack(spacing: 4) {
      Text(Self.consentFootnote)
        .font(.system(size: 12))
        .foregroundStyle(Color(AFColor.textTertiary))
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 12) {
        Link(String(localized: "Terms of Use"), destination: URL(string: "https://afilmory.art/terms/")!)
        Link(String(localized: "Privacy Policy"), destination: URL(string: "https://afilmory.art/privacy/")!)
      }
      .font(.system(size: 12, weight: .semibold))
      .foregroundStyle(Color(AFColor.textSecondary))
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 2)
  }
}

struct EmailSignInSheet: View {
  let state: SignInState
  let onSignedIn: @MainActor @Sendable () -> Void

  @FocusState private var focused: Field?
  @State private var email = ""
  @State private var password = ""

  private enum Field {
    case email
    case password
  }

  var body: some View {
    VStack(spacing: 10) {
      TextField(String(localized: "Email"), text: $email)
        .textContentType(.username)
        .keyboardType(.emailAddress)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .accessibilityIdentifier("auth.email")
        .submitLabel(.next)
        .focused($focused, equals: .email)
        .onSubmit { focused = .password }
        .afSheetField()
      SecureField(String(localized: "Password"), text: $password)
        .textContentType(.password)
        .accessibilityIdentifier("auth.password")
        .submitLabel(.go)
        .focused($focused, equals: .password)
        .onSubmit(submit)
        .afSheetField()
      if let error = state.error {
        Text(error)
          .font(.system(size: 13))
          .foregroundStyle(Color(AFColor.destructive))
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      Button(action: submit) {
        if state.busy == .password {
          ProgressView().tint(Color(AFColor.onLight))
        } else {
          Text("Sign in")
        }
      }
      .buttonStyle(.afPrimary)
      .padding(.top, 4)
      Text("Email sign-in is available for invited and App Review accounts. New public accounts use a social provider.")
        .font(.system(size: 12))
        .foregroundStyle(Color(AFColor.textTertiary))
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
    }
    .padding(.horizontal, 22)
    .padding(.bottom, 24)
    .onAppear { focused = .email }
  }

  private func submit() {
    state.signInWithPassword(email: email, password: password, onSuccess: onSignedIn)
  }
}

@MainActor
enum EmailSignInPresenter {
  static func present(state: SignInState, onSignedIn: @escaping @MainActor @Sendable () -> Void) {
    weak var sheet: AFSheetController?
    let view = EmailSignInSheet(state: state) {
      sheet?.dismiss(animated: true) { onSignedIn() }
    }
    let controller = AFSheetController(title: String(localized: "Sign in with email"), detent: .fit, rootView: view)
    sheet = controller
    AFSheetController.topPresenter()?.present(controller, animated: true)
  }
}

extension View {
  func afSheetField() -> some View {
    font(.system(size: 16))
      .foregroundStyle(Color(AFColor.textPrimary))
      .padding(.horizontal, 16)
      .frame(height: 50)
      .background(Color(AFColor.fill), in: .rect(cornerRadius: 16, style: .continuous))
  }
}
