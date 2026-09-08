import os
import UserNotifications

final class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var bestAttemptContent: UNMutableNotificationContent?
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var downloadTasks: [URLSessionDataTask] = []
  private var didFinish = false
  private static let log = Logger(subsystem: "app.afilmory.notification", category: "NSE")

  private static let session: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = 15
    configuration.timeoutIntervalForResource = 20
    configuration.waitsForConnectivity = false
    return URLSession(configuration: configuration)
  }()

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    let content = request.content.mutableCopy() as? UNMutableNotificationContent
    bestAttemptContent = content

    guard let content else {
      finish(with: request.content)
      return
    }

    let identity = GalleryPushCommunication.galleryIdentity(from: request.content.userInfo)
    let avatarURL = GalleryPushImageAttachment.remoteAvatarURL(from: request.content.userInfo)
    let imageURL = GalleryPushImageAttachment.remoteImageURL(from: request.content.userInfo)

    guard identity != nil || avatarURL != nil || imageURL != nil else {
      finish(with: content)
      return
    }

    var remaining = (avatarURL != nil ? 1 : 0) + (imageURL != nil ? 1 : 0)
    if remaining == 0 {
      applyCommunication(to: content, identity: identity, avatarData: nil)
      return
    }

    var avatarData: Data?

    let completeOne = { [weak self] in
      guard let self else { return }
      self.lock.lock()
      remaining -= 1
      let done = remaining == 0
      let avatar = avatarData
      let finished = self.didFinish
      self.lock.unlock()
      guard done, !finished else { return }
      self.applyCommunication(to: content, identity: identity, avatarData: avatar)
    }

    if let imageURL {
      download(imageURL) { [weak self] imageData in
        guard let self else {
          completeOne()
          return
        }
        if let imageData,
           let attachment = try? GalleryPushImageAttachment.makeAttachment(from: imageData)
        {
          self.lock.lock()
          content.attachments = [attachment]
          self.lock.unlock()
          Self.log.info(
            "attached id=\(attachment.identifier, privacy: .public) type=\(attachment.type, privacy: .public) path=\(attachment.url.lastPathComponent, privacy: .public)"
          )
        }
        completeOne()
      }
    }

    if let avatarURL {
      download(avatarURL) { [weak self] data in
        guard let self else {
          completeOne()
          return
        }
        self.lock.lock()
        avatarData = data
        self.lock.unlock()
        completeOne()
      }
    }
  }

  override func serviceExtensionTimeWillExpire() {
    lock.lock()
    let tasks = downloadTasks
    lock.unlock()
    tasks.forEach { $0.cancel() }
    finish(with: bestAttemptContent)
  }

  private func applyCommunication(
    to content: UNMutableNotificationContent,
    identity: (name: String, slug: String)?,
    avatarData: Data?
  ) {
    lock.lock()
    let finished = didFinish
    lock.unlock()
    guard !finished else { return }
    guard let identity else {
      finish(with: content)
      return
    }
    GalleryPushCommunication.donateAndUpdate(
      content,
      galleryName: identity.name,
      gallerySlug: identity.slug,
      avatarData: avatarData
    ) { [weak self] updated in
      self?.finish(with: updated)
    }
  }

  private func download(_ url: URL, completion: @escaping (Data?) -> Void) {
    let task = Self.session.dataTask(with: url) { [weak self] data, response, _ in
      guard let self else { return }
      self.lock.lock()
      let finished = self.didFinish
      self.lock.unlock()
      guard !finished else { return }
      guard let data,
            let http = response as? HTTPURLResponse,
            (200..<300).contains(http.statusCode)
      else {
        completion(nil)
        return
      }
      completion(data)
    }
    lock.lock()
    downloadTasks.append(task)
    lock.unlock()
    task.resume()
  }

  private func finish(with content: UNNotificationContent?) {
    lock.lock()
    defer { lock.unlock() }
    guard !didFinish, let contentHandler else { return }
    didFinish = true
    self.contentHandler = nil
    downloadTasks.forEach { $0.cancel() }
    downloadTasks = []
    contentHandler(content ?? UNNotificationContent())
  }
}
