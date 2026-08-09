import Foundation
import UIKit
import UserNotifications

enum APNsRegistrationEnvironment: String, Encodable, Sendable {
  case development
  case production

  static var current: APNsRegistrationEnvironment {
    #if DEBUG
      .development
    #else
      .production
    #endif
  }
}
func apnsDeviceTokenString(_ data: Data) -> String {
  data.map { String(format: "%02x", $0) }.joined()
}

private struct PushDeviceRegistrationPayload: Encodable, Sendable {
  let token: String
  let environment: APNsRegistrationEnvironment
  let locale: String?
  let appVersion: String?
}

private struct PushDeviceUnregistrationPayload: Encodable, Sendable {
  let token: String
}

private struct PushDeviceRegistrationResponse: Decodable, Sendable {
  let registered: Bool
}

@MainActor
final class APNsRegistrationCoordinator {
  static let shared = APNsRegistrationCoordinator()

  private nonisolated static let cachedTokenKey = "app.afilmory.apns.device-token"

  private var authorizationTask: Task<Void, Never>?
  private var registrationTask: Task<Void, Never>?
  private var sessionObservation: AfilmorySessionObservationToken?
  private var deviceToken: String?
  private var lastSuccessfulRegistration: String?
  private var started = false

  private init() {
    deviceToken = UserDefaults.standard.string(forKey: Self.cachedTokenKey)
  }

  func start() {
    guard AfilmoryBuildConfiguration.supportsPushNotifications else { return }
    guard !started else { return }
    started = true
    sessionObservation = AfilmorySessionStore.shared.observe { [weak self] state in
      Task { @MainActor in
        self?.handleSessionState(state)
      }
    }
    AfilmorySessionStore.shared.bootstrap()
    registerForRemoteNotificationsIfAuthorized()
  }

  func registerForRemoteNotificationsIfAuthorized() {
    guard AfilmoryBuildConfiguration.supportsPushNotifications else { return }
    authorizationTask?.cancel()
    authorizationTask = Task { @MainActor in
      let settings = await UNUserNotificationCenter.current().notificationSettings()
      guard !Task.isCancelled else { return }
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral:
        UIApplication.shared.registerForRemoteNotifications()
      case .notDetermined, .denied:
        break
      @unknown default:
        break
      }
    }
  }

  func didRegisterForRemoteNotifications(deviceToken data: Data) {
    let token = apnsDeviceTokenString(data)
    guard !token.isEmpty else { return }
    deviceToken = token
    UserDefaults.standard.set(token, forKey: Self.cachedTokenKey)
    synchronizeDeviceIfPossible()
  }

  func didFailToRegisterForRemoteNotifications(_ error: Error) {
    NSLog("[APNsRegistrationCoordinator] APNs registration failed: %@", error.localizedDescription)
  }

  nonisolated static func unregisterCurrentDevice(using snapshot: AfilmorySessionSnapshot) {
    guard AfilmoryBuildConfiguration.supportsPushNotifications else { return }
    guard let token = UserDefaults.standard.string(forKey: cachedTokenKey),
          !token.isEmpty,
          snapshot.cookie != nil,
          snapshot.platformBaseURL != nil
    else { return }

    Task {
      do {
        let body = try APIEndpoint.jsonBody(PushDeviceUnregistrationPayload(token: token))
        let endpoint = APIEndpoint(
          baseURL: .platform,
          path: "push-devices",
          method: .delete,
          body: body
        )
        let _: PushDeviceRegistrationResponse = try await AfilmoryAPI.shared.request(
          endpoint,
          using: snapshot
        )
      } catch {
        NSLog(
          "[APNsRegistrationCoordinator] Unable to unregister the APNs device: %@",
          error.localizedDescription
        )
      }
    }
  }

  private func handleSessionState(_ state: AfilmorySessionState) {
    switch state {
    case .signedIn:
      synchronizeDeviceIfPossible()
    case .signedOut:
      registrationTask?.cancel()
      registrationTask = nil
      lastSuccessfulRegistration = nil
    case .loading, .failed:
      break
    }
  }

  private func synchronizeDeviceIfPossible() {
    guard let token = deviceToken,
          case .signedIn(let session) = AfilmorySessionStore.shared.current().state
    else { return }

    let environment = APNsRegistrationEnvironment.current
    let registrationKey = "\(session.user.id):\(environment.rawValue):\(token)"
    guard lastSuccessfulRegistration != registrationKey else { return }

    registrationTask?.cancel()
    registrationTask = Task { @MainActor [weak self] in
      guard let self else { return }
      do {
        let payload = PushDeviceRegistrationPayload(
          token: token,
          environment: environment,
          locale: Locale.preferredLanguages.first,
          appVersion: Self.appVersion
        )
        let body = try APIEndpoint.jsonBody(payload)
        let endpoint = APIEndpoint(
          baseURL: .platform,
          path: "push-devices",
          method: .put,
          body: body
        )
        let response: PushDeviceRegistrationResponse = try await AfilmoryAPI.shared.request(endpoint)
        try Task.checkCancellation()
        guard response.registered else { return }
        lastSuccessfulRegistration = registrationKey
      } catch APIError.cancelled {
        return
      } catch {
        NSLog(
          "[APNsRegistrationCoordinator] Unable to synchronize the APNs device: %@",
          error.localizedDescription
        )
      }
    }
  }

  private static var appVersion: String? {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
    switch (version?.trimmingToNil, build?.trimmingToNil) {
    case let (.some(version), .some(build)):
      return "\(version) (\(build))"
    case let (.some(version), .none):
      return version
    case let (.none, .some(build)):
      return build
    case (.none, .none):
      return nil
    }
  }
}
