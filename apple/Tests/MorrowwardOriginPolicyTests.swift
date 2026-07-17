import Foundation
import XCTest
@testable import MorrowwardMac

final class MorrowwardOriginPolicyTests: XCTestCase {
    private let production = URL(string: "https://morrowward.vercel.app")!

    func testAllowsExactOriginPathsQueriesAndFragments() throws {
        let policy = try XCTUnwrap(MorrowwardOriginPolicy(origin: production))

        XCTAssertTrue(policy.contains(URL(string: "https://morrowward.vercel.app/practice?mode=sample#chart")!))
        XCTAssertTrue(policy.contains(URL(string: "https://MORROWWARD.VERCEL.APP/")!))
    }

    func testRejectsLookalikesDowngradesAndOtherPorts() throws {
        let policy = try XCTUnwrap(MorrowwardOriginPolicy(origin: production))

        XCTAssertFalse(policy.contains(URL(string: "https://morrowward.vercel.app.example.com")!))
        XCTAssertFalse(policy.contains(URL(string: "https://morrowward-vercel.app")!))
        XCTAssertFalse(policy.contains(URL(string: "http://morrowward.vercel.app")!))
        XCTAssertFalse(policy.contains(URL(string: "https://morrowward.vercel.app:444")!))
    }

    func testRecognizesOnlyBlobsCreatedByTheTrustedOrigin() throws {
        let policy = try XCTUnwrap(MorrowwardOriginPolicy(origin: production))

        XCTAssertTrue(policy.containsTrustedBlob(URL(string: "blob:https://morrowward.vercel.app/89F1B2")!))
        XCTAssertFalse(policy.containsTrustedBlob(URL(string: "blob:https://example.com/89F1B2")!))
    }

    func testOriginConfigurationMustBeAnOriginNotADeepLink() {
        XCTAssertNil(MorrowwardOriginPolicy(origin: URL(string: "file:///tmp/morrowward")!))
        XCTAssertNil(MorrowwardOriginPolicy(origin: URL(string: "https://morrowward.vercel.app/practice")!))
        XCTAssertNil(MorrowwardOriginPolicy(origin: URL(string: "https://user:secret@morrowward.vercel.app")!))
    }

    func testDebugOverrideKeepsProductionCanonicalAndAllowsOnlyLocalHTTP() {
        XCTAssertEqual(
            MorrowwardEnvironment.validatedDebugOrigin("https://morrowward.vercel.app"),
            production
        )
        XCTAssertNil(MorrowwardEnvironment.validatedDebugOrigin("http://morrowward.vercel.app"))
        XCTAssertNil(MorrowwardEnvironment.validatedDebugOrigin("https://morrowward.vercel.app:444"))
        XCTAssertNotNil(MorrowwardEnvironment.validatedDebugOrigin("http://127.0.0.1:4189"))
        XCTAssertNotNil(MorrowwardEnvironment.validatedDebugOrigin("http://localhost:4189"))
        XCTAssertNil(MorrowwardEnvironment.validatedDebugOrigin("http://192.168.1.20:4189"))
    }
}
