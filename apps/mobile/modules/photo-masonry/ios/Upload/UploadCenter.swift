import Foundation
import Photos

struct UploadTerminalFailure: Sendable {
  let message: String
  let quotaReason: QuotaWallReason?
  let detailsJSON: String?

  init(payload: [String: Any]) {
    message = (payload["message"] as? String) ?? String(localized: "The server could not complete the operation.")
    let details = payload["details"] as? [String: Any]
    quotaReason = QuotaWallReason.parse(details: details)
    detailsJSON = details
      .flatMap { try? JSONSerialization.data(withJSONObject: $0) }
      .flatMap { String(data: $0, encoding: .utf8) }
  }
}

final class UploadCenter: NSObject, @unchecked Sendable {
  static let shared = UploadCenter()
  static var sessionIdentifier: String {
    sessionIdentifier(bundleIdentifier: Bundle.main.bundleIdentifier)
  }
  @MainActor static var backgroundCompletionHandler: (() -> Void)?

  static func sessionIdentifier(bundleIdentifier: String?) -> String {
    let bundleIdentifier = bundleIdentifier?.trimmingCharacters(in: .whitespacesAndNewlines)
    let owner = bundleIdentifier.flatMap { $0.isEmpty ? nil : $0 } ?? "app.afilmory"
    return "\(owner).upload"
  }

  var onChange: (([[String: Any?]]) -> Void)?
  private var jobObservers: [UUID: @MainActor @Sendable ([UploadJobState]) -> Void] = [:]

  private static let maxAttempts = 3
  private static let retryDelays: [TimeInterval] = [1, 3]

  private let stateQueue = DispatchQueue(label: "app.afilmory.upload.state")
  private let prepareQueue = DispatchQueue(label: "app.afilmory.upload.prepare", qos: .utility)
  private var jobs: [UploadJobState] = []
  private var tasks: [String: URLSessionTask] = [:]
  private var responses: [String: SseResponseState] = [:]
  private var emitScheduled = false
  private var session: URLSession!

  private struct SseResponseState {
    var buffer = Data()
    var sawComplete = false
    var terminalFailure: UploadTerminalFailure?
  }

  override private init() {
    super.init()
    let configuration = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
    configuration.sessionSendsLaunchEvents = true
    configuration.isDiscretionary = false
    let delegateQueue = OperationQueue()
    delegateQueue.maxConcurrentOperationCount = 1
    session = URLSession(configuration: configuration, delegate: self, delegateQueue: delegateQueue)
    stateQueue.async { self.restoreLocked() }
  }

  private static let rootDirectory: URL = {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let url = base.appendingPathComponent("uploads", isDirectory: true)
    try? FileManager.default.createDirectory(
      at: url.appendingPathComponent("bodies", isDirectory: true),
      withIntermediateDirectories: true
    )
    try? FileManager.default.createDirectory(
      at: url.appendingPathComponent("previews", isDirectory: true),
      withIntermediateDirectories: true
    )
    return url
  }()

  private static func bodyURL(_ jobId: String) -> URL {
    rootDirectory.appendingPathComponent("bodies/\(jobId)")
  }

  static func previewURL(_ jobId: String) -> URL {
    rootDirectory.appendingPathComponent("previews/\(jobId).jpg")
  }

  private static var stateURL: URL {
    rootDirectory.appendingPathComponent("state.json")
  }

  func enqueue(endpoint: String, directory: String?, items: [(id: String, name: String)]) -> Int {
    return stateQueue.sync {
      for item in items {
        let job = UploadJobState(
          id: UUID().uuidString,
          assetId: item.id,
          name: item.name.isEmpty ? "Photo" : item.name,
          bytes: 0,
          status: .queued,
          progress: 0,
          attempt: 1,
          error: nil,
          endpoint: endpoint,
          directory: directory,
          boundary: "afilmory-\(UUID().uuidString)"
        )
        jobs.append(job)
        prepare(jobId: job.id)
      }
      persistLocked()
      scheduleEmitLocked()
      return items.count
    }
  }

