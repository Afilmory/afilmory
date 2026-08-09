import SwiftUI

struct ShareUploadView: View {
  @ObservedObject var model: ShareUploadModel

  private let columns = [GridItem(.adaptive(minimum: 96), spacing: 8)]

  var body: some View {
    NavigationStack {
      content
        .navigationTitle(String(localized: "Review Upload"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(String(localized: "Cancel")) {
              model.cancel()
            }
          }
        }
    }
  }

  @ViewBuilder
  private var content: some View {
    switch model.phase {
    case .idle, .loading:
      loadingView
    case .ready:
      reviewView
    case .unavailable:
      ContentUnavailableView(
        String(localized: "Afilmory is not ready"),
        systemImage: "person.crop.circle.badge.exclamationmark",
        description: Text("Open Afilmory, sign in, and select a workspace before sharing photos.")
      )
    case .failed:
      ContentUnavailableView(
        model.items.isEmpty
          ? String(localized: "No images to upload")
          : String(localized: "Upload could not start"),
        systemImage: "exclamationmark.triangle",
        description: Text(model.errorMessage ?? String(localized: "Share one or more supported images and try again."))
      )
    }
  }

  private var loadingView: some View {
    VStack(spacing: 14) {
      ProgressView(
        value: model.totalCount == 0 ? 0 : Double(model.loadedCount),
        total: Double(max(model.totalCount, 1))
      )
      .progressViewStyle(.circular)
      Text("Loading shared photos")
        .font(.headline)
      if model.totalCount > 0 {
        Text("Preparing \(model.loadedCount) of \(model.totalCount)")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(24)
  }

  private var reviewView: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        if let context = model.context {
          Label("Upload to \(context.workspaceName)", systemImage: "person.2")
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.secondary)
        }

        Text("\(model.items.count) items")
          .font(.subheadline)
          .foregroundStyle(.secondary)

        LazyVGrid(columns: columns, spacing: 8) {
          ForEach(model.items) { item in
            ShareUploadThumbnailView(
              item: item,
              previewURL: model.previewURLs[item.id],
              removeLabel: String(localized: "Remove"),
              onRemove: { model.remove(item) }
            )
          }
        }

        tagSection

        if let errorMessage = model.errorMessage {
          Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
            .font(.footnote)
            .foregroundStyle(.red)
        }
      }
      .padding(20)
    }
    .background(Color(.systemGroupedBackground))
    .safeAreaInset(edge: .bottom) {
      uploadAction
    }
  }

  private var tagSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("TAGS — THESE BECOME THE FOLDER")
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.tertiary)

      if !model.tags.isEmpty {
        ShareTagChipRow(labels: model.tags, selected: true, onTap: model.toggleTag)
      }

      TextField(String(localized: "Add a tag, comma separated"), text: $model.draft)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.done)
        .onSubmit(model.commitDraft)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(Color(.secondarySystemGroupedBackground))
        )

      if !model.suggestedTags.isEmpty {
        ShareTagChipRow(labels: model.suggestedTags, selected: false, onTap: model.toggleTag)
      }
    }
  }

  private var uploadAction: some View {
    Link(destination: model.handoffURL) {
      Group {
        if model.isSubmitting {
          Label("Adding to upload queue", systemImage: "arrow.up.circle")
        } else {
          Text("Upload \(model.items.count)")
        }
      }
      .lineLimit(1)
      .frame(maxWidth: .infinity)
    }
    .shareUploadButtonStyle()
    .controlSize(.large)
    .disabled(model.items.isEmpty || model.isSubmitting)
    .simultaneousGesture(
      TapGesture().onEnded {
        model.commitDraft()
        model.beginSubmitting()
      }
    )
    .padding(.horizontal, 20)
    .padding(.vertical, 12)
    .background(.bar)
  }
}

private extension View {
  @ViewBuilder
  func shareUploadButtonStyle() -> some View {
    if #available(iOS 26.0, *) {
      buttonStyle(.glassProminent)
    } else {
      buttonStyle(.borderedProminent)
    }
  }
}
