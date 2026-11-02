import SwiftUI
import UIKit

struct QuotaWallSheet: View {
  @ObservedObject private var entitlements = EntitlementStore.shared

  let reason: QuotaWallReason
  let onClose: () -> Void
  let onUpgrade: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text(reason.explanation)
        .font(.system(size: 15))
        .foregroundStyle(Color(AFColor.textSecondary))
        .fixedSize(horizontal: false, vertical: true)

      if !reason.readout.isEmpty || reason.meter != nil {
        VStack(spacing: 8) {
          if let meter = reason.meter {
            QuotaMeterView(meter: meter, accent: Color(AFColor.accentFallback))
              .padding(.bottom, 8)
          }
          ForEach(reason.readout, id: \.label) { line in
            HStack {
              Text(line.label).foregroundStyle(Color(AFColor.textTertiary))
              Spacer()
              Text(line.value).foregroundStyle(Color(AFColor.textPrimary))
            }
            .font(Font(AFFont.mono(size: 13)))
          }
        }
        .padding(16)
        .background(Color(AFColor.raised), in: .rect(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color(AFColor.fill), lineWidth: 1))
      }

      VStack(spacing: 4) {
        if entitlements.isAvailable {
          Button(String(localized: "Upgrade"), action: onUpgrade)
            .buttonStyle(.afPrimary)
        } else {
          Text("Ask the workspace owner to upgrade this plan.")
            .font(.system(size: 13))
            .foregroundStyle(Color(AFColor.textTertiary))
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
        }
        Button(reason.secondaryActionTitle, action: onClose)
          .buttonStyle(.afText)
          .frame(maxWidth: .infinity)
      }
      .padding(.top, 4)
    }
    .padding(.horizontal, 22)
    .padding(.bottom, 24)
  }
}

@MainActor
enum QuotaWallPresenter {
  static func make(reason: QuotaWallReason, onDismiss: (() -> Void)? = nil) -> AFSheetController {
    weak var sheet: AFSheetController?
    let view = QuotaWallSheet(
      reason: reason,
      onClose: { sheet?.dismiss(animated: true, completion: onDismiss) },
      onUpgrade: {
        sheet?.dismiss(animated: true) {
          onDismiss?()
          AppNavigator.shared.presentSubscription(focus: reason)
        }
      }
    )
    let controller = AFSheetController(title: reason.title, detent: .fit, rootView: view)
    controller.closeAction = { sheet?.dismiss(animated: true, completion: onDismiss) }
    sheet = controller
    return controller
  }

  static func present(reason: QuotaWallReason, onDismiss: (() -> Void)? = nil) {
    AFSheetController.topPresenter()?.present(make(reason: reason, onDismiss: onDismiss), animated: true)
  }
}
