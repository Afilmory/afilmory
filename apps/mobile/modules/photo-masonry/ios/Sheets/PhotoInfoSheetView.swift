import SwiftUI

struct PhotoInfoInspectorView: View {
  let info: PhotoInfoSheetModel
  var showsHeader = true
  var bottomContentInset: CGFloat = 0
  let onClose: () -> Void

  @ViewBuilder
  var body: some View {
    if showsHeader {
      if #available(iOS 26.0, *) {
        PhotoInfoSectionsList(info: info)
          .safeAreaBar(edge: .top, spacing: 0) {
            header
          }
          .scrollEdgeEffectStyle(.soft, for: .top)
      } else {
        PhotoInfoSectionsList(info: info)
          .safeAreaInset(edge: .top, spacing: 0) {
            header
              .background(.bar)
          }
      }
    } else {
      PhotoInfoSectionsList(info: info, bottomContentInset: bottomContentInset)
    }
  }

  private var header: some View {
    HStack(spacing: 12) {
      Text("Info")
        .font(.headline)
      Spacer()
      Button(action: onClose) {
        Image(systemName: "xmark")
          .font(.body.weight(.semibold))
          .frame(width: 28, height: 28)
          .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(String(localized: "Done"))
    }
    .padding(.horizontal, 16)
    .frame(height: 52)
  }
}