  func enqueuePreparedAssets(
    endpoint: String,
    directory: String?,
    items: [UploadStagedAsset]
  ) throws -> Int {
    var preparedJobs: [UploadJobState] = []
    var createdJobIDs: [String] = []
    do {
      for item in items {
        let jobID = UUID().uuidString
        createdJobIDs.append(jobID)
        let boundary = "afilmory-\(UUID().uuidString)"
        let previewURL = Self.previewURL(jobID)
        UploadJobPreparer.writePreview(forFileAt: item.photo.url, to: previewURL)
        let prepared = try UploadJobPreparer.buildBody(
          forFiles: item.files,
          directory: directory,
          boundary: boundary,
          to: Self.bodyURL(jobID)
        )
        preparedJobs.append(
          UploadJobState(
            id: jobID,
            assetId: "share:\(item.id)",
            name: prepared.name,
            bytes: prepared.bytes,
            status: .queued,
            progress: 0,
            attempt: 1,
            error: nil,
            endpoint: endpoint,
            directory: directory,
            boundary: boundary
          )
        )
      }
    } catch {
      for jobID in createdJobIDs {
        try? FileManager.default.removeItem(at: Self.bodyURL(jobID))
        try? FileManager.default.removeItem(at: Self.previewURL(jobID))
      }
      throw error
    }

    stateQueue.sync {
      jobs.append(contentsOf: preparedJobs)
      for job in preparedJobs {
        startTaskLocked(jobId: job.id, delay: 0)
      }
      persistLocked()
      scheduleEmitLocked()
    }
    return preparedJobs.count
  }

  func snapshot() -> [[String: Any?]] {
    stateQueue.sync { snapshotLocked() }
  }

  func currentJobs() -> [UploadJobState] {
    stateQueue.sync { jobs }
  }

  func observe(
    _ handler: @escaping @MainActor @Sendable ([UploadJobState]) -> Void
  ) -> UUID {
    let token = UUID()
    stateQueue.sync {
      jobObservers[token] = handler
      let current = jobs
      DispatchQueue.main.async { handler(current) }
    }
    return token
  }

  func unobserve(_ token: UUID) {
    stateQueue.async { self.jobObservers.removeValue(forKey: token) }
  }

  func cancel(id: String) {
    stateQueue.sync {
      guard let index = jobs.firstIndex(where: { $0.id == id }),
            jobs[index].status != .done, jobs[index].status != .cancelled
      else { return }
      jobs[index].status = .cancelled
      jobs[index].error = nil
      tasks[id]?.cancel()
      persistLocked()
      scheduleEmitLocked()
    }
  }

  func cancelAll() {
    stateQueue.sync {
      for index in jobs.indices where jobs[index].status != .done && jobs[index].status != .cancelled {
        jobs[index].status = .cancelled
        jobs[index].error = nil
        tasks[jobs[index].id]?.cancel()
      }
      persistLocked()
      scheduleEmitLocked()
    }
  }

  func retry(id: String) {
    stateQueue.sync { retryLocked(id: id) }
  }

  func retryAllFailed() {
    stateQueue.sync {
      for job in jobs where job.status == .failed || job.status == .cancelled {
        retryLocked(id: job.id)
      }
    }
  }

  func clearFinished() {
    stateQueue.sync {
      let removed = jobs.filter { $0.status == .done || $0.status == .cancelled }
      guard !removed.isEmpty else { return }
      for job in removed {
        try? FileManager.default.removeItem(at: Self.bodyURL(job.id))
        try? FileManager.default.removeItem(at: Self.previewURL(job.id))
      }
      jobs.removeAll { $0.status == .done || $0.status == .cancelled }
      persistLocked()
      scheduleEmitLocked()
    }
  }

