import ActivityKit
import SwiftUI
import WidgetKit

@main
struct AfilmoryWidgets: WidgetBundle {
  var body: some Widget {
    UploadActivityWidget()
    DailyPhotoWidget()
  }
}

struct UploadActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: UploadActivityAttributes.self) { context in
      UploadActivityLockScreenView(title: context.attributes.title, state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.6))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: "photo.on.rectangle.angled")
            .font(.title3)
            .foregroundStyle(.tint)
            .frame(maxHeight: .infinity, alignment: .center)
        }
        DynamicIslandExpandedRegion(.trailing) {
          UploadActivityCountText(state: context.state)
            .font(.title3.weight(.semibold))
            .frame(maxHeight: .infinity, alignment: .center)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            Text(context.attributes.title)
              .font(.caption)
              .foregroundStyle(.secondary)
            ProgressView(value: context.state.progress)
              .tint(context.state.failed > 0 ? .red : .accentColor)
            if context.state.failed > 0 {
              UploadActivityFailedBadge(count: context.state.failed)
            }
          }
        }
      } compactLeading: {
        UploadActivityRing(state: context.state)
      } compactTrailing: {
        UploadActivityCountText(state: context.state)
          .font(.caption2.weight(.semibold))
      } minimal: {
        UploadActivityRing(state: context.state)
      }
      .keylineTint(.accentColor)
    }
  }
}

private struct UploadActivityLockScreenView: View {
  let title: String
  let state: UploadActivityAttributes.ContentState

  var body: some View {
    HStack(spacing: 14) {
      Image(systemName: "photo.on.rectangle.angled")
        .font(.title2)
        .foregroundStyle(.tint)

      VStack(alignment: .leading, spacing: 6) {
        HStack {
          Text(title)
            .font(.subheadline.weight(.semibold))
          Spacer()
          UploadActivityCountText(state: state)
            .font(.subheadline.weight(.semibold))
        }
        ProgressView(value: state.progress)
          .tint(state.failed > 0 ? .red : .accentColor)
        if state.failed > 0 {
          UploadActivityFailedBadge(count: state.failed)
        }
      }
    }
    .padding(16)
  }
}

private struct UploadActivityCountText: View {
  let state: UploadActivityAttributes.ContentState

  var body: some View {
    Text("\(state.done)/\(state.total)")
      .monospacedDigit()
      .contentTransition(.numericText())
  }
}

private struct UploadActivityRing: View {
  let state: UploadActivityAttributes.ContentState

  var body: some View {
    ProgressView(value: max(0.02, state.progress))
      .progressViewStyle(.circular)
      .tint(state.failed > 0 ? .red : .accentColor)
  }
}

private struct UploadActivityFailedBadge: View {
  let count: Int

  var body: some View {
    Label("\(count)", systemImage: "exclamationmark.triangle.fill")
      .font(.caption2.weight(.semibold))
      .foregroundStyle(.red)
      .labelStyle(.titleAndIcon)
  }
}
