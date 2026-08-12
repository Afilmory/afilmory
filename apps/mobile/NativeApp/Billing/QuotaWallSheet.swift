import SwiftUI

struct QuotaWallSheet: View {
  @Environment(\.dismiss) private var dismiss
  @ObservedObject private var entitlements = EntitlementStore.shared
  @State private var showingPlan = false

  let reason: QuotaWallReason

  var body: some View {
    VStack(spacing: 14) {
      VStack(spacing: 9) {
        Image(systemName: "exclamationmark.circle.fill")
          .font(.system(size: 34))
          .foregroundStyle(.red)
        Text(reason.title)
          .font(.system(size: 19, weight: .semibold))
          .multilineTextAlignment(.center)
        Text(reason.explanation)
          .font(.system(size: 13.5))
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
      .padding(.top, 8)

      if !reason.readout.isEmpty {
        VStack(spacing: 6) {
          ForEach(reason.readout, id: \.label) { line in
            HStack {
              Text(line.label).foregroundStyle(.secondary)
              Spacer()
              Text(line.value).monospacedDigit()
            }
            .font(.system(size: 13))
          }
        }
        .padding(14)
        .background(Color(uiColor: .systemGroupedBackground))
        .clipShape(.rect(cornerRadius: 10, style: .continuous))
      }

      if entitlements.isAvailable {
        Button {
          showingPlan = true
        } label: {
          Text("Upgrade")
            .font(.system(size: 16, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: 48)
        }
        .buttonStyle(.borderedProminent)
      } else {
        Text("Ask the workspace owner to upgrade this plan.")
          .font(.system(size: 13))
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }

      Button(reason.secondaryActionTitle) { dismiss() }
        .font(.system(size: 15))
    }
    .padding(22)
    .presentationDetents([.medium])
    .sheet(isPresented: $showingPlan) {
      SubscriptionView(focus: reason)
    }
  }
}
