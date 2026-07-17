import Foundation
import XCTest
@testable import MorrowwardMac

final class MorrowwardBackupPayloadTests: XCTestCase {
    func testDecodesBackupAndSanitizesFilename() throws {
        let json = Data(#"{"version":1}"#.utf8)
        let payload = try XCTUnwrap(
            MorrowwardBackupPayload(
                messageBody: [
                    "filename": "../morrowward backup",
                    "base64": json.base64EncodedString()
                ]
            )
        )

        XCTAssertEqual(payload.data, json)
        XCTAssertEqual(payload.filename, "morrowwardbackup.json")
    }

    func testRejectsMalformedAndOversizedMessages() {
        XCTAssertNil(MorrowwardBackupPayload(messageBody: ["base64": "not base64"]))

        let oversized = Data(count: MorrowwardBackupPayload.maximumByteCount + 1)
        XCTAssertNil(
            MorrowwardBackupPayload(
                messageBody: ["base64": oversized.base64EncodedString()]
            )
        )
    }
}
