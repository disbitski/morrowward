import XCTest

@MainActor
final class MorrowwardIOSUITests: XCTestCase {
    private let application = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testOnboardingPersistsAcrossRelaunch() throws {
        application.launch()

        let webView = application.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 30), "The production Morrowward experience did not load.")

        let onboardingHeading = text(containing: "Meet me where I am")
        let todayHeading = text(containing: "Your future is still in motion")

        if onboardingHeading.waitForExistence(timeout: 8) {
            tap(selectable(containing: "New to investing"), in: webView)
            tap(button(named: "Continue"), in: webView)

            let atmosphereHeading = text(containing: "Choose your atmosphere")
            XCTAssertTrue(atmosphereHeading.waitForExistence(timeout: 10))
            tap(selectable(containing: "Horizon"), in: webView)
            tap(button(named: "Continue"), in: webView)

            let planHeading = text(containing: "Sketch my first plan")
            XCTAssertTrue(planHeading.waitForExistence(timeout: 10))
            tap(button(containing: "Reveal my horizon"), in: webView)
        }

        let skipWelcome = button(containing: "Skip welcome")
        if skipWelcome.waitForExistence(timeout: 10) {
            tap(skipWelcome, in: webView)
        }

        XCTAssertTrue(todayHeading.waitForExistence(timeout: 30))

        let screenshot = XCTAttachment(screenshot: application.screenshot())
        screenshot.name = "Morrowward iPhone companion — Today"
        screenshot.lifetime = .keepAlways
        add(screenshot)

        application.terminate()
        application.launch()

        XCTAssertTrue(application.webViews.firstMatch.waitForExistence(timeout: 30))
        XCTAssertTrue(todayHeading.waitForExistence(timeout: 30), "The local plan did not survive an app relaunch.")
        XCTAssertFalse(onboardingHeading.exists, "Onboarding unexpectedly returned after relaunch.")
    }

    private func button(named name: String) -> XCUIElement {
        application.buttons.matching(NSPredicate(format: "label ==[c] %@", name)).firstMatch
    }

    private func button(containing text: String) -> XCUIElement {
        application.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    private func selectable(containing text: String) -> XCUIElement {
        application.switches.matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    private func text(containing text: String) -> XCUIElement {
        application.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    private func tap(_ element: XCUIElement, in webView: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 15), "Missing element: \(element)")

        for _ in 0..<8 where !element.isHittable {
            webView.swipeUp()
        }

        XCTAssertTrue(element.isHittable, "Element was not tappable: \(element)")
        element.tap()
    }
}
