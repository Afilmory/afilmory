import CoreHaptics
import UIKit

// Discrete moments use the UIKit generators so they match pickers and toolbars
// elsewhere in the system. Only the stream drops to Core Haptics: repeated
// generator calls at the stream interval get coalesced into mush, and they
// cannot ramp intensity, which is the whole point of holding longer.
@MainActor
final class PhotoDetailReactionHaptics {
  private let selection = UISelectionFeedbackGenerator()
  private let soft = UIImpactFeedbackGenerator(style: .soft)
  private let rigid = UIImpactFeedbackGenerator(style: .rigid)
  private let notification = UINotificationFeedbackGenerator()

  private let supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics
  private var engine: CHHapticEngine?
  private var bed: CHHapticAdvancedPatternPlayer?

  func prepare() {
    selection.prepare()
    rigid.prepare()
  }

  func railPresented() {
    soft.impactOccurred()
    soft.prepare()
  }

  func crossedItem() {
    selection.selectionChanged()
    selection.prepare()
  }

  func singleSend() {
    rigid.impactOccurred(intensity: 0.85)
    rigid.prepare()
  }

  func failed() {
    notification.notificationOccurred(.error)
  }

  func streamBegan() {
    startEngine()
    playTransient(intensity: 0.5, sharpness: 0.4)
  }

  func streamShot(progress: CGFloat) {
    playTransient(intensity: 0.5 + 0.45 * Float(progress), sharpness: 0.45)
  }

  func streamCapped() {
    guard bed == nil, let engine else { return }
    let event = CHHapticEvent(
      eventType: .hapticContinuous,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.35),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.1),
      ],
      relativeTime: 0,
      duration: 30
    )
    guard let pattern = try? CHHapticPattern(events: [event], parameters: []),
          let player = try? engine.makeAdvancedPlayer(with: pattern)
    else { return }
    bed = player
    try? player.start(atTime: CHHapticTimeImmediate)
  }

  func streamEnded() {
    try? bed?.stop(atTime: CHHapticTimeImmediate)
    bed = nil
    engine?.stop()
    engine = nil
  }

  private func startEngine() {
    guard supportsHaptics, engine == nil else { return }
    guard let created = try? CHHapticEngine() else { return }
    // An interruption (a call, a route change) stops the engine for good unless
    // it is restarted from these handlers.
    created.stoppedHandler = { [weak self] _ in
      self?.engine = nil
      self?.bed = nil
    }
    created.resetHandler = { [weak created] in
      try? created?.start()
    }
    guard (try? created.start()) != nil else { return }
    engine = created
  }

  private func playTransient(intensity: Float, sharpness: Float) {
    guard let engine else { return }
    let event = CHHapticEvent(
      eventType: .hapticTransient,
      parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
      ],
      relativeTime: 0
    )
    guard let pattern = try? CHHapticPattern(events: [event], parameters: []),
          let player = try? engine.makePlayer(with: pattern)
    else { return }
    try? player.start(atTime: CHHapticTimeImmediate)
  }
}