  private func restoreLocked() {
    if let data = try? Data(contentsOf: Self.stateURL),
       let decoded = try? JSONDecoder().decode([UploadJobState].self, from: data) {
      jobs = decoded
    }
    session.getAllTasks { liveTasks in
      self.stateQueue.async {
        for task in liveTasks {
          guard let jobId = task.taskDescription,
                let job = self.jobs.first(where: { $0.id == jobId }),
                job.status.isActive
          else {
            task.cancel()
            continue
          }
          self.tasks[jobId] = task
          self.responses[jobId] = SseResponseState()
        }
        // A force quit cancels every task the daemon held, so anything still
        // marked in-flight without a live task restarts from its body file.
        for index in self.jobs.indices {
          let job = self.jobs[index]
          guard job.status.isActive, self.tasks[job.id] == nil else { continue }
          self.jobs[index].status = .queued
          self.jobs[index].progress = 0
          if FileManager.default.fileExists(atPath: Self.bodyURL(job.id).path) {
            self.startTaskLocked(jobId: job.id, delay: 0)
          } else {
            self.prepare(jobId: job.id)
          }
        }
        self.persistLocked()
        self.scheduleEmitLocked()
      }
    }
  }

  private func retryLocked(id: String) {
    guard let index = jobs.firstIndex(where: { $0.id == id }),
          jobs[index].status == .failed || jobs[index].status == .cancelled,
          tasks[id] == nil
    else { return }
    jobs[index].status = .queued
    jobs[index].attempt = 1
    jobs[index].error = nil
    jobs[index].serverLogs = nil
    jobs[index].progress = 0
    if FileManager.default.fileExists(atPath: Self.bodyURL(id).path) {
      startTaskLocked(jobId: id, delay: 0)
    } else {
      prepare(jobId: id)
    }
    persistLocked()
    scheduleEmitLocked()
  }

  private func prepare(jobId: String) {
    prepareQueue.async {
      guard let job = self.stateQueue.sync(execute: { self.jobs.first(where: { $0.id == jobId }) }),
            job.status == .queued
      else { return }
      guard let asset = UploadJobPreparer.fetchAsset(job.assetId) else {
        self.finishPrepare(jobId: jobId, result: .failure(UploadPrepareError.assetUnavailable))
        return
      }
      let previewURL = Self.previewURL(jobId)
      if !FileManager.default.fileExists(atPath: previewURL.path) {
        UploadJobPreparer.writePreview(for: asset, to: previewURL)
        self.stateQueue.async { self.scheduleEmitLocked() }
      }
      do {
        let prepared = try UploadJobPreparer.buildBody(
          for: asset,
          directory: job.directory,
          boundary: job.boundary,
          to: Self.bodyURL(jobId)
        )
        self.finishPrepare(jobId: jobId, result: .success(prepared))
      } catch {
        try? FileManager.default.removeItem(at: Self.bodyURL(jobId))
        self.finishPrepare(jobId: jobId, result: .failure(error))
      }
    }
  }

  private func finishPrepare(jobId: String, result: Result<UploadPreparedBody, Error>) {
    stateQueue.async {
      guard let index = self.jobs.firstIndex(where: { $0.id == jobId }),
            self.jobs[index].status == .queued
      else { return }
      switch result {
      case .success(let prepared):
        self.jobs[index].name = prepared.name
        self.jobs[index].bytes = prepared.bytes
        self.startTaskLocked(jobId: jobId, delay: 0)
      case .failure(let error):
        self.jobs[index].status = .failed
        self.jobs[index].error = error.localizedDescription
      }
      self.persistLocked()
      self.scheduleEmitLocked()
    }
  }

  private func startTaskLocked(jobId: String, delay: TimeInterval) {
    guard let index = jobs.firstIndex(where: { $0.id == jobId }),
          let url = URL(string: jobs[index].endpoint)
    else { return }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("multipart/form-data; boundary=\(jobs[index].boundary)", forHTTPHeaderField: "Content-Type")
    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
    if let cookie = AfilmorySessionStore.shared.current().cookie {
      request.setValue(cookie, forHTTPHeaderField: "Cookie")
    }
    let task = session.uploadTask(with: request, fromFile: Self.bodyURL(jobId))
    // taskDescription is persisted by the daemon, so it is the only join key
    // that survives an app relaunch.
    task.taskDescription = jobId
    if delay > 0 {
      task.earliestBeginDate = Date(timeIntervalSinceNow: delay)
    }
    tasks[jobId] = task
    responses[jobId] = SseResponseState()
    task.resume()
  }

