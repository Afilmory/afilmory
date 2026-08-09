import SwiftUI

enum CommentFlightMotion {
  static let visualDuration: TimeInterval = 0.4
  static let targetFallbackTimeout: TimeInterval = 0.9
  static let targetSettleDelay: TimeInterval = 0.05
  static let verticalPositionDelay: TimeInterval = 0.055
  static let scaleUpDelay: TimeInterval = 0.185

  static func positionSpring(reduceMotion: Bool) -> Spring {
    Spring(
      mass: 1,
      stiffness: 141.75909,
      damping: reduceMotion ? 23.8125 : 17.35028
    )
  }

  static func scaleDownSpring(reduceMotion: Bool) -> Spring {
    Spring(
      mass: 2,
      stiffness: 310,
      damping: reduceMotion ? 49.7996 : 38
    )
  }

  static func scaleUpSpring(reduceMotion: Bool) -> Spring {
    Spring(
      mass: 2,
      stiffness: 320,
      damping: reduceMotion ? 50.5964 : 38
    )
  }

  static func animationFallbackTimeout(reduceMotion: Bool) -> TimeInterval {
    let positionEnd = verticalPositionDelay + positionSpring(reduceMotion: reduceMotion).settlingDuration
    let scaleEnd = scaleUpDelay + scaleUpSpring(reduceMotion: reduceMotion).settlingDuration
    return max(visualDuration, positionEnd, scaleEnd) + 0.2
  }
}

enum CommentFlightMath {
  private static let channelSpeed: CGFloat = 2
  private static let minimumScale: CGFloat = 0.7
  private static let maximumScale: CGFloat = 0.9
  private static let maximumEntryHeightMultiple: CGFloat = 7
  private static let bubbleFadeFraction: CGFloat = 1 / 3
  private static let textMaskFadeFraction: CGFloat = 0.3 / 0.4
  private static let sendButtonScaleFraction: CGFloat = 0.25 / 0.4

  static func clampedProgress(_ progress: CGFloat) -> CGFloat {
    min(1, max(0, progress))
  }

  static func interpolate(from start: CGFloat, to end: CGFloat, progress: CGFloat) -> CGFloat {
    let progress = clampedProgress(progress)
    return start + (end - start) * progress
  }

  static func interpolateUnclamped(from start: CGFloat, to end: CGFloat, progress: CGFloat) -> CGFloat {
    start + (end - start) * progress
  }

  static func boundsProgress(_ progress: CGFloat) -> CGFloat {
    cubicBezier(
      x1: 0.542,
      y1: 0,
      x2: 0.58,
      y2: 1,
      progress: spedProgress(progress)
    )
  }

  static func interpolatedRect(
    from source: CGRect,
    to target: CGRect,
    horizontalProgress: CGFloat,
    verticalProgress: CGFloat,
    boundsProgress: CGFloat
  ) -> CGRect {
    let width = interpolate(from: source.width, to: target.width, progress: boundsProgress)
    let height = interpolate(from: source.height, to: target.height, progress: boundsProgress)
    let trailingEdge = interpolateUnclamped(
      from: source.maxX,
      to: target.maxX,
      progress: horizontalProgress
    )
    let centerY = interpolateUnclamped(
      from: source.midY,
      to: target.midY,
      progress: verticalProgress
    )

    return CGRect(
      x: trailingEdge - width,
      y: centerY - height / 2,
      width: width,
      height: height
    )
  }

  static func scaleDownFactor(entryHeight: CGFloat, defaultHeight: CGFloat) -> CGFloat {
    guard defaultHeight > 0 else { return minimumScale }
    let heightRange = defaultHeight * (maximumEntryHeightMultiple - 1)
    let heightProgress = clampedProgress((entryHeight - defaultHeight) / heightRange)
    return interpolate(
      from: minimumScale,
      to: maximumScale,
      progress: heightProgress
    )
  }

  static func glassBubbleScale(
    entryHeight: CGFloat,
    defaultHeight: CGFloat,
    scaleDownProgress: CGFloat,
    scaleUpProgress: CGFloat
  ) -> CGFloat {
    let scaleDownFactor = scaleDownFactor(entryHeight: entryHeight, defaultHeight: defaultHeight)
    let down = interpolateUnclamped(from: 1, to: scaleDownFactor, progress: scaleDownProgress)
    let up = interpolateUnclamped(from: 1, to: 1 / scaleDownFactor, progress: scaleUpProgress)
    return down * up
  }

