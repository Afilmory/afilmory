enum StoreKitBillingFinishGate {
  static func allowsFinish(isVerified: Bool, serverAcknowledged: Bool) -> Bool {
    isVerified && serverAcknowledged
  }
}
