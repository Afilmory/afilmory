import SwiftUI
import UIKit

@MainActor
final class StudioDomainViewModel: ObservableObject {
  @Published private(set) var listing: StudioDomainListing?
  @Published var domainInput = ""
  @Published private(set) var loading = false
  @Published private(set) var mutating = false
  @Published private(set) var verifyingID: String?
  @Published private(set) var deletingID: String?
  @Published var error: Error?
  @Published var actionMessage: String?
  @Published var quotaReason: QuotaWallReason?

  var pendingDomain: StudioTenantDomain? {
    listing?.domains.first { $0.status == .pending }
  }

  func load() async {
    if listing == nil { loading = true }
    defer { loading = false }
    do {
      listing = try await NativeStudioAPI.tenantDomains()
      error = nil
    } catch is CancellationError {
      return
    } catch {
      self.error = error
    }
  }

  func add() async {
    guard let listing, !mutating else { return }
    switch StudioDomainPolicy.addDecision(for: domainInput, listing: listing) {
    case .empty:
      actionMessage = String(localized: "Please enter a domain before binding.")
    case .invalid:
      actionMessage = String(localized: "Enter a valid domain such as photos.example.com.")
    case .upgrade(let reason):
      quotaReason = reason
    case .request(let host):
      await mutate {
        _ = try await NativeStudioAPI.requestDomain(host)
        domainInput = ""
      }
    }
  }

  func verify(_ domain: StudioTenantDomain) async {
    guard domain.canVerify, verifyingID == nil else { return }
    verifyingID = domain.id
    defer { verifyingID = nil }
    await mutate {
      _ = try await NativeStudioAPI.verifyDomain(id: domain.id)
    }
  }

  func delete(_ domain: StudioTenantDomain) async {
    guard deletingID == nil else { return }
    deletingID = domain.id
    defer { deletingID = nil }
    await mutate {
      try await NativeStudioAPI.deleteDomain(id: domain.id)
    }
  }

  private func mutate(_ work: () async throws -> Void) async {
    mutating = true
    defer { mutating = false }
    do {
      try await work()
      await load()
    } catch let error as APIError {
      if let reason = QuotaWallReason.parse(apiError: error) {
        quotaReason = reason
      } else {
        actionMessage = error.localizedDescription
      }
    } catch is CancellationError {
      return
    } catch {
      actionMessage = error.localizedDescription
    }
  }
}
