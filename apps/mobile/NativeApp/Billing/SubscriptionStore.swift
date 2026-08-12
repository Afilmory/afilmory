import Combine
import Foundation
import StoreKit

enum OfferFamily {
  case plan
  case storage

  func filter(_ offers: [BillingOffer]) -> [BillingOffer] {
    switch self {
    case .plan: offers.filter { $0.applicationPlanId != nil }
    case .storage: offers.filter { $0.storagePlanId != nil }
    }
  }
}

@MainActor
final class SubscriptionStore: ObservableObject {
  enum State: Equatable {
    case idle
    case loading
    case ready
    case unavailable
    case unconfigured
  }

  struct PurchasableOffer: Identifiable, Equatable {
    let displayPrice: String?
    let offer: BillingOffer
    let product: Product?

    var id: String { offer.id }
  }

  @Published private(set) var hasUnlinkablePurchase = false
  @Published private(set) var offers: [PurchasableOffer] = []
  @Published private(set) var purchasingOfferId: String?
  @Published private(set) var restoring = false
  @Published private(set) var state: State = .idle

  private let service: AppStoreBillingService

  init(service: AppStoreBillingService = .shared) {
    self.service = service
  }

  var isBusy: Bool {
    purchasingOfferId != nil || restoring
  }

  func load() async {
    guard state != .loading else { return }
    state = .loading
    do {
      let response = try await AppStoreBillingAPI.offers()
      guard response.configured else {
        offers = []
        state = .unconfigured
        return
      }
      let products = try await service.loadProducts(for: response.offers.map(\.externalProductId))
      offers = response.offers.map { offer in
        let product = products[offer.externalProductId]
        return PurchasableOffer(displayPrice: product?.displayPrice, offer: offer, product: product)
      }
      state = offers.contains { $0.product != nil } ? .ready : .unavailable
    } catch {
      offers = []
      state = .unavailable
    }
  }

  func purchase(_ offer: BillingOffer) async -> Result<AppStorePurchaseOutcome, Error> {
    guard purchasingOfferId == nil else { return .success(.cancelled) }
    purchasingOfferId = offer.id
    defer { purchasingOfferId = nil }
    do {
      let outcome = try await service.purchase(
        offerId: offer.id,
        knownProductIds: offers.map(\.offer.externalProductId)
      )
      if outcome == .completed {
        await load()
      }
      return .success(outcome)
    } catch {
      return .failure(error)
    }
  }

  func restore() async -> Result<Int, Error> {
    guard !restoring else { return .success(0) }
    restoring = true
    defer { restoring = false }
    do {
      let restored = try await service.restore(productIds: offers.map(\.offer.externalProductId))
      if restored > 0 {
        await load()
      }
      return .success(restored)
    } catch {
      return .failure(error)
    }
  }

  func manageSubscriptions() async {
    try? await service.showManageSubscriptions()
  }

  func observeTransactionUpdates() async {
    await service.observeTransactionUpdates()
  }

  func reconcileUnfinishedTransactions() async {
    hasUnlinkablePurchase = await service.reconcileUnfinishedTransactions().unlinkable > 0
  }
}
