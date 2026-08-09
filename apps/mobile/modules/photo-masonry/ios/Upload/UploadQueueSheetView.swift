import SwiftUI
import UIKit

struct UploadQueueSummary {
  let total: Int
  let done: Int
  let failed: Int
  let progress: Double
  let running: Bool

  init(jobs: [UploadJobState]) {
    let counted = jobs.filter { $0.status != .cancelled }
    total = counted.count
    done = jobs.filter { $0.status == .done }.count
    failed = jobs.filter { $0.status == .failed }.count
    running = jobs.contains { $0.status.isActive }
    progress = counted.isEmpty
      ? 0
      : counted.reduce(0) { $0 + ($1.status == .done ? 1 : $1.progress) } / Double(counted.count)
  }
}

@MainActor
final class UploadQueueViewModel: ObservableObject {
  @Published private(set) var jobs: [UploadJobState] = []
  private var token: UUID?

  init() {
    token = UploadCenter.shared.observe { [weak self] jobs in
      self?.jobs = jobs
    }
  }

  deinit {
    if let token {
      UploadCenter.shared.unobserve(token)
    }
  }

  var summary: UploadQueueSummary {
    UploadQueueSummary(jobs: jobs)
  }
}

@MainActor
enum UploadQueuePresenter {
  private static weak var current: UIViewController?

  @MainActor
  static func present(from presenter: UIViewController) {
    if let current, current.presentingViewController != nil {
      return
    }

    let model = UploadQueueViewModel()
    // Weak: the sheet view retains this closure, so a strong capture of the
    // navigation controller would cycle and keep `current` alive forever,
    // swallowing every later FAB tap.
    weak var navigation: UINavigationController?
    let hostingController = UIHostingController(
      rootView: UploadQueueSheetView(model: model) { job in
        let logHost = UIHostingController(
          rootView: UploadJobLogView(model: model, jobId: job.id)
        )
        logHost.navigationItem.title = job.name
        navigation?.pushViewController(logHost, animated: true)
      }
    )
    hostingController.navigationItem.title = String(localized: "Uploads")
    hostingController.navigationItem.leftBarButtonItem = UIBarButtonItem(
      image: UIImage(systemName: "ellipsis.circle"),
      menu: UIMenu(children: [
        UIDeferredMenuElement.uncached { completion in
          completion(overflowActions())
        },
      ])
    )
    hostingController.navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: String(localized: "Done"),
      image: nil,
      primaryAction: UIAction { [weak hostingController] _ in
        hostingController?.dismiss(animated: true)
      },
      menu: nil
    )

    let navigationController = UINavigationController(rootViewController: hostingController)
    navigation = navigationController
    navigationController.navigationBar.prefersLargeTitles = false
    navigationController.modalPresentationStyle = .pageSheet
    if let sheet = navigationController.sheetPresentationController {
      sheet.detents = [.medium(), .large()]
      sheet.selectedDetentIdentifier = .medium
      sheet.prefersGrabberVisible = true
    }
    current = navigationController
    presenter.present(navigationController, animated: true)
  }

  private static func overflowActions() -> [UIMenuElement] {
    let jobs = UploadCenter.shared.currentJobs()
    var actions: [UIMenuElement] = []
    if jobs.contains(where: { $0.status.isActive }) {
      actions.append(
        UIAction(title: String(localized: "Cancel All"), image: UIImage(systemName: "xmark.circle"), attributes: .destructive) { _ in
          UploadCenter.shared.cancelAll()
        }
      )
    }
    if jobs.contains(where: { $0.status == .failed || $0.status == .cancelled }) {
      actions.append(
        UIAction(title: String(localized: "Retry Failed"), image: UIImage(systemName: "arrow.clockwise")) { _ in
          UploadCenter.shared.retryAllFailed()
        }
      )
    }
    if jobs.contains(where: { $0.status == .done || $0.status == .cancelled }) {
      actions.append(
        UIAction(title: String(localized: "Clear Finished"), image: UIImage(systemName: "trash")) { _ in
          UploadCenter.shared.clearFinished()
        }
      )
    }
    return actions
  }
}

struct UploadQueueSheetView: View {
  @ObservedObject var model: UploadQueueViewModel
  let onOpenLogs: (UploadJobState) -> Void

  var body: some View {
    let summary = model.summary
    List {
      Section {
        // Newest first: review usually targets the upload that just happened,
        // and a medium-detent sheet only shows the first few rows.
        ForEach(model.jobs.reversed(), id: \.id) { job in
          UploadQueueRow(job: job, onOpenLogs: onOpenLogs)
        }
      } header: {
        VStack(alignment: .leading, spacing: 10) {
          Text("Uploaded \(summary.done) of \(summary.total)")
            .font(.headline)
            .foregroundStyle(.primary)
          ProgressView(value: summary.progress)
            .tint(summary.failed > 0 && !summary.running ? Color.red : Color.accentColor)
          if summary.failed > 0 {
            Text("\(summary.failed) failed")
              .font(.caption)
              .foregroundStyle(.red)
          }
        }
        .textCase(nil)
        .padding(.vertical, 8)
      }
    }
    .listStyle(.insetGrouped)
    .safeAreaInset(edge: .bottom) {
      actionBar(summary: summary)
    }
  }

  // One full-width primary action; everything else lives in the navigation
  // bar's overflow menu so labels never wrap into a cramped three-button row.
  @ViewBuilder
  private func actionBar(summary: UploadQueueSummary) -> some View {
    let retryable = model.jobs.contains { $0.status == .failed || $0.status == .cancelled }
    let clearable = model.jobs.contains { $0.status == .done || $0.status == .cancelled }
    if summary.running {
      primaryAction(String(localized: "Cancel All"), role: .destructive) {
        UploadCenter.shared.cancelAll()
      }
    } else if retryable {
      primaryAction(String(localized: "Retry Failed")) {
        UploadCenter.shared.retryAllFailed()
      }
    } else if clearable {
      primaryAction(String(localized: "Clear Finished")) {
        UploadCenter.shared.clearFinished()
      }
    }
  }

