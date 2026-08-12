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
    runMessage = dryRun
      ? String(localized: "Comparing storage and database…")
      : String(localized: "Synchronizing storage and database…")
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
      completionMessage = dryRun
        ? String(localized: "The comparison completed without applying changes.")
        : String(localized: "Storage and database synchronization completed.")
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
  @State private var pendingQuotaReason: QuotaWallReason?
  @State private var showingQuotaWall = false
  @State private var showRunModes = false

  private var quotaRejection: StudioQuotaRejection? {
    model.operationError as? StudioQuotaRejection
  }
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
        Button(String(localized: "Run"), systemImage: "arrow.triangle.2.circlepath") {
          showRunModes = true
        }
        .disabled(model.running || model.resolvingID != nil)
      }
    }
    .confirmationDialog(
      String(localized: "Run data sync"),
      isPresented: $showRunModes,
      titleVisibility: .visible
    ) {
      Button(String(localized: "Dry run")) {
        Task { await model.run(dryRun: true) }
      }
      Button(String(localized: "Sync now")) {
        Task { await model.run(dryRun: false) }
      }
      Button(String(localized: "Cancel"), role: .cancel) {}
    } message: {
      Text("A dry run only compares data. Sync now applies the resulting changes.")
    }
    .confirmationDialog(
      String(localized: "Resolve conflict"),
      isPresented: Binding(
        get: { resolutionConflict != nil },
        set: { if !$0 { resolutionConflict = nil } }
      ),
      titleVisibility: .visible
    ) {
      Button(String(localized: "Use database")) {
        resolve(using: "prefer-database")
      }
      Button(String(localized: "Use storage")) {
        resolve(using: "prefer-storage")
      }
      Button(String(localized: "Cancel"), role: .cancel) { resolutionConflict = nil }
    } message: {
      Text("Choose which version should become authoritative.")
    }
    .alert(
      String(localized: "Data sync failed"),
      isPresented: Binding(
        get: { model.operationError != nil },
        set: { if !$0 { model.operationError = nil } }
      )
    ) {
      if quotaRejection != nil {
        Button(String(localized: "Why?")) {
          pendingQuotaReason = quotaRejection?.reason
          model.operationError = nil
          showingQuotaWall = true
        }
      }
      Button(String(localized: "Done")) { model.operationError = nil }
    } message: {
      Text(quotaRejection?.message ?? model.operationError?.localizedDescription ?? "")
    }
    .sheet(isPresented: $showingQuotaWall) {
      if let reason = pendingQuotaReason {
        QuotaWallSheet(reason: reason)
      }
    }
    .alert(
      String(localized: "Sync complete"),
      isPresented: Binding(
        get: { model.completionMessage != nil },
        set: { if !$0 { model.completionMessage = nil } }
      )
    ) {
      Button(String(localized: "Done")) { model.completionMessage = nil }
    } message: {
      Text(model.completionMessage ?? "")
    }
  }

  private var operationsForm: some View {
    Form {
      if model.running {
        Section(String(localized: "Current operation")) {
          VStack(alignment: .leading, spacing: 8) {
            Text(model.runMessage ?? String(localized: "Synchronizing storage and database…"))
            ProgressView(value: model.runProgress)
          }
        }
      }

      Section(String(localized: "Last run")) {
        if let lastRun = model.status?.lastRun {
          LabeledContent(
            String(localized: "Completed"),
            value: NativeStudioFormatters.dateTime(lastRun.completedAt) ?? "—"
          )
          LabeledContent(
            String(localized: "Mode"),
            value: lastRun.dryRun
              ? String(localized: "Dry run")
              : String(localized: "Applied")
          )
          LabeledContent(
            String(localized: "Actions"),
            value: NativeStudioFormatters.count(lastRun.actionsCount)
          )
          LabeledContent(
            String(localized: "Conflicts"),
            value: NativeStudioFormatters.count(lastRun.summary.conflicts)
          )
          LabeledContent(
            String(localized: "Errors"),
            value: NativeStudioFormatters.count(lastRun.summary.errors)
          )
        } else {
          ContentUnavailableView(
            String(localized: "No sync history"),
            systemImage: "clock.arrow.circlepath",
            description: Text("No sync has completed yet")
          )
        }
      }

      Section(
        String(localized: "Conflicts (\(model.conflicts.count))")
      ) {
        if model.conflicts.isEmpty {
          ContentUnavailableView(
            String(localized: "No unresolved conflicts"),
            systemImage: "checkmark.circle",
            description: Text("Storage and database records are aligned.")
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
