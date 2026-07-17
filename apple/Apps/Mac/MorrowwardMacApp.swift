import AppKit
import SwiftUI

@main
struct MorrowwardMacApp: App {
    var body: some Scene {
        WindowGroup {
            MorrowwardCompanionView()
        }
        .defaultSize(width: 1320, height: 900)
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About Morrowward") {
                    showMorrowwardAboutPanel()
                }
            }
        }
    }
}

@MainActor
private func showMorrowwardAboutPanel() {
    let paragraphStyle = NSMutableParagraphStyle()
    paragraphStyle.alignment = .center

    let mission = NSMutableAttributedString(
        string: "Helping you move toward financial freedom through daily discipline and financial education.\n\n",
        attributes: [
            .font: NSFont.systemFont(ofSize: NSFont.systemFontSize),
            .foregroundColor: NSColor.labelColor,
            .paragraphStyle: paragraphStyle,
        ]
    )
    mission.append(
        NSAttributedString(
            string: "Follow Dave online",
            attributes: [
                .font: NSFont.systemFont(ofSize: NSFont.systemFontSize, weight: .semibold),
                .foregroundColor: NSColor.linkColor,
                .link: URL(string: "https://thedavedev.com/")!,
                .paragraphStyle: paragraphStyle,
                .underlineStyle: NSUnderlineStyle.single.rawValue,
            ]
        )
    )

    NSApplication.shared.orderFrontStandardAboutPanel(options: [.credits: mission])
}
