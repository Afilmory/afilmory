import SwiftUI

struct GalleryHeaderModel: Equatable, Sendable {
  let tenantId: String
  let name: String
  let slug: String
  let authorName: String?
  let authorAvatar: String?
  let photoCount: Int?
  let lastUpload: String?
  let domain: String?
}

extension GalleryHeaderModel {
  init(featured: FeaturedGallery) {
    self.init(
      tenantId: featured.id,
      name: featured.name,
      slug: featured.slug,
      authorName: featured.author?.name.trimmingToNil,
      authorAvatar: featured.author?.avatar?.trimmingToNil,
      photoCount: featured.photoCount,
      lastUpload: featured.lastUpload?.trimmingToNil,
      domain: featured.domain?.trimmingToNil
    )
  }

  init(subscription: GallerySubscriptionItem) {
    let gallery = subscription.gallery
    self.init(
      tenantId: subscription.tenantId,
      name: gallery.name,
      slug: gallery.slug,
      authorName: gallery.author?.name.trimmingToNil,
      authorAvatar: gallery.author?.avatar?.trimmingToNil,
      photoCount: gallery.photoCount,
      lastUpload: gallery.lastUpload.trimmingToNil,
      domain: gallery.domain?.trimmingToNil
    )
  }

  init(timelineEvent: GalleryTimelineEvent) {
    let gallery = timelineEvent.gallery
    self.init(
      tenantId: timelineEvent.tenantId,
      name: gallery.name,
      slug: gallery.slug,
      authorName: gallery.author?.name.trimmingToNil,
      authorAvatar: gallery.author?.avatar?.trimmingToNil,
      photoCount: nil,
      lastUpload: timelineEvent.latestAt.trimmingToNil,
      domain: nil
    )
  }
}

extension GallerySubscriptionItem {
  init(optimistic gallery: GalleryHeaderModel, now: Date = Date()) {
    let timestamp = ISO8601DateFormatter().string(from: now)
    self.init(
      createdAt: timestamp,
      gallery: Gallery(
        author: gallery.authorName.map {
          FeaturedGalleryAuthor(name: $0, avatar: gallery.authorAvatar)
        },
        domain: gallery.domain,
        id: gallery.tenantId,
        lastUpload: gallery.lastUpload ?? timestamp,
        name: gallery.name,
        photoCount: gallery.photoCount ?? 0,
        slug: gallery.slug
      ),
      recentPhotos: [],
      tenantId: gallery.tenantId
    )
  }
}

struct GalleryHeaderView: View {
  let model: GalleryHeaderModel
  let subscriptionState: GallerySubscriptionButtonState
  let onToggleSubscription: () -> Void
  let onOpenDomain: (String) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 12) {
        CommentAvatarView(
          imageURL: model.authorAvatar,
          name: model.authorName ?? model.name,
          size: 44
        )
        VStack(alignment: .leading, spacing: 2) {
          Text(model.name)
            .font(.title2.weight(.semibold))
            .foregroundStyle(.primary)
          if let authorName = model.authorName {
            Text(authorName)
              .font(.subheadline)
              .foregroundStyle(.secondary)
          }
          if let secondaryText {
            Text(secondaryText)
              .font(.footnote)
              .foregroundStyle(.tertiary)
          }
        }
        Spacer(minLength: 8)
        if subscriptionState != .hidden {
          followButton
        }
      }
      if let domain = model.domain {
        Button {
          onOpenDomain(domain)
        } label: {
          Label(domain, systemImage: "link")
            .font(.footnote)
            .lineLimit(1)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.tint)
      }
      Divider()
    }
    .padding(.horizontal, 16)
    .padding(.top, 12)
    .padding(.bottom, 8)
    .fixedSize(horizontal: false, vertical: true)
  }

  private var isFollowing: Bool {
    switch subscriptionState {
    case .subscribed: true
    case .updating(let target): target
    default: false
    }
  }

  private var isUpdating: Bool {
    if case .updating = subscriptionState { return true }
    return false
  }

  private var secondaryText: String? {
    var parts: [String] = []
    if let photoCount = model.photoCount {
      parts.append(String(localized: "\(photoCount) photos"))
    }
    if let date = NativeStudioFormatters.date(model.lastUpload) {
      let formatter = RelativeDateTimeFormatter()
      formatter.unitsStyle = .full
      let relative = formatter.localizedString(for: date, relativeTo: Date())
      parts.append(String(localized: "Updated \(relative)"))
    }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }

  private var followButtonBase: some View {
    Button(action: onToggleSubscription) {
      HStack(spacing: 4) {
        if isUpdating {
          ProgressView().controlSize(.mini)
        } else {
          Image(systemName: isFollowing ? "checkmark" : "plus")
        }
        Text(isFollowing ? String(localized: "Following") : String(localized: "Follow"))
          .lineLimit(1)
      }
    }
    .buttonBorderShape(.capsule)
    .controlSize(.small)
    .disabled(isUpdating)
    .accessibilityLabel(
      isFollowing
        ? String(localized: "Unfollow \(model.name)")
        : String(localized: "Follow \(model.name)")
    )
  }

  @ViewBuilder
  private var followButton: some View {
    if isFollowing {
      followButtonBase.buttonStyle(.bordered)
    } else {
      followButtonBase.buttonStyle(.borderedProminent)
    }
  }
}
