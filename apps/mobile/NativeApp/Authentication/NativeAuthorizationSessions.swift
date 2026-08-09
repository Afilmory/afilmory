@preconcurrency import AuthenticationServices
import Foundation
import Security
import UIKit

@MainActor
final class NativeAuthorizationSessions: NSObject {
  static let shared = NativeAuthorizationSessions()

  private var appleContinuation: CheckedContinuation<AppleAuthorizationResult, Error>?
  private var appleController: ASAuthorizationController?
  private var appleNonce: String?
  private var appleState: String?
  private var anchor: ASPresentationAnchor?
  private var webContinuation: CheckedContinuation<URL, Error>?
  private var webSession: ASWebAuthenticationSession?

  func requestAppleAuthorization(anchor: ASPresentationAnchor) async throws -> AppleAuthorizationResult {
    guard AfilmoryBuildConfiguration.supportsAppleAuthentication else {
      throw NativeAuthError.unavailable
    }
    guard appleContinuation == nil else {
      throw NativeAuthError.server("Another Apple authentication request is already active.")
    }

    let nonce = try Self.randomNonce()
    let state = UUID().uuidString
    let request = ASAuthorizationAppleIDProvider().createRequest()
    request.requestedScopes = [.fullName, .email]
    request.nonce = nonce
    request.state = state

    self.anchor = anchor
    appleNonce = nonce
    appleState = state

    return try await withCheckedThrowingContinuation { continuation in
      appleContinuation = continuation
      let controller = ASAuthorizationController(authorizationRequests: [request])
      appleController = controller
      controller.delegate = self
      controller.presentationContextProvider = self
      controller.performRequests()
    }
  }

  func openWebAuthentication(
    url: URL,
    callbackScheme: String,
    anchor: ASPresentationAnchor
  ) async throws -> URL {
    guard webContinuation == nil else {
      throw NativeAuthError.server("Another web authentication request is already active.")
    }
    self.anchor = anchor

    return try await withCheckedThrowingContinuation { continuation in
      webContinuation = continuation
      let session = ASWebAuthenticationSession(
        url: url,
        callbackURLScheme: callbackScheme
      ) { [weak self] callbackURL, error in
        Task { @MainActor in
          guard let self else { return }
          defer { self.finishWebSession() }
          if let callbackURL {
            self.webContinuation?.resume(returning: callbackURL)
            return
          }
          if let authenticationError = error as? ASWebAuthenticationSessionError,
             authenticationError.code == .canceledLogin
          {
            self.webContinuation?.resume(throwing: NativeAuthError.cancelled)
            return
          }
          self.webContinuation?.resume(throwing: error ?? NativeAuthError.invalidResponse)
        }
      }
      webSession = session
      session.presentationContextProvider = self
      session.prefersEphemeralWebBrowserSession = false
      guard session.start() else {
        webContinuation = nil
        webSession = nil
        continuation.resume(throwing: NativeAuthError.unavailable)
        return
      }
    }
  }

  func makeOAuthState() throws -> String {
    let data = Data(try Self.randomBytes(count: 32))
    return data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  private func finishAppleSession() {
    appleContinuation = nil
    appleController = nil
    appleNonce = nil
    appleState = nil
    anchor = nil
  }

  private func finishWebSession() {
    webContinuation = nil
    webSession = nil
    anchor = nil
  }

  private static func randomNonce() throws -> String {
    try randomBytes(count: 32).map { String(format: "%02x", $0) }.joined()
  }

  private static func randomBytes(count: Int) throws -> [UInt8] {
    var bytes = [UInt8](repeating: 0, count: count)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
      throw NativeAuthError.unavailable
    }
    return bytes
  }
}

extension NativeAuthorizationSessions: ASAuthorizationControllerDelegate {
  nonisolated func authorizationController(
    controller _: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    Task { @MainActor in
      guard let continuation = appleContinuation,
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            credential.state == appleState,
            let nonce = appleNonce,
            let identityTokenData = credential.identityToken,
            let authorizationCodeData = credential.authorizationCode,
            let identityToken = String(data: identityTokenData, encoding: .utf8),
            let authorizationCode = String(data: authorizationCodeData, encoding: .utf8)
      else {
        appleContinuation?.resume(throwing: NativeAuthError.invalidResponse)
        finishAppleSession()
        return
      }

      continuation.resume(
        returning: AppleAuthorizationResult(
          authorizationCode: authorizationCode,
          email: credential.email,
          identityToken: identityToken,
          firstName: credential.fullName?.givenName,
          lastName: credential.fullName?.familyName,
          nonce: nonce
        )
      )
      finishAppleSession()
    }
  }

  nonisolated func authorizationController(
    controller _: ASAuthorizationController,
    didCompleteWithError error: Error
  ) {
    Task { @MainActor in
      if let authorizationError = error as? ASAuthorizationError,
         authorizationError.code == .canceled
      {
        appleContinuation?.resume(throwing: NativeAuthError.cancelled)
      } else {
        appleContinuation?.resume(throwing: error)
      }
      finishAppleSession()
    }
  }
}

extension NativeAuthorizationSessions: ASAuthorizationControllerPresentationContextProviding,
  ASWebAuthenticationPresentationContextProviding
{
  nonisolated func presentationAnchor(for _: ASAuthorizationController) -> ASPresentationAnchor {
    MainActor.assumeIsolated { anchor ?? ASPresentationAnchor() }
  }

  nonisolated func presentationAnchor(for _: ASWebAuthenticationSession) -> ASPresentationAnchor {
    MainActor.assumeIsolated { anchor ?? ASPresentationAnchor() }
  }
}

@MainActor
extension UIApplication {
  var afilmoryPresentationAnchor: ASPresentationAnchor? {
    connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow }
  }
}