  static func bubbleOpacity(_ progress: CGFloat) -> CGFloat {
    clampedProgress(progress / bubbleFadeFraction)
  }

  static func whiteTextMaskOpacity(_ progress: CGFloat) -> CGFloat {
    let fadeProgress = clampedProgress(progress / textMaskFadeFraction)
    return 1 - cubicBezier(
      x1: 0.5,
      y1: 0,
      x2: 0.5,
      y2: 1,
      progress: fadeProgress
    )
  }

  static func sendButtonScale(_ progress: CGFloat) -> CGFloat {
    let scaleProgress = clampedProgress(progress / sendButtonScaleFraction)
    return 1 - cubicBezier(
      x1: 0.42,
      y1: 0,
      x2: 0.58,
      y2: 1,
      progress: scaleProgress
    )
  }

  private static func spedProgress(_ progress: CGFloat) -> CGFloat {
    clampedProgress(progress * channelSpeed)
  }

  private static func cubicBezier(
    x1: CGFloat,
    y1: CGFloat,
    x2: CGFloat,
    y2: CGFloat,
    progress: CGFloat
  ) -> CGFloat {
    let progress = clampedProgress(progress)
    guard progress > 0, progress < 1 else { return progress }

    var lower: CGFloat = 0
    var upper: CGFloat = 1
    var parameter = progress

    for _ in 0..<20 {
      let estimatedX = cubicCoordinate(parameter, control1: x1, control2: x2)
      if abs(estimatedX - progress) < 0.000_001 {
        break
      }
      if estimatedX < progress {
        lower = parameter
      } else {
        upper = parameter
      }
      parameter = (lower + upper) / 2
    }

    return cubicCoordinate(parameter, control1: y1, control2: y2)
  }

  private static func cubicCoordinate(
    _ parameter: CGFloat,
    control1: CGFloat,
    control2: CGFloat
  ) -> CGFloat {
    let inverse = 1 - parameter
    return 3 * inverse * inverse * parameter * control1
      + 3 * inverse * parameter * parameter * control2
      + parameter * parameter * parameter
  }

  static func isValidLandingTarget(from source: CGRect, to target: CGRect) -> Bool {
    guard source.width > 0,
          source.height > 0,
          target.width > 0,
          target.height > 0,
          target.minY >= 0
    else { return false }

    // A row measured before scroll-to-bottom settles can still be underneath the
    // composer. A real landing bubble is always fully above the composer chrome.
    return target.maxY <= source.minY
  }
}

private struct CommentFlightBubbleShape: InsettableShape {
  var progress: CGFloat
  var inset: CGFloat = 0

  var animatableData: AnimatablePair<CGFloat, CGFloat> {
    get { AnimatablePair(progress, inset) }
    set {
      progress = newValue.first
      inset = newValue.second
    }
  }

  func inset(by amount: CGFloat) -> CommentFlightBubbleShape {
    var next = self
    next.inset += amount
    return next
  }

  func path(in rect: CGRect) -> Path {
    let progress = CommentFlightMath.clampedProgress(progress)
    let regularRadius = max(
      0,
      CommentFlightMath.interpolate(
        from: CommentComposerMetrics.cornerRadius,
        to: CommentBubbleMetrics.cornerRadius,
        progress: progress
      ) - inset
    )
    let trailingRadius = max(
      0,
      CommentFlightMath.interpolate(
        from: CommentComposerMetrics.cornerRadius,
        to: CommentBubbleMetrics.tailRadius,
        progress: progress
      ) - inset
    )

    return UnevenRoundedRectangle(
      topLeadingRadius: regularRadius,
      bottomLeadingRadius: regularRadius,
      bottomTrailingRadius: trailingRadius,
      topTrailingRadius: regularRadius,
      style: .continuous
    )
    .path(in: rect.insetBy(dx: inset, dy: inset))
  }
}

private struct CommentFlightSurface: View, @MainActor Animatable {
  let content: String
  let source: CGRect
  let target: CGRect
  var horizontalProgress: CGFloat
  var verticalProgress: CGFloat
  var visualProgress: CGFloat
  var scaleDownProgress: CGFloat
  var scaleUpProgress: CGFloat

