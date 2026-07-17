import Foundation
import WebKit

@MainActor
final class MorrowwardNavigationDecider: WebPage.NavigationDeciding {
    private let originPolicy: MorrowwardOriginPolicy

    init(origin: URL) {
        guard let originPolicy = MorrowwardOriginPolicy(origin: origin) else {
            preconditionFailure("Morrowward requires a valid HTTP(S) origin.")
        }
        self.originPolicy = originPolicy
    }

    func decidePolicy(
        for action: WebPage.NavigationAction,
        preferences: inout WebPage.NavigationPreferences
    ) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else {
            return .cancel
        }

        if action.shouldPerformDownload,
           originPolicy.contains(url) || originPolicy.containsTrustedBlob(url) {
            return .download
        }

        if originPolicy.contains(url) || originPolicy.containsTrustedBlob(url) {
            return .allow
        }

        let scheme = url.scheme?.lowercased()
        let isWebLink = scheme == "https" || scheme == "http"
        if isWebLink && action.navigationType == .linkActivated {
            SystemURLLauncher.open(url)
        }

        return .cancel
    }
}
