import SwiftUI

@MainActor
final class StudioCommentsViewModel: ObservableObject {
  @Published var filter = "pending"
  @Published var selectedCommentID: String?
  @Published private(set) var comments: [StudioCommentRecord] = []
  @Published private(set) var users: [String: StudioCommentUserRecord] = [:]
  @Published private(set) var nextCursor: String?
  @Published private(set) var loading = false
  @Published private(set) var loadingMore = false
  @Published private(set) var deletingID: String?
  @Published var error: Error?
  @Published var mutationError: Error?

  func resetForFilterChange() {
    comments = []
    users = [:]
    nextCursor = nil
    selectedCommentID = nil
    error = nil
  }

  func load() async {
    loading = comments.isEmpty
    defer { loading = false }
    do {
      let page = try await NativeStudioAPI.comments(status: filter == "all" ? nil : filter)
      comments = page.comments
      users = page.users
      nextCursor = page.nextCursor
      if selectedCommentID == nil { selectedCommentID = comments.first?.id }
      error = nil
    } catch is CancellationError {
      return
    } catch {
      self.error = error
    }
  }

  func loadMore() async {
    guard let nextCursor, !loadingMore else { return }
    loadingMore = true
    defer { loadingMore = false }
    do {
      let page = try await NativeStudioAPI.comments(
        cursor: nextCursor,
        status: filter == "all" ? nil : filter
      )
      comments.append(contentsOf: page.comments)
      users.merge(page.users) { _, next in next }
      self.nextCursor = page.nextCursor
    } catch {
      mutationError = error
    }
  }

  func delete(_ id: String) async {
    guard deletingID == nil else { return }
    deletingID = id
    defer { deletingID = nil }
    do {
      try await NativeStudioAPI.deleteComment(id: id)
      if selectedCommentID == id { selectedCommentID = nil }
      await load()
    } catch {
      mutationError = error
    }
  }
}

struct StudioCommentsView: View {
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @StateObject private var model = StudioCommentsViewModel()
  @State private var pendingDeletionID: String?

  private let filters = ["pending", "all", "approved", "hidden", "rejected"]