  private func completeTaskLocked(jobId: String, error: Error?, httpStatus: Int?) {
    tasks.removeValue(forKey: jobId)
    var response = responses.removeValue(forKey: jobId) ?? SseResponseState()
    if !response.buffer.isEmpty {
      let leftover = response.buffer
      response.buffer = Data()
      handleEventBlockLocked(leftover, jobId: jobId, state: &response)
    }
    guard let index = jobs.firstIndex(where: { $0.id == jobId }) else { return }

    if jobs[index].status == .cancelled {
      persistLocked()
      scheduleEmitLocked()
      return
    }
    if let failure = response.terminalFailure {
      // The stream succeeded but the server rejected this payload; the same
      // bytes cannot fare better on a retry.
      jobs[index].status = .failed
      jobs[index].error = failure.message
      jobs[index].quotaDetails = failure.detailsJSON
      persistLocked()
      scheduleEmitLocked()
      refreshEntitlementsLocked()
      return
    }
    if let error {
      let apiError = APIError.request(error)
      retryOrFailLocked(index: index, message: apiError.localizedDescription, retryable: true)
      return
    }
    let status = httpStatus ?? 0
    if (200..<300).contains(status), response.sawComplete {
      jobs[index].status = .done
      jobs[index].progress = 1
      jobs[index].error = nil
      jobs[index].quotaDetails = nil
      try? FileManager.default.removeItem(at: Self.bodyURL(jobId))
      persistLocked()
      scheduleEmitLocked()
      refreshEntitlementsLocked()
      return
    }
    let responseError = APIError.response(status: status, body: response.buffer.isEmpty ? nil : response.buffer)
    let retryable = status == 0
      || status == 408
      || status == 429
      || status >= 500
      || (200..<300).contains(status)
    let message = responseError?.localizedDescription ?? "The server response was incomplete."
    retryOrFailLocked(index: index, message: message, retryable: retryable)
  }

  private func retryOrFailLocked(index: Int, message: String, retryable: Bool) {
    let jobId = jobs[index].id
    if retryable,
       jobs[index].attempt < Self.maxAttempts,
       FileManager.default.fileExists(atPath: Self.bodyURL(jobId).path) {
      let delay = Self.retryDelays[min(jobs[index].attempt, Self.retryDelays.count) - 1]
      jobs[index].attempt += 1
      jobs[index].status = .queued
      jobs[index].progress = 0
      jobs[index].error = message
      startTaskLocked(jobId: jobId, delay: delay)
    } else {
      jobs[index].status = .failed
      jobs[index].error = message
    }
    persistLocked()
    scheduleEmitLocked()
  }

  private func consumeStreamLocked(jobId: String) {
    guard var state = responses[jobId] else { return }
    let separator = Data("\n\n".utf8)
    while let range = state.buffer.range(of: separator) {
      let block = state.buffer.subdata(in: state.buffer.startIndex..<range.lowerBound)
      state.buffer.removeSubrange(state.buffer.startIndex..<range.upperBound)
      handleEventBlockLocked(block, jobId: jobId, state: &state)
    }
    responses[jobId] = state
  }

  private func handleEventBlockLocked(_ block: Data, jobId: String, state: inout SseResponseState) {
    guard let text = String(data: block, encoding: .utf8) else { return }
    var eventName: String?
    var dataLines: [String] = []
    for line in text.split(separator: "\n", omittingEmptySubsequences: true) {
      if line.hasPrefix("event:") {
        eventName = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
      } else if line.hasPrefix("data:") {
        dataLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
      }
    }
    guard eventName == "progress",
          !dataLines.isEmpty,
          let payload = try? JSONSerialization.jsonObject(with: Data(dataLines.joined(separator: "\n").utf8)) as? [String: Any],
          let type = payload["type"] as? String
    else { return }

    switch type {
    case "start":
      updateJobLocked(jobId) { job in
        job.status = .processing
        job.progress = 0.5
      }
    case "stage", "action":
      let body = payload["payload"] as? [String: Any]
      let total = max((body?["total"] as? Double) ?? 1, 1)
      let current = (body?[type == "stage" ? "processed" : "index"] as? Double) ?? 0
      updateJobLocked(jobId) { job in
        job.status = .processing
        job.progress = 0.5 + min(1, current / total) * 0.5
      }
    case "log":
      if let body = payload["payload"] as? [String: Any], let message = body["message"] as? String {
        let line = UploadServerLogLine(message: message, level: (body["level"] as? String) ?? "info")
        updateJobLocked(jobId) { job in
          var logs = job.serverLogs ?? []
          logs.append(line)
          if logs.count > 200 {
            logs.removeFirst(logs.count - 200)
          }
          job.serverLogs = logs
        }
      }
    case "complete":
      state.sawComplete = true
      updateJobLocked(jobId) { job in
        job.progress = 1
      }
    case "error":
      state.terminalFailure = UploadTerminalFailure(payload: (payload["payload"] as? [String: Any]) ?? [:])
      tasks[jobId]?.cancel()
    default:
      break
    }
  }