  private func primaryAction(
    _ title: String,
    role: ButtonRole? = nil,
    action: @escaping () -> Void
  ) -> some View {
    Button(role: role, action: action) {
      Text(title)
        .lineLimit(1)
        .frame(maxWidth: .infinity)
    }
    .buttonStyle(.bordered)
    .controlSize(.large)
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
    .background(.bar)
  }
}

private struct UploadQueueRow: View {
  let job: UploadJobState
  let onOpenLogs: (UploadJobState) -> Void

  private var isActive: Bool {
    job.status.isActive
  }

  private var hasLogs: Bool {
    !(job.serverLogs ?? []).isEmpty
  }

  var body: some View {
    HStack(spacing: 12) {
      UploadQueueThumbnail(jobId: job.id)

      VStack(alignment: .leading, spacing: 4) {
        Text(job.name)
          .font(.subheadline.weight(.medium))
          .lineLimit(1)

        HStack(spacing: 6) {
          if job.bytes > 0 {
            Text(ByteCountFormatter.string(fromByteCount: job.bytes, countStyle: .file))
          }
          Text(statusText)
            .foregroundStyle(statusColor)
        }
        .font(.caption)
        .foregroundStyle(.secondary)

        if isActive {
          ProgressView(value: job.progress)
            .tint(.accentColor)
        }

        if let latestServerLog = job.latestServerLog, isActive {
          Text(latestServerLog)
            .font(.caption2.monospaced())
            .foregroundStyle(.secondary)
            .lineLimit(2)
            .contentTransition(.opacity)
        }

        if let error = job.error, job.status == .failed {
          Text(error)
            .font(.caption)
            .foregroundStyle(.red)
            .lineLimit(2)
        }
      }

      Spacer(minLength: 8)

      trailingControl

      if hasLogs {
        Image(systemName: "chevron.right")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(.tertiary)
      }
    }
    .padding(.vertical, 2)
    .contentShape(Rectangle())
    .onTapGesture {
      if hasLogs {
        onOpenLogs(job)
      }
    }
  }

  private var statusText: String {
    if isActive, job.attempt > 1 {
      return "\(job.status.label) · \(String(localized: "attempt \(job.attempt)"))"
    }
    return job.status.label
  }

  private var statusColor: Color {
    switch job.status {
    case .done:
      return .green
    case .failed:
      return .red
    default:
      return .secondary
    }
  }

  @ViewBuilder
  private var trailingControl: some View {
    switch job.status {
    case .queued, .uploading, .processing:
      Button {
        UploadCenter.shared.cancel(id: job.id)
      } label: {
        Image(systemName: "xmark.circle.fill")
          .font(.title3)
          .foregroundStyle(.secondary)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(String(localized: "Cancel"))
    case .failed, .cancelled:
      Button {
        UploadCenter.shared.retry(id: job.id)
      } label: {
        Image(systemName: "arrow.clockwise.circle.fill")
          .font(.title3)
          .foregroundStyle(Color.accentColor)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(String(localized: "Retry"))
    case .done:
      Image(systemName: "checkmark.circle.fill")
        .font(.title3)
        .foregroundStyle(.green)
    }
  }
}

struct UploadJobLogView: View {
  @ObservedObject var model: UploadQueueViewModel
  let jobId: String

  private var job: UploadJobState? {
    model.jobs.first { $0.id == jobId }
  }

  var body: some View {
    let logs = job?.serverLogs ?? []
    ScrollViewReader { proxy in
      List {
        if let job {
          Section {
            HStack(spacing: 6) {
              if job.bytes > 0 {
                Text(ByteCountFormatter.string(fromByteCount: job.bytes, countStyle: .file))
              }
              Text(job.status.rawValue.uppercased())
                .foregroundStyle(job.status == .failed ? Color.red : job.status == .done ? Color.green : Color.secondary)
              if let error = job.error {
                Text(error).foregroundStyle(.red).lineLimit(1)
              }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .listRowSeparator(.hidden)
          }
        }
        Section {
          ForEach(Array(logs.enumerated()), id: \.offset) { index, line in
            Text(line.message)
              .font(.caption.monospaced())
              .foregroundStyle(color(for: line.level))
              .listRowSeparator(.hidden)
              .listRowInsets(EdgeInsets(top: 3, leading: 20, bottom: 3, trailing: 20))
              .id(index)
          }
        }
      }
      .listStyle(.plain)
      .onChange(of: logs.count) { _, count in
        guard count > 0 else { return }
        withAnimation {
          proxy.scrollTo(count - 1, anchor: .bottom)
        }
      }
    }
  }

  private func color(for level: String) -> Color {
    switch level {
    case "error":
      return .red
    case "warn":
      return .orange
    case "success":
      return .green
    default:
      return .primary
    }
  }
}

private struct UploadQueueThumbnail: View {
  let jobId: String
  @State private var image: UIImage?

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
      } else {
        ZStack {
          Color(.tertiarySystemFill)
          Image(systemName: "photo")
            .font(.caption)
            .foregroundStyle(.tertiary)
        }
      }
    }
    .frame(width: 44, height: 44)
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    .onAppear {
      if image == nil {
        image = UIImage(contentsOfFile: UploadCenter.previewURL(jobId).path)
      }
    }
  }
}
