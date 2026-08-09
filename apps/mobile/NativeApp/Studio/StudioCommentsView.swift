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

private func commentStatusLabel(_ status: String) -> String {
  switch status {
  case "approved": String(localized: "Approved")
  case "hidden": String(localized: "Hidden")
  case "pending": String(localized: "Pending")
  case "rejected": String(localized: "Rejected")
  default: String(localized: "All")
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
      String(localized: "Delete comment?"),
      isPresented: Binding(
        get: { pendingDeletionID != nil },
        set: { if !$0 { pendingDeletionID = nil } }
      ),
      titleVisibility: .visible
    ) {
      Button(String(localized: "Delete"), role: .destructive) {
        guard let id = pendingDeletionID else { return }
        pendingDeletionID = nil
        Task { await model.delete(id) }
      }
      Button(String(localized: "Cancel"), role: .cancel) { pendingDeletionID = nil }
    } message: {
      Text("This comment will be removed from the gallery.")
    }
    .alert(
      String(localized: "Unable to delete comment"),
      isPresented: Binding(
        get: { model.mutationError != nil },
        set: { if !$0 { model.mutationError = nil } }
      )
    ) {
      Button(String(localized: "Done")) { model.mutationError = nil }
    } message: {
      Text(model.mutationError?.localizedDescription ?? "")
    }
  }

  private var commentsForm: some View {
    Form {
      Section {
        Picker(String(localized: "Status"), selection: $model.filter) {
          ForEach(filters, id: \.self) { value in
            Text(commentStatusLabel(value))
              .tag(value)
          }
        }
        .pickerStyle(.menu)
      }

      Section(
        String(localized: "Comments (\(model.comments.count))")
      ) {
        if model.comments.isEmpty {
          ContentUnavailableView(
            String(localized: "No comments"),
            systemImage: "text.bubble",
            description: Text("There are no comments in this status.")
          )
        } else {
          ForEach(model.comments) { comment in
            commentRow(comment)
              .contentShape(.rect)
              .onTapGesture {
                if horizontalSizeClass == .regular { model.selectedCommentID = comment.id }
              }
              .contextMenu {
                Button(String(localized: "Delete"), role: .destructive) {
                  pendingDeletionID = comment.id
                }
              }
              .swipeActions(edge: .trailing) {
                Button(String(localized: "Delete"), role: .destructive) {
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
              Text("Load more")
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
        Section(model.users[comment.userId]?.name ?? String(localized: "Unknown user")) {
          VStack(alignment: .leading, spacing: 10) {
            Text(comment.content)
            Text(
              "\(commentStatusLabel(comment.status)) · \(NativeStudioFormatters.dateTime(comment.createdAt) ?? "")"
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
            Button(String(localized: "Delete"), role: .destructive) {
              pendingDeletionID = comment.id
            }
          }
        }
      } else {
        Section {
          ContentUnavailableView(
            String(localized: "No comments"),
            systemImage: "text.bubble",
            description: Text("There are no comments in this status.")
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
          Text(model.users[comment.userId]?.name ?? String(localized: "Unknown user"))
            .font(.subheadline.weight(.semibold))
          Text(commentStatusLabel(comment.status))
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