  // A batch that finished changed the workspace's usage, so Studio's plan section would otherwise
  // keep showing the numbers from before the upload.
  private func refreshEntitlementsLocked() {
    guard jobs.allSatisfy({ $0.status == .done || $0.status == .failed || $0.status == .cancelled }) else { return }
    Task { @MainActor in await EntitlementStore.shared.refresh() }
  }

  private func updateJobLocked(_ jobId: String, _ mutate: (inout UploadJobState) -> Void) {
    guard let index = jobs.firstIndex(where: { $0.id == jobId }) else { return }
    mutate(&jobs[index])
    scheduleEmitLocked()
  }

  private func snapshotLocked() -> [[String: Any?]] {
    jobs.map { job in
      let previewURL = Self.previewURL(job.id)
      return [
        "id": job.id,
        "name": job.name,
        "bytes": Double(job.bytes),
        "previewUri": FileManager.default.fileExists(atPath: previewURL.path) ? previewURL.absoluteString : "",
        "status": job.status.rawValue,
        "progress": job.progress,
        "attempt": job.attempt,
        "error": job.error,
      ]
    }
  }

  private func persistLocked() {
    guard let data = try? JSONEncoder().encode(jobs) else { return }
    try? data.write(to: Self.stateURL, options: .atomic)
  }

  private func scheduleEmitLocked() {
    guard !emitScheduled else { return }
    emitScheduled = true
    stateQueue.asyncAfter(deadline: .now() + 0.08) {
      self.emitScheduled = false
      let payload = self.snapshotLocked()
      let typed = self.jobs
      let observers = Array(self.jobObservers.values)
      DispatchQueue.main.async {
        self.onChange?(payload)
        UploadActivityController.shared.sync(jobs: typed)
        for observer in observers {
          observer(typed)
        }
      }
    }
  }
}

extension UploadCenter: URLSessionDataDelegate {
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64,
    totalBytesExpectedToSend: Int64
  ) {
    guard let jobId = task.taskDescription else { return }
    let fraction = totalBytesExpectedToSend > 0
      ? Double(totalBytesSent) / Double(totalBytesExpectedToSend)
      : 0
    stateQueue.async {
      self.updateJobLocked(jobId) { job in
        guard job.status == .queued || job.status == .uploading else { return }
        job.status = .uploading
        job.progress = min(1, fraction) * 0.5
      }
    }
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard let jobId = dataTask.taskDescription else { return }
    // Raw CR bytes can only be line endings here: JSON escapes any CR inside
    // string values, so stripping them normalizes CRLF streams safely.
    let cleaned = Data(data.filter { $0 != 0x0D })
    stateQueue.async {
      guard self.responses[jobId] != nil else { return }
      self.responses[jobId]?.buffer.append(cleaned)
      self.consumeStreamLocked(jobId: jobId)
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let jobId = task.taskDescription else { return }
    // A background session never calls the didReceive-response delegate (the
    // app may be suspended when the response arrives), so the status code is
    // only readable off the task at completion.
    let httpStatus = (task.response as? HTTPURLResponse)?.statusCode
    stateQueue.async { self.completeTaskLocked(jobId: jobId, error: error, httpStatus: httpStatus) }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    Task { @MainActor in
      UploadCenter.backgroundCompletionHandler?()
      UploadCenter.backgroundCompletionHandler = nil
    }
  }
}
