import XCTest
@testable import Afilmory

final class StudioSSEFramerTests: XCTestCase {
  func testNextEventBoundaryFlushesThePreviousFrameWhenBlankLinesAreMissing() {
    var framer = StudioSSEFramer()

    XCTAssertNil(framer.consume("event: progress"))
    XCTAssertNil(framer.consume("data: {\"type\":\"start\"}"))
    XCTAssertEqual(
      framer.consume("event: progress"),
      StudioSSEFrame(event: "progress", data: "{\"type\":\"start\"}")
    )
    XCTAssertNil(framer.consume("data: {\"type\":\"complete\"}"))
    XCTAssertEqual(
      framer.finish(),
      StudioSSEFrame(event: "progress", data: "{\"type\":\"complete\"}")
    )
  }

  func testBlankLineFlushesMultilineData() {
    var framer = StudioSSEFramer()

    XCTAssertNil(framer.consume("event: progress\r"))
    XCTAssertNil(framer.consume("data: first"))
    XCTAssertNil(framer.consume("data: second"))
    XCTAssertEqual(
      framer.consume(""),
      StudioSSEFrame(event: "progress", data: "first\nsecond")
    )
  }
}
