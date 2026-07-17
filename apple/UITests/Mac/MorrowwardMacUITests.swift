import XCTest

@MainActor
final class MorrowwardMacUITests: XCTestCase {
    private let application = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testProductionExperiencePersistsAcrossRelaunch() throws {
        application.launch()

        XCTAssertTrue(
            application.webViews.firstMatch.waitForExistence(timeout: 30),
            "The production Morrowward experience did not load."
        )

        let todayHeading = text(containing: "Your future is still in motion")
        let samplePlan = button(containing: "Explore a sample plan")
        if samplePlan.waitForExistence(timeout: 8) {
            samplePlan.tap()
        }

        let skipWelcome = button(containing: "Skip welcome")
        if skipWelcome.waitForExistence(timeout: 10) {
            skipWelcome.tap()
        }

        XCTAssertTrue(todayHeading.waitForExistence(timeout: 30))

        let screenshot = XCTAttachment(screenshot: application.windows.firstMatch.screenshot())
        screenshot.name = "Morrowward Mac companion — Today"
        screenshot.lifetime = .keepAlways
        add(screenshot)

        application.terminate()
        application.launch()

        XCTAssertTrue(application.webViews.firstMatch.waitForExistence(timeout: 30))
        XCTAssertTrue(todayHeading.waitForExistence(timeout: 30), "The Mac-local plan did not survive an app relaunch.")
    }

    private func button(containing text: String) -> XCUIElement {
        application.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] %@ OR title CONTAINS[c] %@", text, text)
        ).firstMatch
    }

    private func text(containing text: String) -> XCUIElement {
        application.staticTexts.matching(
            NSPredicate(
                format: "label CONTAINS[c] %@ OR title CONTAINS[c] %@ OR value CONTAINS[c] %@",
                text,
                text,
                text
            )
        ).firstMatch
    }
}
