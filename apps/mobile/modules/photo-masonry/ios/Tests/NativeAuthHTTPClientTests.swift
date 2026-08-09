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
    XCTAssertEqual(
      request.value(forHTTPHeaderField: "Origin"),
      "\(AfilmoryBuildConfiguration.urlScheme)://"
    )
    let body = try XCTUnwrap(request.httpBody)
    let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
    XCTAssertEqual(payload["email"], "native@example.com")
    XCTAssertEqual(payload["password"], "secret")
    XCTAssertEqual(response.cookie, "afilmory-tenant.session=session-value")
  }

  func testDefaultAuthSessionDoesNotRetainAmbientCookies() {
    let configuration = AfilmoryURLSessionFactory.cookieIsolatedConfiguration()

    XCTAssertFalse(configuration.httpShouldSetCookies)
    XCTAssertNil(configuration.httpCookieStorage)
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

  func testOAuthCallbackCodeAndStateCanBeReadFromQueryOrFragment() throws {
    let queryCallback = try XCTUnwrap(
      URL(string: "afilmory:///auth/callback?state=query-state&code=single-use-code")
    )
    let fragmentCallback = try XCTUnwrap(
      URL(string: "afilmory:///auth/callback#state=fragment-state&code=fragment-code")
    )

    XCTAssertEqual(
      NativeAuthHTTPClient.oauthCallbackValue(named: "code", in: queryCallback),
      "single-use-code"
    )
    XCTAssertEqual(
      NativeAuthHTTPClient.oauthCallbackValue(named: "state", in: fragmentCallback),
      "fragment-state"
    )
    XCTAssertEqual(NativeAuthHTTPClient.oauthCallbackParameterNames(in: fragmentCallback), ["code", "state"])
  }

  @MainActor
  func testOAuthStateIsCryptographicallyRandomAndURLSafe() throws {
    let first = try NativeAuthorizationSessions.shared.makeOAuthState()
    let second = try NativeAuthorizationSessions.shared.makeOAuthState()

    XCTAssertEqual(first.count, 43)
    XCTAssertNotEqual(first, second)
    XCTAssertNotNil(first.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression))
  }

  func testOAuthStageErrorsExplainWhichSessionBoundaryFailed() {
    XCTAssertEqual(
      NativeAuthError.oauthCallbackMissingCode("GitHub").localizedDescription,
      "GitHub completed authorization, but the authentication server did not return a one-time sign-in code."
    )
    XCTAssertEqual(
      NativeAuthError.oauthSessionRejected("GitHub").localizedDescription,
      "GitHub completed authorization, but the returned session could not be validated."
    )
    XCTAssertEqual(
      NativeAuthError.oauthStateMismatch("GitHub").localizedDescription,
      "GitHub returned an authentication response that did not match this sign-in request."
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
