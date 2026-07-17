import Foundation
import Observation
import WebKit

@MainActor
@Observable
final class MorrowwardBrowserModel {
    enum LoadState: Equatable {
        case idle
        case loading
        case ready
        case failed
    }

    let page: WebPage
    let homeURL: URL

    private(set) var loadState: LoadState = .idle
    private(set) var hasLoadedContent = false
    private(set) var errorMessage: String?
    private(set) var pendingBackup: MorrowwardBackupPayload?

    @ObservationIgnored private var didStart = false
    @ObservationIgnored private var navigationMonitor: Task<Void, Never>?
    @ObservationIgnored private let backupBridge: MorrowwardBackupBridge

    init(origin: URL = MorrowwardEnvironment.resolvedOrigin) {
        self.homeURL = origin
        let backupBridge = MorrowwardBackupBridge()
        self.backupBridge = backupBridge

        var configuration = WebPage.Configuration()
        configuration.websiteDataStore = .default()
        configuration.applicationNameForUserAgent = "Morrowward Apple Companion/1.0"
        configuration.deviceSensorAuthorization = .init(decision: .deny)
        configuration.limitsNavigationsToAppBoundDomains = true
        configuration.upgradeKnownHostsToHTTPS = true
        configuration.userContentController.add(
            backupBridge,
            name: MorrowwardBackupBridge.messageName
        )
        configuration.userContentController.addUserScript(
            MorrowwardBackupBridge.exportUserScript
        )

        self.page = WebPage(
            configuration: configuration,
            navigationDecider: MorrowwardNavigationDecider(origin: origin)
        )
        self.page.isInspectable = _isDebugAssertConfiguration()
        backupBridge.onBackup = { [weak self] payload in
            self?.pendingBackup = payload
        }
    }

    var canGoBack: Bool {
        !page.backForwardList.backList.isEmpty
    }

    var canGoForward: Bool {
        !page.backForwardList.forwardList.isEmpty
    }

    var progress: Double {
        min(max(page.estimatedProgress, 0), 1)
    }

    var backupDocument: MorrowwardBackupDocument? {
        pendingBackup.map { MorrowwardBackupDocument(data: $0.data) }
    }

    var backupFilename: String {
        pendingBackup?.filename ?? "morrowward-backup.json"
    }

    func start() {
        guard !didStart else { return }
        didStart = true
        beginMonitoringNavigation()
        loadHome()
    }

    func stop() {
        navigationMonitor?.cancel()
        navigationMonitor = nil
        didStart = false
    }

    func loadHome() {
        prepareForNavigation()
        page.load(URLRequest(url: homeURL, cachePolicy: .useProtocolCachePolicy))
    }

    func reload() {
        prepareForNavigation()
        if page.url == nil {
            loadHome()
        } else {
            page.reload()
        }
    }

    func goBack() {
        guard let item = page.backForwardList.backList.last else { return }
        prepareForNavigation()
        page.load(item)
    }

    func goForward() {
        guard let item = page.backForwardList.forwardList.first else { return }
        prepareForNavigation()
        page.load(item)
    }

    func openInSystemBrowser() {
        let destination = page.url.flatMap { url in
            MorrowwardOriginPolicy(origin: homeURL)?.contains(url) == true ? url : nil
        } ?? homeURL
        SystemURLLauncher.open(destination)
    }

    func finishBackupExport() {
        pendingBackup = nil
    }

    private func prepareForNavigation() {
        errorMessage = nil
        loadState = .loading
        if navigationMonitor == nil {
            beginMonitoringNavigation()
        }
    }

    private func beginMonitoringNavigation() {
        navigationMonitor?.cancel()
        navigationMonitor = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                for try await event in page.navigations {
                    guard !Task.isCancelled else { return }
                    handle(event)
                }
            } catch {
                guard !Task.isCancelled else { return }
                handleNavigationFailure(error)
            }
        }
    }

    private func handle(_ event: WebPage.NavigationEvent) {
        switch event {
        case .startedProvisionalNavigation, .receivedServerRedirect:
            loadState = .loading
        case .committed:
            hasLoadedContent = true
            loadState = .loading
        case .finished:
            hasLoadedContent = true
            loadState = .ready
            errorMessage = nil
        @unknown default:
            break
        }
    }

    private func handleNavigationFailure(_ error: Error) {
        if Self.isExpectedCancellation(error) {
            loadState = hasLoadedContent ? .ready : .idle
            errorMessage = nil
            navigationMonitor = nil
            beginMonitoringNavigation()
            return
        }

        loadState = .failed
        errorMessage = Self.friendlyMessage(for: error)
        navigationMonitor = nil
    }

    private static func friendlyMessage(for error: Error) -> String {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain,
           nsError.code == NSURLErrorNotConnectedToInternet {
            return "You appear to be offline. Reconnect, then try again. Your saved Morrowward plan remains on this device."
        }

        return "Morrowward could not reach its secure web experience. Your saved plan remains on this device; retry when the connection is ready."
    }

    private static func isExpectedCancellation(_ error: Error) -> Bool {
        if let navigationError = error as? WebPage.NavigationError,
           case .failedProvisionalNavigation(let underlyingError) = navigationError {
            return isCancelledURLError(underlyingError)
        }
        return isCancelledURLError(error)
    }

    private static func isCancelledURLError(_ error: Error) -> Bool {
        let nsError = error as NSError
        return nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
    }
}
