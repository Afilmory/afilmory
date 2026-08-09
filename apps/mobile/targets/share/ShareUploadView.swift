import SwiftUI

struct ShareUploadView: View {
  @ObservedObject var model: ShareUploadModel

  private let columns = [GridItem(.adaptive(minimum: 96), spacing: 8)]

  var body: some View {
    NavigationStack {
      content
        .navigationTitle(model.localization.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(model.localization.cancel) {
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
        model.localization.unavailableTitle,
        systemImage: "person.crop.circle.badge.exclamationmark",
        description: Text(model.localization.unavailableDescription)
      )
    case .failed:
      ContentUnavailableView(
        model.items.isEmpty ? model.localization.noImagesTitle : model.localization.failedTitle,
        systemImage: "exclamationmark.triangle",
        description: Text(model.errorMessage ?? model.localization.noImagesDescription)
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
      Text(model.localization.loading)
        .font(.headline)
      if model.totalCount > 0 {
        Text(model.localization.loadingProgress(current: model.loadedCount, total: model.totalCount))
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
          Label(model.localization.workspace(context.workspaceName), systemImage: "person.2")
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.secondary)
        }

        Text(model.localization.summary(count: model.items.count))
          .font(.subheadline)
          .foregroundStyle(.secondary)

        LazyVGrid(columns: columns, spacing: 8) {
          ForEach(model.items) { item in
            ShareUploadThumbnailView(
              item: item,
              previewURL: model.previewURLs[item.id],
              removeLabel: model.localization.remove,
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
      Text(model.localization.tagsLabel)
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.tertiary)

      if !model.tags.isEmpty {
        ShareTagChipRow(labels: model.tags, selected: true, onTap: model.toggleTag)
      }

      TextField(model.localization.tagsPlaceholder, text: $model.draft)
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
          Label(model.localization.preparing, systemImage: "arrow.up.circle")
        } else {
          Text(model.localization.upload(count: model.items.count))
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
