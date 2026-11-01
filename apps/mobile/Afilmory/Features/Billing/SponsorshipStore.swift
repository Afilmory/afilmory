import Combine
import StoreKit

@MainActor
final class SponsorshipStore: ObservableObject {
  enum State: Equatable {
    case idle
    case loading
    case ready
    case purchasing
    case pending
    case purchased
    case unavailable
  }

  enum PurchaseOutcome {
    case cancelled
    case failed
    case pending
    case purchased
  }

  static let productIdentifier = "app.afilmory.sponsor"

  @Published private(set) var product: Product?
  @Published private(set) var state: State = .idle

  var displayPrice: String? {
    product?.displayPrice
  }

  var canPurchase: Bool {
    state == .ready
  }

  func load() async {
    guard state != .loading, state != .purchasing else { return }

    state = .loading
    do {
      let products = try await Product.products(for: [Self.productIdentifier])
      guard let product = products.first(where: { $0.id == Self.productIdentifier }) else {
        self.product = nil
        state = .unavailable
        return
      }

      self.product = product
      state = await finishPendingSponsorships() ? .purchased : .ready
    } catch is CancellationError {
      state = .idle
    } catch {
      self.product = nil
      state = .unavailable
    }
  }

  func purchase() async -> PurchaseOutcome {
    guard let product, canPurchase else { return .failed }

    state = .purchasing
    do {
      switch try await product.purchase() {
      case .success(.verified(let transaction)):
        await transaction.finish()
        state = .purchased
        return .purchased
      case .success(.unverified(_, _)):
        state = .ready
        return .failed
      case .pending:
        state = .pending
        return .pending
      case .userCancelled:
        state = .ready
        return .cancelled
      @unknown default:
        state = .ready
        return .failed
      }
    } catch is CancellationError {
      state = .ready
      return .cancelled
    } catch {
      state = .ready
      return .failed
    }
  }

  func observeTransactionUpdates() async {
    for await result in Transaction.updates {
      guard !Task.isCancelled else { return }
      guard case .verified(let transaction) = result,
            transaction.productID == Self.productIdentifier
      else { continue }

      await transaction.finish()
      state = .purchased
    }
  }

  private func finishPendingSponsorships() async -> Bool {
    var didFinishSponsorship = false
    for await result in Transaction.unfinished {
      guard case .verified(let transaction) = result,
            transaction.productID == Self.productIdentifier
      else { continue }

      await transaction.finish()
      didFinishSponsorship = true
    }
    return didFinishSponsorship
  }
}
