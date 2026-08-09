import Photos
import SwiftUI

struct UploadReviewItem: Identifiable, Equatable {
  let id: String
  let isLivePhoto: Bool
}

enum UploadReviewOutcome {
  case cancel
  case start(itemIds: [String], tags: [String])
  // Re-picking lives in JS so the native sheet never owns a second
  // presentation: it hands back its current state, JS merges the new assets
  // and re-presents.
  case addMore(itemIds: [String], tags: [String])
}

struct UploadReviewSheetView: View {
  let suggestedTags: [String]
  @State private var items: [UploadReviewItem]
  @State private var tags: [String]
  @State private var draft = ""
  @FocusState private var draftFocused: Bool

  private let onFinish: (UploadReviewOutcome) -> Void
  private let columns = [GridItem(.adaptive(minimum: 96), spacing: 8)]

  init(
    items: [UploadReviewItem],
    initialTags: [String],
    suggestedTags: [String],
    onFinish: @escaping (UploadReviewOutcome) -> Void
  ) {
    self._items = State(initialValue: items)
    self._tags = State(initialValue: initialTags)
    self.suggestedTags = suggestedTags
    self.onFinish = onFinish
  }

  private var availableSuggestions: [String] {
    suggestedTags.filter { !tags.contains($0) }
  }

  var body: some View {
    VStack(spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          Text("\(items.count) items")
            .font(.subheadline)
            .foregroundStyle(.secondary)

          LazyVGrid(columns: columns, spacing: 8) {
            ForEach(items) { item in
              UploadReviewThumbnail(
                item: item,
                removeLabel: String(localized: "Remove"),
                onRemove: { remove(item) }
              )
            }
            addMoreCell
          }

          tagSection
        }
        .padding(20)
      }

      Divider()

      HStack(spacing: 12) {
        Button(String(localized: "Cancel")) { onFinish(.cancel) }
          .uploadReviewSecondaryButtonStyle()
          .controlSize(.large)

        Button {
          onFinish(.start(itemIds: items.map(\.id), tags: tags))
        } label: {
          Text("Upload \(items.count)").frame(maxWidth: .infinity)
        }
        .uploadReviewPrimaryButtonStyle()
        .controlSize(.large)
        .disabled(items.isEmpty)
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 12)
    }
    .background(Color(.systemGroupedBackground))
  }

  private var addMoreCell: some View {
    Button {
      onFinish(.addMore(itemIds: items.map(\.id), tags: tags))
    } label: {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(Color(.secondarySystemGroupedBackground))
        .aspectRatio(1, contentMode: .fill)
        .overlay(
          Image(systemName: "plus")
            .font(.system(size: 22, weight: .medium))
            .foregroundStyle(.secondary)
        )
    }
    .accessibilityLabel(String(localized: "Add more"))
  }

  private var tagSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("TAGS — THESE BECOME THE FOLDER")
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.tertiary)
        .textCase(.uppercase)

      if !tags.isEmpty {
        UploadReviewChipRow(labels: tags, isSelected: true) { tag in
          tags.removeAll { $0 == tag }
        }
      }

      TextField(String(localized: "Add a tag, comma separated"), text: $draft)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .focused($draftFocused)
        .submitLabel(.done)
        .onSubmit(commitDraft)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(Color(.secondarySystemGroupedBackground))
        )

      if !availableSuggestions.isEmpty {
        UploadReviewChipRow(labels: availableSuggestions, isSelected: false) { tag in
          tags.append(tag)
        }
      }
    }
  }

  private func remove(_ item: UploadReviewItem) {
    items.removeAll { $0.id == item.id }
  }

  private func commitDraft() {
    // Comma separated so one keyboard trip can add several tags, matching the
    // dashboard's tag field.
    for part in draft.split(separator: ",") {
      let normalized = part.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      if !normalized.isEmpty, !tags.contains(normalized) {
        tags.append(normalized)
      }
    }
    draft = ""
  }
}

private extension View {
  @ViewBuilder
  func uploadReviewSecondaryButtonStyle() -> some View {
    if #available(iOS 26.0, *) {
      buttonStyle(.glass)
    } else {
      buttonStyle(.bordered)
    }
  }

  @ViewBuilder
  func uploadReviewPrimaryButtonStyle() -> some View {
    if #available(iOS 26.0, *) {
      buttonStyle(.glassProminent)
    } else {
      buttonStyle(.borderedProminent)
    }
  }
}

private struct UploadReviewThumbnail: View {
  let item: UploadReviewItem
  let removeLabel: String
  let onRemove: () -> Void

  var body: some View {
    ZStack(alignment: .topTrailing) {
      Color(.tertiarySystemFill)
        .aspectRatio(1, contentMode: .fill)
        .overlay(UploadReviewAssetImage(assetId: item.id))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

      Button(action: onRemove) {
        Image(systemName: "xmark.circle.fill")
          .font(.system(size: 20))
          .symbolRenderingMode(.palette)
          .foregroundStyle(.white, .black.opacity(0.55))
      }
      .padding(5)
      .accessibilityLabel(removeLabel)

      if item.isLivePhoto {
        Image(systemName: "livephoto")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(.white)
          .shadow(radius: 2)
          .padding(7)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }
    }
  }
}

private struct UploadReviewAssetImage: View {
  let assetId: String
  @State private var image: UIImage?

  var body: some View {
    GeometryReader { proxy in
      Group {
        if let image {
          Image(uiImage: image)
            .resizable()
            .scaledToFill()
        } else {
          Color.clear
        }
      }
      .frame(width: proxy.size.width, height: proxy.size.height)
      .clipped()
    }
    .onAppear(perform: load)
  }

  private func load() {
    guard image == nil else { return }
    let assetId = self.assetId
    DispatchQueue.global(qos: .userInitiated).async {
      guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil).firstObject
      else { return }
      let options = PHImageRequestOptions()
      options.deliveryMode = .opportunistic
      options.isNetworkAccessAllowed = true
      options.resizeMode = .fast
      PHImageManager.default().requestImage(
        for: asset,
        targetSize: CGSize(width: 300, height: 300),
        contentMode: .aspectFill,
        options: options
      ) { result, _ in
        guard let result else { return }
        DispatchQueue.main.async { image = result }
      }
    }
  }
}

private struct UploadReviewChipRow: View {
  let labels: [String]
  let isSelected: Bool
  let onTap: (String) -> Void

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(labels, id: \.self) { label in
          Button {
            onTap(label)
          } label: {
            HStack(spacing: 4) {
              Text(label)
              if isSelected {
                Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
              }
            }
            .font(.footnote.weight(isSelected ? .semibold : .regular))
          }
          .buttonStyle(.bordered)
          .buttonBorderShape(.capsule)
          .tint(isSelected ? .accentColor : .secondary)
        }
      }
      .padding(.horizontal, 1)
    }
  }
}
