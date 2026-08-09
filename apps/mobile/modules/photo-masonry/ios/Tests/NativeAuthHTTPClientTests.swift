import XCTest
@testable import Afilmory

final class NativeAuthHTTPClientTests: XCTestCase {
  private actor RequestRecorder {
    private(set) var request: URLRequest?

    func record(_ request: URLRequest) {
      self.request = request
    }
  }

  func testEncodableRequestReachesTransportWithJSONBody() async throws {
    struct Credentials: Encodable {
      let email: String
      let password: String
    }

    let recorder = RequestRecorder()
    let client = NativeAuthHTTPClient(transport: { request in
      await recorder.record(request)
      let response = try XCTUnwrap(
        HTTPURLResponse(
          url: request.url!,
          statusCode: 200,
          httpVersion: nil,
          headerFields: ["Set-Cookie": "afilmory-tenant.session=session-value; Path=/"]
        )
      )
      return (Data("{}".utf8), response)
    })

    let response = try await client.request(
      path: "auth/sign-in/email",
      method: "POST",
      body: Credentials(email: "native@example.com", password: "secret"),
      cookie: nil
    )

    let recordedRequest = await recorder.request
    let request = try XCTUnwrap(recordedRequest)
    XCTAssertEqual(request.url?.path, "/api/auth/sign-in/email")
    XCTAssertEqual(request.httpMethod, "POST")
    XCTAssertEqual(request.timeoutInterval, 15)
    XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
    let body = try XCTUnwrap(request.httpBody)
    let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
    XCTAssertEqual(payload["email"], "native@example.com")
    XCTAssertEqual(payload["password"], "secret")
    XCTAssertEqual(response.cookie, "afilmory-tenant.session=session-value")
  }

  func testOAuthCallbackErrorPreservesProviderDescriptionAndCode() throws {
    let callback = try XCTUnwrap(
      URL(
        string: "afilmory:///?error=configuration_error&error_description=GitHub%20OAuth%20is%20not%20configured"
      )
    )

    XCTAssertEqual(
      NativeAuthHTTPClient.oauthError(in: callback),
      "GitHub OAuth is not configured (configuration_error)"
    )
  }

  func testSignInFailureMessageIncludesUnderlyingReason() {
    let reason = "GitHub OAuth is not configured (configuration_error)"

    XCTAssertEqual(
      NativeAuthFailureMessage.text(for: NativeAuthError.server(reason)),
      reason
    )
  }
}