  @Environment(\.displayScale) private var displayScale

  typealias PositionData = AnimatablePair<CGFloat, CGFloat>
  typealias ScaleData = AnimatablePair<CGFloat, CGFloat>
  typealias VisualData = AnimatablePair<CGFloat, ScaleData>
  typealias FlightData = AnimatablePair<PositionData, VisualData>

  var animatableData: FlightData {
    get {
      FlightData(
        PositionData(horizontalProgress, verticalProgress),
        VisualData(visualProgress, ScaleData(scaleDownProgress, scaleUpProgress))
      )
    }
    set {
      horizontalProgress = newValue.first.first
      verticalProgress = newValue.first.second
      visualProgress = newValue.second.first
      scaleDownProgress = newValue.second.second.first
      scaleUpProgress = newValue.second.second.second
    }
  }

  var body: some View {
    let visualProgress = CommentFlightMath.clampedProgress(visualProgress)
    let boundsProgress = CommentFlightMath.boundsProgress(visualProgress)
    let rect = CommentFlightMath.interpolatedRect(
      from: source,
      to: target,
      horizontalProgress: horizontalProgress,
      verticalProgress: verticalProgress,
      boundsProgress: boundsProgress
    )
    let shape = CommentFlightBubbleShape(progress: boundsProgress)
    let leadingInset = CommentFlightMath.interpolate(
      from: CommentComposerMetrics.sourceLeadingInset,
      to: CommentBubbleMetrics.horizontalInset,
      progress: boundsProgress
    )
    let trailingInset = CommentFlightMath.interpolate(
      from: CommentComposerMetrics.sourceTrailingInset,
      to: CommentBubbleMetrics.horizontalInset,
      progress: boundsProgress
    )
    let verticalInset = CommentFlightMath.interpolate(
      from: CommentComposerMetrics.sourceVerticalInset,
      to: CommentBubbleMetrics.verticalInset,
      progress: boundsProgress
    )
    let contentWidth = max(1, rect.width - leadingInset - trailingInset)
    let contentHeight = max(1, rect.height - verticalInset * 2)
    let bubbleOpacity = CommentFlightMath.bubbleOpacity(visualProgress)
    let sourceOpacity = 1 - bubbleOpacity
    let whiteTextMaskOpacity = CommentFlightMath.whiteTextMaskOpacity(visualProgress)
    let sendButtonScale = CommentFlightMath.sendButtonScale(visualProgress)
    let bubbleScale = CommentFlightMath.glassBubbleScale(
      entryHeight: source.height,
      defaultHeight: CommentComposerMetrics.minimumHeight,
      scaleDownProgress: scaleDownProgress,
      scaleUpProgress: scaleUpProgress
    )

    ZStack(alignment: .topLeading) {
      ZStack(alignment: .topLeading) {
        shape.fill(Color(.secondarySystemFill)).opacity(sourceOpacity)
        shape.fill(Color.accentColor).opacity(bubbleOpacity)
        shape.strokeBorder(
          Color(.separator).opacity(sourceOpacity),
          lineWidth: 1 / displayScale
        )

        Text(content)
          .font(.system(size: CommentComposerMetrics.textSize))
          .foregroundStyle(.primary)
          .lineLimit(5)
          .opacity(whiteTextMaskOpacity)
          .frame(width: contentWidth, height: contentHeight, alignment: .topLeading)
          .position(
            x: leadingInset + contentWidth / 2,
            y: verticalInset + contentHeight / 2
          )
          .clipped()

        // CommentBubbleSurface centers short content inside its minimum height.
        // Match that layout here so the overlay-to-cell handoff is pixel-stable.
        CommentBubbleText(content, own: true)
          .lineLimit(5)
          .opacity(bubbleOpacity)
          .frame(width: contentWidth, height: contentHeight, alignment: .leading)
          .position(
            x: leadingInset + contentWidth / 2,
            y: verticalInset + contentHeight / 2
          )
          .clipped()
      }
      .frame(width: rect.width, height: rect.height)
      .clipShape(shape)
      .scaleEffect(bubbleScale)

      ZStack {
        Circle().fill(Color.accentColor)
        Image(systemName: "arrow.up")
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(.white)
      }
      .frame(
        width: CommentComposerMetrics.sendButtonSize,
        height: CommentComposerMetrics.sendButtonSize
      )
      .position(
        x: rect.width - CommentComposerMetrics.chromeInset
          - CommentComposerMetrics.sendButtonSize / 2,
        y: rect.height - CommentComposerMetrics.chromeInset
          - CommentComposerMetrics.sendButtonSize / 2
      )
      .scaleEffect(sendButtonScale)
    }
    .frame(width: rect.width, height: rect.height)
    .position(x: rect.midX, y: rect.midY)
  }
}

