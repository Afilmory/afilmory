import Charts
import SwiftUI

@MainActor
final class StudioAnalyticsViewModel: ObservableObject {
  @Published private(set) var data: StudioAnalyticsResponse?
  @Published private(set) var error: Error?
  @Published private(set) var loading = false

  func load() async {
    if data == nil { loading = true }
    defer { loading = false }
    do {
      data = try await NativeStudioAPI.analytics()
      error = nil
    } catch is CancellationError {
      return
    } catch {
      self.error = error
    }
  }
}

struct StudioAnalyticsView: View {
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @StateObject private var model = StudioAnalyticsViewModel()

  var body: some View {
    Group {
      if model.loading, model.data == nil {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if let error = model.error, model.data == nil {
        StudioFailureView(error: error) { Task { await model.load() } }
      } else if let data = model.data {
        analyticsForm(data)
      }
    }
    .task { await model.load() }
  }

  private func analyticsForm(_ data: StudioAnalyticsResponse) -> some View {
    Form {
      Section(String(localized: "Storage summary")) {
        if horizontalSizeClass == .regular {
          LazyVGrid(
            columns: [GridItem(.flexible()), GridItem(.flexible())],
            spacing: 12
          ) {
            metric(String(localized: "Storage"), NativeStudioFormatters.bytes(data.storageUsage.totalBytes))
            metric(String(localized: "Photos"), NativeStudioFormatters.count(data.storageUsage.totalPhotos))
            metric(
              String(localized: "This month"),
              NativeStudioFormatters.bytes(data.storageUsage.currentMonthBytes)
            )
            metric(
              String(localized: "Previous month"),
              NativeStudioFormatters.bytes(data.storageUsage.previousMonthBytes)
            )
          }
        } else {
          LabeledContent(
            String(localized: "Storage"),
            value: NativeStudioFormatters.bytes(data.storageUsage.totalBytes)
          )
          LabeledContent(
            String(localized: "Photos"),
            value: NativeStudioFormatters.count(data.storageUsage.totalPhotos)
          )
          LabeledContent(
            String(localized: "This month"),
            value: NativeStudioFormatters.bytes(data.storageUsage.currentMonthBytes)
          )
          LabeledContent(
            String(localized: "Previous month"),
            value: NativeStudioFormatters.bytes(data.storageUsage.previousMonthBytes)
          )
        }
      }

      Section(String(localized: "Upload trend")) {
        if data.uploadTrends.isEmpty {
          ContentUnavailableView(
            String(localized: "No upload history"),
            systemImage: "chart.bar",
            description: Text("Upload activity will appear after photos are added.")
          )
        } else {
          Chart(data.uploadTrends) { point in
            BarMark(
              x: .value("Month", NativeStudioFormatters.trendMonth(point.month)),
              y: .value("Uploads", point.uploads)
            )
            .foregroundStyle(Color.accentColor)
            .cornerRadius(4)
          }
          .frame(height: 190)
        }
      }

      Section(String(localized: "Storage providers")) {
        if data.storageUsage.providers.isEmpty {
          Text("No data yet")
        } else {
          let maximum = max(data.storageUsage.providers.map(\.bytes).max() ?? 0, 1)
          ForEach(data.storageUsage.providers) { provider in
            VStack(alignment: .leading, spacing: 6) {
              HStack {
                Text(provider.provider).font(.subheadline.weight(.medium))
                Spacer()
                Text(
                  "\(NativeStudioFormatters.bytes(provider.bytes)) · \(NativeStudioFormatters.count(provider.photoCount))"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
              }
              ProgressView(value: provider.bytes / maximum)
            }
          }
        }
      }

      rankedSection(
        title: String(localized: "Popular tags"),
        values: Array(data.popularTags.prefix(10))
      )
      rankedSection(
        title: String(localized: "Top devices"),
        values: Array(data.topDevices.prefix(10))
      )
    }
    .formStyle(.grouped)
    .refreshable { await model.load() }
  }

  private func metric(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(value)
        .font(.system(.title2, design: .rounded, weight: .semibold))
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, minHeight: 78, alignment: .leading)
    .padding(12)
    .background(Color(uiColor: .secondarySystemGroupedBackground))
    .clipShape(.rect(cornerRadius: 12, style: .continuous))
  }

  private func rankedSection(
    title: String,
    values: [StudioAnalyticsResponse.RankedValue]
  ) -> some View {
    Section(title) {
      if values.isEmpty {
        Text("No data yet")
      } else {
        ForEach(Array(values.enumerated()), id: \.offset) { _, item in
          LabeledContent(item.label, value: NativeStudioFormatters.count(item.count))
        }
      }
    }
  }
}

struct StudioFailureView: View {
  let error: Error
  let retry: () -> Void

  var body: some View {
    ContentUnavailableView {
      Label(String(localized: "Unable to load Studio"), systemImage: "exclamationmark.triangle")
    } description: {
      Text(error.localizedDescription.isEmpty ? String(localized: "Check your connection and try again.") : error.localizedDescription)
    } actions: {
      AfilmoryButton(prominent: true, action: retry) {
        Text("Retry")
      }
    }
  }
}
