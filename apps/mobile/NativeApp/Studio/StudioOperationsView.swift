import SwiftUI

@MainActor
final class StudioOperationsViewModel: ObservableObject {
  @Published private(set) var status: StudioDataSyncStatusResponse?
  @Published private(set) var conflicts: [StudioDataSyncConflictRecord] = []
  @Published private(set) var loading = false
  @Published private(set) var running = false
  @Published private(set) var runProgress = 0.0
  @Published private(set) var runMessage: String?
  @Published private(set) var resolvingID: String?
  @Published var error: Error?
  @Published var operationError: Error?
  @Published var completionMessage: String?

  func load() async {
    if status == nil { loading = true }
    defer { loading = false }
    do {
      async let nextStatus = NativeStudioAPI.dataSyncStatus()
      async let nextConflicts = NativeStudioAPI.dataSyncConflicts()
      status = try await nextStatus
      conflicts = try await nextConflicts
      error = nil
    } catch is CancellationError {
      return
    } catch {
      self.error = error
    }
  }

  func run(dryRun: Bool) async {
    guard !running else { return }
    running = true
    runProgress = 0
    runMessage = Localization.t(
      dryRun ? "studio.operations.dryRunRunning" : "studio.operations.syncRunning"
    )
    defer {
      running = false
      runMessage = nil
    }
    do {
      try await NativeStudioAPI.runDataSync(dryRun: dryRun) { [weak self] event in
        guard let self else { return }
        if event.type == "stage" || event.type == "action" {
          let total = max(event.payload.total ?? 0, 1)
          let current = event.type == "stage" ? event.payload.processed : event.payload.index
          runProgress = min(1, Double(current ?? 0) / Double(total))
        } else if event.type == "log" {
          runMessage = event.payload.message
        } else if event.type == "complete" {
          runProgress = 1
        }
      }
      await load()
      completionMessage = Localization.t(
        dryRun
          ? "studio.operations.dryRunComplete.description"
          : "studio.operations.syncComplete.description"
      )
    } catch {
      operationError = error
    }
  }

  func resolve(_ conflict: StudioDataSyncConflictRecord, strategy: String) async {
    guard resolvingID == nil else { return }
    resolvingID = conflict.id
    defer { resolvingID = nil }
    do {
      try await NativeStudioAPI.resolveConflict(id: conflict.id, strategy: strategy)
      await load()
    } catch {
      operationError = error
    }
  }
}

struct StudioOperationsView: View {
  @StateObject private var model = StudioOperationsViewModel()
  @State private var showRunModes = false
  @State private var resolutionConflict: StudioDataSyncConflictRecord?

  var body: some View {
    Group {
      if model.loading, model.status == nil {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if let error = model.error, model.status == nil {
        StudioFailureView(error: error) { Task { await model.load() } }
      } else {
        operationsForm
      }
    }
    .task { await model.load() }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button(Localization.t("studio.operations.run.action"), systemImage: "arrow.triangle.2.circlepath") {
          showRunModes = true
        }
        .disabled(model.running || model.resolvingID != nil)
      }
    }
    .confirmationDialog(
      Localization.t("studio.operations.run.title"),
      isPresented: $showRunModes,
      titleVisibility: .visible
    ) {
      Button(Localization.t("studio.operations.run.dry")) {
        Task { await model.run(dryRun: true) }
      }
      Button(Localization.t("studio.operations.run.apply")) {
        Task { await model.run(dryRun: false) }
      }
      Button(Localization.t("common.cancel"), role: .cancel) {}
    } message: {
      Text(Localization.t("studio.operations.run.description"))
    }
    .confirmationDialog(
      Localization.t("studio.operations.resolve.title"),
      isPresented: Binding(
        get: { resolutionConflict != nil },
        set: { if !$0 { resolutionConflict = nil } }
      ),
      titleVisibility: .visible
    ) {
      Button(Localization.t("studio.operations.resolve.database")) {
        resolve(using: "prefer-database")
      }
      Button(Localization.t("studio.operations.resolve.storage")) {
        resolve(using: "prefer-storage")
      }
      Button(Localization.t("common.cancel"), role: .cancel) { resolutionConflict = nil }
    } message: {
      Text(Localization.t("studio.operations.resolve.description"))
    }
    .alert(
      Localization.t("studio.operations.runFailed"),
      isPresented: Binding(
        get: { model.operationError != nil },
        set: { if !$0 { model.operationError = nil } }
      )
    ) {
      Button(Localization.t("common.done")) { model.operationError = nil }
    } message: {
      Text(model.operationError?.localizedDescription ?? "")
    }
    .alert(
      Localization.t("studio.operations.syncComplete.title"),
      isPresented: Binding(
        get: { model.completionMessage != nil },
        set: { if !$0 { model.completionMessage = nil } }
      )
    ) {
      Button(Localization.t("common.done")) { model.completionMessage = nil }
    } message: {
      Text(model.completionMessage ?? "")
    }
  }

  private var operationsForm: some View {
    Form {
      if model.running {
        Section(Localization.t("studio.operations.currentRun")) {
          VStack(alignment: .leading, spacing: 8) {
            Text(model.runMessage ?? Localization.t("studio.operations.syncRunning"))
            ProgressView(value: model.runProgress)
          }
        }
      }

      Section(Localization.t("studio.operations.lastRun")) {
        if let lastRun = model.status?.lastRun {
          LabeledContent(
            Localization.t("studio.operations.completedAt"),
            value: NativeStudioFormatters.dateTime(lastRun.completedAt) ?? "—"
          )
          LabeledContent(
            Localization.t("studio.operations.runMode"),
            value: Localization.t(
              lastRun.dryRun ? "studio.operations.mode.dryRun" : "studio.operations.mode.applied"
            )
          )
          LabeledContent(
            Localization.t("studio.operations.actions"),
            value: NativeStudioFormatters.count(lastRun.actionsCount)
          )
          LabeledContent(
            Localization.t("studio.metric.conflicts"),
            value: NativeStudioFormatters.count(lastRun.summary.conflicts)
          )
          LabeledContent(
            Localization.t("studio.operations.errors"),
            value: NativeStudioFormatters.count(lastRun.summary.errors)
          )
        } else {
          ContentUnavailableView(
            Localization.t("studio.operations.noRuns"),
            systemImage: "clock.arrow.circlepath",
            description: Text(Localization.t("studio.operations.neverSynced"))
          )
        }
      }

      Section(
        Localization.t("studio.operations.conflicts", ["count": String(model.conflicts.count)])
      ) {
        if model.conflicts.isEmpty {
          ContentUnavailableView(
            Localization.t("studio.operations.noConflicts.title"),
            systemImage: "checkmark.circle",
            description: Text(Localization.t("studio.operations.noConflicts.description"))
          )
        } else {
          ForEach(model.conflicts) { conflict in
            Button {
              resolutionConflict = conflict
            } label: {
              HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                  .font(.system(size: 20))
                  .foregroundStyle(.orange)
                VStack(alignment: .leading, spacing: 3) {
                  Text(conflict.photoId ?? conflict.storageKey)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                  Text(conflict.reason ?? conflict.storageProvider)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                }
                Spacer()
                if model.resolvingID == conflict.id {
                  ProgressView()
                } else {
                  Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                }
              }
            }
            .buttonStyle(.plain)
          }
        }
      }
    }
    .formStyle(.grouped)
    .refreshable { await model.load() }
  }

  private func resolve(using strategy: String) {
    guard let conflict = resolutionConflict else { return }
    resolutionConflict = nil
    Task { await model.resolve(conflict, strategy: strategy) }
  }
}
