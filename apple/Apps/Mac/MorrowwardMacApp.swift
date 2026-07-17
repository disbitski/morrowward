import SwiftUI

@main
struct MorrowwardMacApp: App {
    var body: some Scene {
        WindowGroup {
            MorrowwardCompanionView()
        }
        .defaultSize(width: 1320, height: 900)
        .windowResizability(.contentMinSize)
    }
}