  var body: some View {
    Group {
      if model.loading, model.comments.isEmpty {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if let error = model.error, model.comments.isEmpty {
        StudioFailureView(error: error) { Task { await model.load() } }
      } else if horizontalSizeClass == .regular {
        HStack(spacing: 0) {
          commentsForm
            .frame(minWidth: 340, idealWidth: 380, maxWidth: 430)
          Divider()
          detailForm
        }
      } else {
        commentsForm
      }
    }
    .task(id: model.filter) {
      model.resetForFilterChange()
      await model.load()
    }
    .confirmationDialog(
      Localization.t("studio.comments.delete.title"),
      isPresented: Binding(
        get: { pendingDeletionID != nil },
        set: { if !$0 { pendingDeletionID = nil } }
      ),
      titleVisibility: .visible
    ) {
      Button(Localization.t("common.delete"), role: .destructive) {
        guard let id = pendingDeletionID else { return }
        pendingDeletionID = nil
        Task { await model.delete(id) }
      }
      Button(Localization.t("common.cancel"), role: .cancel) { pendingDeletionID = nil }
    } message: {
      Text(Localization.t("studio.comments.delete.description"))
    }
    .alert(
      Localization.t("studio.comments.delete.failed"),
      isPresented: Binding(
        get: { model.mutationError != nil },
        set: { if !$0 { model.mutationError = nil } }
      )
    ) {
      Button(Localization.t("common.done")) { model.mutationError = nil }
    } message: {
      Text(model.mutationError?.localizedDescription ?? "")
    }
  }

  private var commentsForm: some View {
    Form {
      Section {
        Picker(Localization.t("studio.comments.filter"), selection: $model.filter) {
          ForEach(filters, id: \.self) { value in
            Text(Localization.t("studio.comments.status.\(value)"))
              .tag(value)
          }
        }
        .pickerStyle(.menu)
      }

      Section(
        Localization.t("studio.comments.results", ["count": String(model.comments.count)])
      ) {
        if model.comments.isEmpty {
          ContentUnavailableView(
            Localization.t("studio.comments.empty.title"),
            systemImage: "text.bubble",
            description: Text(Localization.t("studio.comments.empty.description"))
          )
        } else {
          ForEach(model.comments) { comment in
            commentRow(comment)
              .contentShape(.rect)
              .onTapGesture {
                if horizontalSizeClass == .regular { model.selectedCommentID = comment.id }
              }
              .contextMenu {
                Button(Localization.t("common.delete"), role: .destructive) {
                  pendingDeletionID = comment.id
                }
              }
              .swipeActions(edge: .trailing) {
                Button(Localization.t("common.delete"), role: .destructive) {
                  pendingDeletionID = comment.id
                }
              }
          }
        }
        if model.nextCursor != nil {
          Button {
            Task { await model.loadMore() }
          } label: {
            if model.loadingMore {
              ProgressView().frame(maxWidth: .infinity)
            } else {
              Text(Localization.t("studio.comments.loadMore"))
                .frame(maxWidth: .infinity)
            }
          }
          .disabled(model.loadingMore)
        }
      }
    }
    .formStyle(.grouped)
    .refreshable { await model.load() }
  }

  private var detailForm: some View {
    Form {
      if let comment = selectedComment {
        Section(model.users[comment.userId]?.name ?? Localization.t("studio.comments.unknownUser")) {
          VStack(alignment: .leading, spacing: 10) {
            Text(comment.content)
            Text(
              "\(Localization.t("studio.comments.status.\(comment.status)")) · \(NativeStudioFormatters.dateTime(comment.createdAt) ?? "")"
            )
            .foregroundStyle(.secondary)
            Text(comment.photoId)
              .font(.caption.monospaced())
              .foregroundStyle(.secondary)
            let count = comment.reactionCounts.values.reduce(0, +)
            if count > 0 { Text("♥ \(count)") }
          }
        }
        Section {
          if model.deletingID == comment.id {
            ProgressView().frame(maxWidth: .infinity)
          } else {
            Button(Localization.t("common.delete"), role: .destructive) {
              pendingDeletionID = comment.id
            }
          }
        }
      } else {
        Section {
          ContentUnavailableView(
            Localization.t("studio.comments.empty.title"),
            systemImage: "text.bubble",
            description: Text(Localization.t("studio.comments.empty.description"))
          )
        }
      }
    }
    .formStyle(.grouped)
  }

  private var selectedComment: StudioCommentRecord? {
    model.comments.first { $0.id == model.selectedCommentID } ?? model.comments.first
  }

  private func commentRow(_ comment: StudioCommentRecord) -> some View {
    HStack(spacing: 12) {
      Image(systemName: "person.crop.circle")
        .font(.system(size: 22))
        .foregroundStyle(
          horizontalSizeClass == .regular && selectedComment?.id == comment.id
            ? Color.accentColor
            : Color.secondary
        )
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 6) {
          Text(model.users[comment.userId]?.name ?? Localization.t("studio.comments.unknownUser"))
            .font(.subheadline.weight(.semibold))
          Text(Localization.t("studio.comments.status.\(comment.status)"))
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Text(comment.content).lineLimit(3)
        HStack(spacing: 6) {
          Text(NativeStudioFormatters.dateTime(comment.createdAt) ?? "")
          let count = comment.reactionCounts.values.reduce(0, +)
          if count > 0 { Text("· ♥ \(count)") }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      Spacer()
      if model.deletingID == comment.id {
        ProgressView()
      } else if horizontalSizeClass == .regular, selectedComment?.id == comment.id {
        Image(systemName: "checkmark")
          .font(.system(size: 13))
          .foregroundStyle(Color.accentColor)
      }
    }
  }
}