private struct CommentFlightStartTrigger: Equatable {
  let target: CGRect?
  let scrollPending: Bool
}

struct CommentSendFlightOverlay: View {
  let store: CommentsStore
  let clientId: String
  let content: String

  @State private var horizontalProgress: CGFloat = 0
  @State private var verticalProgress: CGFloat = 0
  @State private var visualProgress: CGFloat = 0
  @State private var scaleDownProgress: CGFloat = 0
  @State private var scaleUpProgress: CGFloat = 0
  @State private var started = false
  @State private var lockedTarget: CGRect?

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ZStack(alignment: .topLeading) {
      if let flight = activeFlight {
        CommentFlightSurface(
          content: content,
          source: flight.origin,
          target: lockedTarget ?? flight.target ?? flight.origin,
          horizontalProgress: horizontalProgress,
          verticalProgress: verticalProgress,
          visualProgress: visualProgress,
          scaleDownProgress: scaleDownProgress,
          scaleUpProgress: scaleUpProgress
        )
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
    .task(id: startTrigger) {
      await startWhenTargetSettles(startTrigger)
    }
    .task(id: started) {
      let timeout = started
        ? CommentFlightMotion.animationFallbackTimeout(reduceMotion: reduceMotion)
        : CommentFlightMotion.targetFallbackTimeout
      try? await Task.sleep(for: .seconds(timeout))
      guard !Task.isCancelled else { return }
      guard store.flight?.clientId == clientId else { return }
      store.completeFlight(clientId)
    }
  }

  private var activeFlight: CommentFlight? {
    guard let flight = store.flight, flight.clientId == clientId else { return nil }
    return flight
  }

  private var startTrigger: CommentFlightStartTrigger {
    CommentFlightStartTrigger(
      target: activeFlight?.target,
      scrollPending: store.pendingScrollIdentity == clientId
    )
  }

  @MainActor
  private func startWhenTargetSettles(_ trigger: CommentFlightStartTrigger) async {
    guard !started,
          !trigger.scrollPending,
          let flight = activeFlight,
          let target = trigger.target,
          CommentFlightMath.isValidLandingTarget(from: flight.origin, to: target)
    else { return }

    do {
      try await Task.sleep(for: .seconds(CommentFlightMotion.targetSettleDelay))
    } catch {
      return
    }

    guard !Task.isCancelled,
          !started,
          store.pendingScrollIdentity != clientId,
          let currentFlight = activeFlight,
          currentFlight.target == target,
          CommentFlightMath.isValidLandingTarget(from: currentFlight.origin, to: target)
    else { return }

    lockedTarget = target
    started = true
    store.lockFlight(clientId)

    let positionSpring = CommentFlightMotion.positionSpring(reduceMotion: reduceMotion)
    let scaleDownSpring = CommentFlightMotion.scaleDownSpring(reduceMotion: reduceMotion)
    let scaleUpSpring = CommentFlightMotion.scaleUpSpring(reduceMotion: reduceMotion)

    withAnimation(.interpolatingSpring(positionSpring)) {
      horizontalProgress = 1
    }
    withAnimation(
      .interpolatingSpring(positionSpring)
        .delay(CommentFlightMotion.verticalPositionDelay)
    ) {
      verticalProgress = 1
    }
    withAnimation(.linear(duration: CommentFlightMotion.visualDuration)) {
      visualProgress = 1
    }
    withAnimation(.interpolatingSpring(scaleDownSpring)) {
      scaleDownProgress = 1
    }
    withAnimation(
      .interpolatingSpring(scaleUpSpring)
        .delay(CommentFlightMotion.scaleUpDelay),
      completionCriteria: .removed
    ) {
      scaleUpProgress = 1
    } completion: {
      store.completeFlight(clientId)
    }
  }
}
