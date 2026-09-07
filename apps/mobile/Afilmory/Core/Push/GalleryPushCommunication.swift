import Foundation
import Intents
import os
import UserNotifications

enum GalleryPushCommunication {
  static let categoryIdentifier = "GALLERY_UPDATE"
  static let serviceName = "Afilmory"
  private static let log = Logger(subsystem: "app.afilmory.notification", category: "GalleryPush")

  static func galleryIdentity(from userInfo: [AnyHashable: Any]) -> (name: String, slug: String)? {
    guard let slug = trimmed(userInfo["gallerySlug"]), !slug.isEmpty else {
      return nil
    }
    let name = trimmed(userInfo["galleryName"])
    return (name?.isEmpty == false ? name! : slug, slug)
  }

  static func makeSendMessageIntent(
    galleryName: String,
    gallerySlug: String,
    body: String,
    avatarData: Data?
  ) -> INSendMessageIntent {
    let handle = INPersonHandle(value: gallerySlug, type: .unknown)
    let sender = INPerson(
      personHandle: handle,
      nameComponents: nil,
      displayName: galleryName,
      image: avatarData.map(INImage.init(imageData:)),
      contactIdentifier: nil,
      customIdentifier: gallerySlug,
      isMe: false,
      suggestionType: .none
    )
    return INSendMessageIntent(
      recipients: nil,
      outgoingMessageType: .outgoingMessageText,
      content: body,
      speakableGroupName: nil,
      conversationIdentifier: gallerySlug,
      serviceName: serviceName,
      sender: sender,
      attachments: nil
    )
  }

  static func donateAndUpdate(
    _ content: UNMutableNotificationContent,
    galleryName: String,
    gallerySlug: String,
    avatarData: Data?,
    completion: @escaping (UNNotificationContent) -> Void
  ) {
    content.categoryIdentifier = categoryIdentifier
    logAttachments("BEFORE UPDATE", content.attachments)
    let intent = makeSendMessageIntent(
      galleryName: galleryName,
      gallerySlug: gallerySlug,
      body: content.body,
      avatarData: avatarData
    )
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate { error in
      guard error == nil else {
        completion(content)
        return
      }
      do {
        let updated = try content.updating(from: intent)
        logAttachments("AFTER UPDATE", updated.attachments)
        if updated.attachments.isEmpty, !content.attachments.isEmpty,
           let restored = updated.mutableCopy() as? UNMutableNotificationContent
        {
          restored.attachments = content.attachments
          logAttachments("RESTORED", restored.attachments)
          completion(restored)
          return
        }
        completion(updated)
      } catch {
        completion(content)
      }
    }
  }

  private static func logAttachments(_ label: String, _ attachments: [UNNotificationAttachment]) {
    log.info("\(label, privacy: .public) count=\(attachments.count, privacy: .public)")
    for attachment in attachments {
      log.info(
        "\(label, privacy: .public) id=\(attachment.identifier, privacy: .public) type=\(attachment.type, privacy: .public) path=\(attachment.url.lastPathComponent, privacy: .public)"
      )
    }
  }

  private static func trimmed(_ value: Any?) -> String? {
    (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
